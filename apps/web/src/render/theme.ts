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
  /** The agent chip's colour, so agent output on the board reads as the same kind of thing. */
  agent: 0x93b6d6,
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

/**
 * One colour per area of the codebase, so two items fighting over the same
 * ground carry a chip of the same colour and the collision is readable without
 * clicking anything.
 *
 * Deliberately a full lightness band above the drift ramp rather than a
 * different set of hues. Chips sit *on* item bodies that are themselves teal,
 * amber, or rust, and a chip picked to contrast with teal disappears on rust.
 * Pale-on-saturated separates from all three at once, whatever the hue — which
 * is also why every chip is drawn with a dark stroke around it.
 *
 * Ten entries because `tuning.arrival.areaCount` is ten. Area ids run from
 * zero, and this is indexed modulo its length so a wider codebase still paints.
 */
export const AREA_COLORS = [
  0xf09789, 0xf0d589, 0xcef089, 0x90f089, 0x89f0c0, 0x89e3f0, 0x89a5f0, 0xab89f0, 0xea89f0,
  0xf089b9,
] as const

export function areaColor(area: number): number {
  return AREA_COLORS[((area % AREA_COLORS.length) + AREA_COLORS.length) % AREA_COLORS.length] as number
}

export function cssAreaColor(area: number): string {
  return `#${areaColor(area).toString(16).padStart(6, '0')}`
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

/**
 * Backlog items cannot drift — they have no branch to drift from — but they are
 * aging, and that wait is most of a lead time. Tinting them on the same ramp
 * keeps one rule on the board: colour means age, wherever it appears.
 *
 * Ten sim-days to full tint. Short enough that a jammed backlog pins at rust,
 * long enough that a healthy one still shows a gradient instead of a red wall.
 * A view concern, so it lives here rather than in the Tuning schema.
 */
export const WAIT_FULL_TINT_TICKS = 800

export function waitScore(ageTicks: number): number {
  return Math.min(1, Math.max(0, ageTicks / WAIT_FULL_TINT_TICKS))
}
