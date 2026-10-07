import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TUNING } from '@flow/content'
import { RULES_VERSION, parseSave, type LoadVerdict, type SaveFile } from '@flow/sim'
import type { SimHandle } from '../bridge/useSim.js'

const TICKS_PER_DAY = DEFAULT_TUNING.ticksPerHour * 8

/** How long "Saved" stays on screen. Long enough to read the file name. */
const SAVED_NOTICE_MS = 5000

type Notice =
  | { kind: 'saved'; fileName: string; day: string }
  | { kind: 'loading' }
  | { kind: 'loaded'; save: SaveFile; verdict: LoadVerdict }
  | { kind: 'refused'; error: string }

/**
 * Save and Load (M1 slice 4).
 *
 * A save is a file the player keeps, not something the browser remembers for
 * them: it is the bug-report format too (plan §1), and a file can be sent to
 * someone. Loading always says what it found, because a save replays under
 * today's rules and those may not be the rules it was played under.
 */
export function SaveLoad({ sim }: { sim: SimHandle }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (notice?.kind !== 'saved') return
    const timer = setTimeout(() => setNotice(null), SAVED_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const save = () => {
    const file = sim.save()
    const day = dayOf(file.tick)
    // Named for the Day the top bar showed, so the file says what the player saw.
    const fileName = `flow-state-${file.seed}-day${day}.json`
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(file)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    // In the document, because Firefox and older iOS Safari ignore a click on
    // a link that is not.
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Safari reads the blob after the click returns, so it is not revoked at once.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setNotice({ kind: 'saved', fileName, day })
  }

  const load = async (file: File) => {
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      setNotice({ kind: 'refused', error: 'this is not a Flow State save' })
      return
    }
    const parsed = parseSave(raw)
    if (!parsed.ok) {
      setNotice({ kind: 'refused', error: parsed.error })
      return
    }
    // A long save takes a moment to replay. Let the message paint first.
    setNotice({ kind: 'loading' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    const verdict = sim.load(parsed.save)
    setNotice({ kind: 'loaded', save: parsed.save, verdict })
  }

  return (
    <>
      <button type="button" className="btn" onClick={save}>
        Save
      </button>
      <button type="button" className="btn" onClick={() => input.current?.click()}>
        Load
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Load a saved game"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Cleared so picking the same file again still fires a change.
          e.target.value = ''
          if (file) void load(file)
        }}
      />
      {notice && <NoticeView notice={notice} sim={sim} close={() => setNotice(null)} />}
    </>
  )
}

function NoticeView({ notice, sim, close }: { notice: Notice; sim: SimHandle; close: () => void }) {
  if (notice.kind === 'saved') {
    return (
      <div className="toast" role="status">
        Saved day {notice.day} — <span className="toast__file">{notice.fileName}</span>
      </div>
    )
  }

  if (notice.kind === 'loading') {
    return (
      <div className="overlay" role="dialog" aria-label="Loading">
        <div className="card saveload">Replaying your run…</div>
      </div>
    )
  }

  if (notice.kind === 'refused') {
    return (
      <div className="overlay" role="dialog" aria-label="Could not load">
        <div className="card saveload">
          <h2 className="saveload__title">Couldn’t load that file</h2>
          <p>
            {capitalise(notice.error)}. Your game is as you left it.
          </p>
          <div className="saveload__actions">
            <button type="button" className="btn btn--primary" onClick={close}>
              OK
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { save, verdict } = notice
  const day = dayOf(save.tick)
  const playOn = () => {
    sim.setPaused(false)
    close()
  }

  return (
    <div className="overlay" role="dialog" aria-label="Loaded">
      <div className={verdict.kind === 'same' ? 'card saveload' : 'card saveload saveload--changed'}>
        <h2 className="saveload__title">
          {verdict.kind === 'same' && `Loaded day ${day}`}
          {verdict.kind === 'rulesChanged' && `Loaded day ${day}, under different rules`}
          {verdict.kind === 'runChanged' && `Loaded, but it is not the game you saved`}
        </h2>

        {verdict.kind === 'same' && (
          <p>
            Seed {save.seed}. Paused, so you can look around before playing on.
          </p>
        )}

        {verdict.kind === 'rulesChanged' && (
          <p>
            Saved under rules v{verdict.savedRules}
            {stamp(save)}, and this game runs v{RULES_VERSION}. Your run to day {day} replays
            exactly, but from here it plays under v{RULES_VERSION}.
          </p>
        )}

        {verdict.kind === 'runChanged' && (
          <>
            <p>
              {verdict.savedRules === RULES_VERSION
                ? `Saved${stamp(save) || ' on an earlier build'}, and the game has changed since.`
                : `Saved under rules v${verdict.savedRules}${stamp(save)}, and this game runs v${RULES_VERSION}.`}{' '}
              Its rules replay your decisions to a different day {day}:
            </p>
            <div className="saveload__compare">
              <span>
                then <Outcome {...verdict.then} />
              </span>
              <span>
                now <Outcome {...verdict.now} />
              </span>
            </div>
            <p>You are playing this version from here.</p>
          </>
        )}

        <div className="saveload__actions">
          <button type="button" className="btn btn--primary" onClick={playOn}>
            Play on
          </button>
          <button type="button" className="btn" onClick={close}>
            Stay paused
          </button>
        </div>
      </div>
    </div>
  )
}

/** Average quality means nothing over no items, so it is not shown for none. */
function Outcome({ shipped, avgQuality }: { shipped: number; avgQuality: number }) {
  if (shipped === 0) return <>nothing shipped</>
  return (
    <>
      <b>{shipped}</b> shipped at <b>{Math.round(avgQuality * 100)}%</b>
    </>
  )
}

/** The Day the top bar shows in free play. */
function dayOf(tick: number): string {
  return (tick / TICKS_PER_DAY + 1).toFixed(1)
}

function stamp(save: SaveFile): string {
  const parts: string[] = []
  if (save.build) parts.push(`build ${save.build}`)
  if (save.savedAt) {
    const date = new Date(save.savedAt)
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))
    }
  }
  return parts.length === 0 ? '' : ` (${parts.join(', ')})`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
