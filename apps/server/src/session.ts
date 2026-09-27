import { DurableObject } from 'cloudflare:workers'
import type {
  BoardEntry,
  BoardRun,
  LoggedCommand,
  SessionInfo,
  SessionResult,
  SessionStatus,
  SubmitOutcome,
} from '@flow/sim'

/**
 * One presentation: a seed, a length, and everyone who played it.
 *
 * One object per session code, so a room's leaderboard is strongly consistent
 * and two rooms never contend. It stores results and never computes them — the
 * Worker replays each run before it gets here, in parallel, rather than
 * queueing a whole room's replays behind one object.
 */

/** Sessions are for one talk. A week later nobody is coming back for them. */
const EXPIRE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

type Row = {
  player_id: string
  name: string
  score: number
  shipped: number
  avg_quality: number
  avg_lead_time: number
  runs: number
  submitted_at: number
}

export class Session extends DurableObject<Record<string, unknown>> {
  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          code TEXT NOT NULL,
          seed INTEGER NOT NULL,
          ticks INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS players (
          player_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          joined_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS results (
          player_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          score REAL NOT NULL,
          shipped INTEGER NOT NULL,
          avg_quality REAL NOT NULL,
          avg_lead_time INTEGER NOT NULL,
          commands TEXT NOT NULL,
          runs INTEGER NOT NULL,
          submitted_at INTEGER NOT NULL
        );
      `)
    })
  }

  /** Claims this code. False if someone already has it. */
  async create(code: string, seed: number, ticks: number): Promise<SessionInfo | null> {
    if (this.readInfo() !== null) return null
    const createdAt = Date.now()
    this.ctx.storage.sql.exec(
      'INSERT INTO meta (id, code, seed, ticks, created_at) VALUES (1, ?, ?, ?, ?)',
      code,
      seed,
      ticks,
      createdAt,
    )
    await this.ctx.storage.setAlarm(createdAt + EXPIRE_AFTER_MS)
    return { code, seed, ticks, createdAt }
  }

  async info(): Promise<SessionStatus | null> {
    const info = this.readInfo()
    return info === null ? null : { ...info, joined: this.joinedCount(), finished: this.playerCount() }
  }

  /**
   * A player has the seed and is playing. Recorded so the presenter's screen
   * can show the room arriving long before anyone has a score.
   */
  async join(playerId: string, name: string): Promise<void> {
    this.ctx.storage.sql.exec(
      `INSERT INTO players (player_id, name, joined_at) VALUES (?, ?, ?)
       ON CONFLICT (player_id) DO UPDATE SET name = excluded.name`,
      playerId,
      name,
      Date.now(),
    )
  }

  /**
   * Keeps each player's best run, and counts every finished one, so the board
   * can show who played the game through more than once.
   */
  async submit(
    playerId: string,
    name: string,
    result: SessionResult,
    commands: LoggedCommand[],
  ): Promise<SubmitOutcome> {
    const now = Date.now()
    await this.join(playerId, name)
    this.ctx.storage.sql.exec(
      `INSERT INTO results
         (player_id, name, score, shipped, avg_quality, avg_lead_time, commands, runs, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT (player_id) DO UPDATE SET
         name = excluded.name,
         runs = results.runs + 1,
         score        = CASE WHEN excluded.score > results.score THEN excluded.score        ELSE results.score END,
         shipped      = CASE WHEN excluded.score > results.score THEN excluded.shipped      ELSE results.shipped END,
         avg_quality  = CASE WHEN excluded.score > results.score THEN excluded.avg_quality  ELSE results.avg_quality END,
         avg_lead_time= CASE WHEN excluded.score > results.score THEN excluded.avg_lead_time ELSE results.avg_lead_time END,
         commands     = CASE WHEN excluded.score > results.score THEN excluded.commands     ELSE results.commands END,
         submitted_at = CASE WHEN excluded.score > results.score THEN excluded.submitted_at ELSE results.submitted_at END`,
      playerId,
      name,
      result.score,
      result.shipped,
      result.avgQuality,
      result.avgLeadTimeTicks,
      JSON.stringify(commands),
      now,
    )

    const best = toEntry(
      this.ctx.storage.sql
        .exec<Row>('SELECT * FROM results WHERE player_id = ?', playerId)
        .one(),
    )
    const ahead = this.ctx.storage.sql
      .exec<{ n: number }>(
        'SELECT COUNT(*) AS n FROM results WHERE score > ? OR (score = ? AND submitted_at < ?)',
        best.score,
        best.score,
        best.submittedAt,
      )
      .one().n
    return { result, best, rank: ahead + 1, players: this.playerCount() }
  }

  async board(): Promise<BoardEntry[]> {
    // Ties go to whoever got there first, which is also what `submit` ranks by.
    return this.ctx.storage.sql
      .exec<Row>('SELECT * FROM results ORDER BY score DESC, submitted_at ASC LIMIT 200')
      .toArray()
      .map(toEntry)
  }

  /** The run behind a board entry, for the debrief. */
  async run(playerId: string): Promise<BoardRun | null> {
    const row = this.ctx.storage.sql
      .exec<Row & { commands: string }>('SELECT * FROM results WHERE player_id = ?', playerId)
      .toArray()[0]
    if (row === undefined) return null
    return { ...toEntry(row), commands: JSON.parse(row.commands) as LoggedCommand[] }
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }

  private readInfo(): SessionInfo | null {
    const row = this.ctx.storage.sql
      .exec<{ code: string; seed: number; ticks: number; created_at: number }>(
        'SELECT code, seed, ticks, created_at FROM meta WHERE id = 1',
      )
      .toArray()[0]
    return row === undefined
      ? null
      : { code: row.code, seed: row.seed, ticks: row.ticks, createdAt: row.created_at }
  }

  private joinedCount(): number {
    return this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM players').one().n
  }

  private playerCount(): number {
    return this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM results').one().n
  }
}

function toEntry(row: Row): BoardEntry {
  return {
    playerId: row.player_id,
    name: row.name,
    score: row.score,
    shipped: row.shipped,
    avgQuality: row.avg_quality,
    avgLeadTimeTicks: row.avg_lead_time,
    runs: row.runs,
    submittedAt: row.submitted_at,
  }
}
