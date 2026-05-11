import { describe, it, expect } from 'vitest'
import { parseFormOptions, parseDistrictsJson } from './tncamp-form.js'

const FORM_HTML = `
<select id="offices" name="officeSelection">
  <option value="" selected>- Select Office -</option>
  <option value="2">Governor</option>
  <option value="3">Senate</option>
  <option value="10">Circuit Court</option>
  <option value="13">Probate Court</option>
</select>
<select id="years" name="electionYearSelection">
  <option value="" selected>- Select Election Year-</option>
  <option value="234">2026</option>
  <option value="230">2024</option>
  <option value="237">2023 (HOUSE 3)</option>
</select>
<select id="districts" name="districtSelection">
  <option value="" selected>- Select District -</option>
  <option value="" selected>Please select an office first.</option>
</select>
<select name="partySelection">
  <option value="" selected>- Select Party -</option>
  <option value="1">Democrat</option>
  <option value="2">Republican</option>
  <option value="3">Independent</option>
  <option value="4">Green</option>
</select>
`

// Whitespace-heavy HTML matching the actual tncamp page
const FORM_HTML_WHITESPACE = `
<select id="offices" name="officeSelection">
  <option value="" selected >- Select Office -</option>
  <option value="2" >
                Governor
              </option>
  <option value="10" >
                Circuit Court
              </option>
</select>
<select name="electionYearSelection">
  <option value="" selected >- Select Election Year- </option>
  <option value="234" >
                2026

              </option>
  <option value="237" >
                2023

                  (HOUSE 3)

              </option>
</select>
<select name="partySelection">
  <option value="" selected >- Select Party -</option>
  <option value="2" >Republican
              </option>
</select>
`

const DISTRICTS_JSON = `{"districts":[{"id":204,"name":"1-1","office_id":10,"nameWithoutSeat":"01"},{"id":205,"name":"1-2","office_id":10,"nameWithoutSeat":"01"},{"id":369,"name":"18-2","office_id":10,"nameWithoutSeat":"18"}]}`

const DISTRICTS_EMPTY = `{"districts":[]}`

describe('parseFormOptions', () => {
  it('extracts offices', () => {
    const result = parseFormOptions(FORM_HTML)
    expect(result.offices).toHaveLength(4)
    expect(result.offices[0]).toEqual({ id: '2', name: 'Governor' })
    expect(result.offices[2]).toEqual({ id: '10', name: 'Circuit Court' })
  })

  it('extracts election years', () => {
    const result = parseFormOptions(FORM_HTML)
    expect(result.electionYears).toHaveLength(3)
    expect(result.electionYears[0]).toEqual({ id: '234', label: '2026' })
    expect(result.electionYears[2]).toEqual({ id: '237', label: '2023 (HOUSE 3)' })
  })

  it('extracts parties', () => {
    const result = parseFormOptions(FORM_HTML)
    expect(result.parties).toHaveLength(4)
    expect(result.parties[0]).toEqual({ id: '1', name: 'Democrat' })
    expect(result.parties[1]).toEqual({ id: '2', name: 'Republican' })
  })

  it('skips empty-value options (placeholders)', () => {
    const result = parseFormOptions(FORM_HTML)
    // Districts should have 0 options (both have empty values)
    // Offices should not include "- Select Office -"
    expect(result.offices.every(o => o.id !== '')).toBe(true)
  })

  it('handles whitespace-heavy HTML from real tncamp page', () => {
    const result = parseFormOptions(FORM_HTML_WHITESPACE)
    expect(result.offices).toHaveLength(2)
    expect(result.offices[0]).toEqual({ id: '2', name: 'Governor' })
    expect(result.offices[1]).toEqual({ id: '10', name: 'Circuit Court' })
    expect(result.electionYears[0]).toEqual({ id: '234', label: '2026' })
    expect(result.electionYears[1]).toEqual({ id: '237', label: '2023 (HOUSE 3)' })
    expect(result.parties[0]).toEqual({ id: '2', name: 'Republican' })
  })

  it('returns empty arrays for missing selects', () => {
    const result = parseFormOptions('<html></html>')
    expect(result.offices).toHaveLength(0)
    expect(result.electionYears).toHaveLength(0)
    expect(result.parties).toHaveLength(0)
  })
})

describe('parseDistrictsJson', () => {
  it('parses district JSON with officeId', () => {
    const result = parseDistrictsJson(DISTRICTS_JSON, '10')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ id: '204', label: '1-1', officeId: '10' })
    expect(result[2]).toEqual({ id: '369', label: '18-2', officeId: '10' })
  })

  it('returns empty array for empty districts', () => {
    const result = parseDistrictsJson(DISTRICTS_EMPTY, '2')
    expect(result).toHaveLength(0)
  })
})
