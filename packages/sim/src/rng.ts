/**
 * mulberry32. Chosen because its entire state is one 32-bit integer, so a
 * save file, a replay, and a bug report are all the same small object.
 *
 * Deliberately not `Math.random`: nothing in this package may reach for
 * ambient nondeterminism.
 */
export type RngState = { s: number }

export function makeRng(seed: number): RngState {
  return { s: seed >>> 0 }
}

/** Uniform in [0, 1). Advances the state. */
export function nextFloat(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0
  let t = rng.s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Uniform integer in [min, max], inclusive. */
export function nextInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1))
}

/** Exponential inter-arrival time, rounded to at least one tick. */
export function nextExponential(rng: RngState, mean: number): number {
  const u = Math.max(nextFloat(rng), Number.EPSILON)
  return Math.max(1, Math.round(-mean * Math.log(u)))
}

/** Draw `k` distinct integers from [0, n). Ordered, so results stay comparable. */
export function sampleDistinct(rng: RngState, n: number, k: number): number[] {
  const pool = Array.from({ length: n }, (_, i) => i)
  const take = Math.min(k, n)
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(nextFloat(rng) * (n - i))
    const a = pool[i] as number
    const b = pool[j] as number
    pool[i] = b
    pool[j] = a
  }
  return pool.slice(0, take).sort((a, b) => a - b)
}
