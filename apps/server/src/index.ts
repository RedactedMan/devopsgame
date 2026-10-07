/**
 * What is left of the leaderboard API. Everything that is not `/api/*` is the
 * static game, served by the assets binding before this code runs
 * (wrangler.jsonc), and free play never calls the API.
 *
 * Presentation mode — sessions, join codes, and a leaderboard that re-played
 * every run to verify its score — was retired on 2026-10-06, after the talk.
 * The replays needed the Workers paid plan's CPU limit; without them the site
 * fits the free plan. The `Session` Durable Object is deleted by the `v2`
 * migration. The code is in git history before that date (apps/server/src,
 * apps/web/src/session).
 *
 * A browser still holding an old `?join=` page gets a plain answer rather than
 * a 404 it cannot explain.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') return json({ ok: true })
    return json({ error: 'presentation mode has been retired. Free play is at /' }, 410)
  },
} satisfies ExportedHandler

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}
