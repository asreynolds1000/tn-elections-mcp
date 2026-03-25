import { describe, it, expect } from 'vitest'
import { SUMNER_CYCLES, resolveCycle } from './sumner-cycles.js'

describe('SUMNER_CYCLES', () => {
  it('has 7 entries', () => {
    expect(SUMNER_CYCLES).toHaveLength(7)
  })

  it('all have required fields', () => {
    for (const c of SUMNER_CYCLES) {
      expect(c.year).toBeTruthy()
      expect(c.url).toContain('votesumnertn.org')
      expect(c.label).toBeTruthy()
    }
  })
})

describe('resolveCycle', () => {
  it('resolves exact year', () => {
    expect(resolveCycle('2026')?.year).toBe('2026')
  })

  it('resolves partial year for combined cycle', () => {
    expect(resolveCycle('2016')?.year).toBe('2016-2018')
  })

  it('returns null for unknown year', () => {
    expect(resolveCycle('1999')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resolveCycle('')).toBeNull()
  })
})
