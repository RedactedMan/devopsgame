import { describe, expect, it } from 'vitest'
import { makeRng, nextExponential, nextFloat, nextInt, sampleDistinct } from '@flow/sim'

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const draw = (r: ReturnType<typeof makeRng>) => Array.from({ length: 50 }, () => nextFloat(r))
    expect(draw(a)).toEqual(draw(b))
  })

  it('diverges across seeds', () => {
    expect(nextFloat(makeRng(1))).not.toEqual(nextFloat(makeRng(2)))
  })

  it('stays in range', () => {
    const rng = makeRng(7)
    for (let i = 0; i < 2000; i++) {
      const f = nextFloat(rng)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
      const n = nextInt(rng, 3, 8)
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(8)
      expect(nextExponential(rng, 10)).toBeGreaterThanOrEqual(1)
    }
  })

  it('samples distinct, sorted areas', () => {
    const rng = makeRng(99)
    for (let i = 0; i < 500; i++) {
      const areas = sampleDistinct(rng, 6, 2)
      expect(areas).toHaveLength(2)
      expect(new Set(areas).size).toBe(2)
      expect([...areas].sort((a, b) => a - b)).toEqual(areas)
    }
  })
})
