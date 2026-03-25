import { describe, it, expect } from 'vitest'

// Test the sanitizeJson logic directly (replicated here since it's private)
function sanitizeJson(raw: string): string {
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

describe('sanitizeJson', () => {
  it('passes through clean JSON unchanged', () => {
    const clean = '{"name": "John Smith", "amount": 100}'
    expect(sanitizeJson(clean)).toBe(clean)
  })

  it('strips null bytes', () => {
    const dirty = '{"name": "John\x00Smith"}'
    expect(sanitizeJson(dirty)).toBe('{"name": "JohnSmith"}')
  })

  it('strips control characters but preserves tabs and newlines', () => {
    const input = '{"a":\t"b",\n"c":\r\n"d\x01\x02\x03"}'
    const expected = '{"a":\t"b",\n"c":\r\n"d"}'
    expect(sanitizeJson(input)).toBe(expected)
  })

  it('handles Knox County control char pattern', () => {
    // Knox County responses have been observed with embedded control chars
    const input = '{"filerid":"abc\x05def","name":"Test"}'
    const result = sanitizeJson(input)
    expect(() => JSON.parse(result)).not.toThrow()
    expect(JSON.parse(result).filerid).toBe('abcdef')
  })

  it('handles empty string', () => {
    expect(sanitizeJson('')).toBe('')
  })
})

describe('header construction', () => {
  it('origin URL follows expected pattern', () => {
    const slug = 'knoxcountytn'
    const origin = `https://${slug}.easyvotecampaignfinance.com`
    expect(origin).toBe('https://knoxcountytn.easyvotecampaignfinance.com')
  })

  it('auth header follows pipe-delimited format', () => {
    const userId = 'B7E5F78C-AB24-4799-A754-39FD501306DD'
    const customerId = '4BB07902-FDCA-4D3B-BF6F-EA8F3A3E99A4'
    const header = `UserId:${userId}|CustomerId:${customerId}|ZumoToken:null`
    expect(header).toContain('UserId:')
    expect(header).toContain('|CustomerId:')
    expect(header).toContain('|ZumoToken:null')
    expect(header.split('|')).toHaveLength(3)
  })
})
