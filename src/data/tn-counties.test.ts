import { describe, it, expect } from 'vitest'
import { resolveCounty, EASYVOTE_COUNTIES, TN_COUNTIES } from './tn-counties.js'

describe('resolveCounty', () => {
  it('resolves by exact name', () => {
    const result = resolveCounty('Knox')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Knox')
    expect(result!.slug).toBe('knoxcountytn')
  })

  it('resolves by exact name (case-insensitive)', () => {
    const result = resolveCounty('davidson')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Davidson')
  })

  it('resolves by slug', () => {
    const result = resolveCounty('shelbycountytn')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Shelby')
  })

  it('resolves by county seat', () => {
    const result = resolveCounty('Nashville')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Davidson')
  })

  it('resolves by county seat (case-insensitive)', () => {
    const result = resolveCounty('knoxville')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Knox')
  })

  it('resolves by partial name prefix', () => {
    const result = resolveCounty('david')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Davidson')
  })

  it('resolves by partial county seat', () => {
    const result = resolveCounty('chatt')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Hamilton')
  })

  it('returns null for unknown county', () => {
    expect(resolveCounty('FakeCounty')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(resolveCounty('')).toBeNull()
  })
})

describe('EASYVOTE_COUNTIES', () => {
  it('has 14 entries', () => {
    expect(EASYVOTE_COUNTIES).toHaveLength(14)
  })

  it('all have required fields', () => {
    for (const county of EASYVOTE_COUNTIES) {
      expect(county.slug).toBeTruthy()
      expect(county.name).toBeTruthy()
      expect(county.tenantId).toMatch(/^[A-F0-9-]+$/i)
      expect(county.countySeat).toBeTruthy()
      expect(typeof county.filerCount).toBe('number')
    }
  })

  it('slug follows {name}countytn pattern', () => {
    for (const county of EASYVOTE_COUNTIES) {
      expect(county.slug).toBe(`${county.name.toLowerCase()}countytn`)
    }
  })
})

describe('TN_COUNTIES', () => {
  it('has 95 entries', () => {
    expect(Object.keys(TN_COUNTIES)).toHaveLength(95)
  })
})
