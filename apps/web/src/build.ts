declare const __BUILD__: string | null

/**
 * The commit this build was made from, stamped into save files so a load can
 * say which build a save came from. Set by `vite.config.ts`, and null when no
 * commit could be found.
 */
export const BUILD: string | null = typeof __BUILD__ === 'undefined' ? null : __BUILD__
