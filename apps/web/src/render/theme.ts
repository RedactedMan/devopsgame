/**
 * One palette, shared by the canvas and the DOM, so an item's colour means the
 * same thing wherever it appears. Teal is healthy flow, amber is drifting, rust
 * is stale — the same semantics the design doc uses.
 */
export const COLORS = {
  ground: 0x14191a,
  panel: 0x1c2325,
  panelEdge: 0x2b3538,
  slot: 0x232c2e,
  text: 0xd9e0df,
  muted: 0x7c8b8a,
  flow: 0x2fa39a,
  drift: 0xd8973c,
  stale: 0xb4451f,
  overLimit: 0xe0563a,
}

export const CSS_COLORS = {
  ground: '#14191a',
  panel: '#1c2325',
  panelEdge: '#2b3538',
  text: '#d9e0df',
  muted: '#7c8b8a',
  flow: '#2fa39a',
  drift: '#d8973c',
  stale: '#b4451f',
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  return (
    (Math.round(lerp(ar, br, t)) << 16) |
    (Math.round(lerp(ag, bg, t)) << 8) |
    Math.round(lerp(ab, bb, t))
  )
}

/** Teal → amber → rust. The single most important thing the player reads on the board. */
export function driftColor(score: number): number {
  const s = Math.min(1, Math.max(0, score))
  return s < 0.6
    ? mix(COLORS.flow, COLORS.drift, s / 0.6)
    : mix(COLORS.drift, COLORS.stale, (s - 0.6) / 0.4)
}

export function cssDriftColor(score: number): string {
  return `#${driftColor(score).toString(16).padStart(6, '0')}`
}
