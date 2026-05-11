import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCandidateListPage, parseXlsx } from './sos-xlsx.js'

// ============================================================
// HTML page parsing tests
// ============================================================

const CANDIDATE_LIST_HTML = `
<html>
<body>
<div class="paragraph paragraph--type--additional-information">
<div class="field field--name-field-info-text">
<ul>
<li>Governor: <a href="https://sos-prod.tnsosgovfiles.com/s3fs-public/document/Governor_Filed_2026-03-24.pdf">PDF</a> | <a href="https://sos-prod.tnsosgovfiles.com/s3fs-public/document/Governor_Filed_2026-03-24.xlsx">Excel</a></li>
<li>U.S. Senate: <a href="https://sos-prod.tnsosgovfiles.com/s3fs-public/document/USSenate_Filed_2026-03-24.pdf">PDF</a> | <a href="https://sos-prod.tnsosgovfiles.com/s3fs-public/document/USSenate_Filed_2026-03-24.xlsx">Excel</a></li>
<li>TN Senate: <a href="https://sos-prod.tnsosgovfiles.com/s3fs-public/document/TNSenate_Filed_2026-03-24.pdf">PDF</a> | <a href="https://sos-prod.tnsosgovfiles.com/s3fs-public/document/TNSenate_Filed_2026-03-24.xlsx">Excel</a></li>
</ul>
</div>
</div>
</body>
</html>
`

describe('parseCandidateListPage', () => {
  it('extracts office names and xlsx/pdf URLs', () => {
    const offices = parseCandidateListPage(CANDIDATE_LIST_HTML)
    expect(offices).toHaveLength(3)

    expect(offices[0].name).toBe('Governor')
    expect(offices[0].xlsxUrl).toContain('Governor_Filed_2026-03-24.xlsx')
    expect(offices[0].pdfUrl).toContain('Governor_Filed_2026-03-24.pdf')

    expect(offices[1].name).toBe('U.S. Senate')
    expect(offices[2].name).toBe('TN Senate')
  })

  it('skips list items without xlsx links', () => {
    const html = '<ul><li>No files here</li><li>Also nothing: <a href="page.html">Link</a></li></ul>'
    expect(parseCandidateListPage(html)).toHaveLength(0)
  })

  it('returns empty for no list items', () => {
    expect(parseCandidateListPage('<html></html>')).toHaveLength(0)
  })
})

// ============================================================
// XLSX parsing tests
// ============================================================

/** Helper: create an xlsx ArrayBuffer from headers + rows */
function createXlsx(headers: string[], rows: (string | number)[][]): ArrayBuffer {
  const aoa = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return out as ArrayBuffer
}

describe('parseXlsx', () => {
  it('parses federal-style headers (Party Name, Filing Date)', () => {
    const buffer = createXlsx(
      ['Office', 'Candidate', 'Party Name', 'City', 'Filing Date', 'Status'],
      [
        ['Governor', 'DOE, JANE', 'Republican', 'Nashville', '3/6/2026', 'Signatures Approved'],
        ['Governor', 'SMITH, JOHN', 'Democratic', 'Memphis', '3/10/2026', 'Signatures Approved'],
      ],
    )

    const candidates = parseXlsx(buffer, 'Governor', 2026)
    expect(candidates).toHaveLength(2)

    expect(candidates[0].candidateName).toBe('DOE, JANE')
    expect(candidates[0].party).toBe('Republican')
    expect(candidates[0].city).toBe('Nashville')
    expect(candidates[0].filingDate).toBe('2026-03-06')
    expect(candidates[0].status).toBe('Signatures Approved')
    expect(candidates[0].officeCategory).toBe('Governor')
  })

  it('parses state-style headers (Party, Filed) with year-less dates', () => {
    const buffer = createXlsx(
      ['Office', 'Candidate', 'Party', 'City', 'Filed', 'Status'],
      [
        ['State Senate District 5', 'POWERS, BILL', 'Republican', 'Knoxville', '1/1', 'Signatures Approved'],
        ['State Senate District 5', 'JONES, MARY', 'Democratic', 'Chattanooga', '4/4', 'Signatures Approved'],
      ],
    )

    const candidates = parseXlsx(buffer, 'TN Senate', 2026)
    expect(candidates).toHaveLength(2)

    expect(candidates[0].candidateName).toBe('POWERS, BILL')
    expect(candidates[0].filingDate).toBe('2026-01-01')
    expect(candidates[0].officeCategory).toBe('TN Senate')

    expect(candidates[1].filingDate).toBe('2026-04-04')
  })

  it('normalizes full dates to YYYY-MM-DD', () => {
    const buffer = createXlsx(
      ['Office', 'Candidate', 'Party Name', 'City', 'Filing Date', 'Status'],
      [['US House District 1', 'TEST, CANDIDATE', 'Independent', 'Bristol', '3/6/2026', 'Signatures Approved']],
    )

    const candidates = parseXlsx(buffer, 'US House', 2026)
    expect(candidates[0].filingDate).toBe('2026-03-06')
  })

  it('handles two-digit year dates', () => {
    const buffer = createXlsx(
      ['Office', 'Candidate', 'Party', 'City', 'Filed', 'Status'],
      [['Governor', 'TEST, NAME', 'Republican', 'Nashville', '3/6/26', 'Signatures Approved']],
    )

    const candidates = parseXlsx(buffer, 'Governor', 2026)
    expect(candidates[0].filingDate).toBe('2026-03-06')
  })

  it('skips empty rows', () => {
    const buffer = createXlsx(
      ['Office', 'Candidate', 'Party', 'City', 'Filed', 'Status'],
      [
        ['Governor', 'DOE, JANE', 'Republican', 'Nashville', '3/6', 'Signatures Approved'],
        ['', '', '', '', '', ''],
        ['Governor', 'SMITH, JOHN', 'Democratic', 'Memphis', '3/10', 'Signatures Approved'],
      ],
    )

    const candidates = parseXlsx(buffer, 'Governor', 2026)
    expect(candidates).toHaveLength(2)
  })

  it('returns empty for header-only sheet', () => {
    const buffer = createXlsx(
      ['Office', 'Candidate', 'Party', 'City', 'Filed', 'Status'],
      [],
    )

    const candidates = parseXlsx(buffer, 'Governor', 2026)
    expect(candidates).toHaveLength(0)
  })

  it('returns empty for empty workbook', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Sheet1')
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const candidates = parseXlsx(buffer, 'Governor', 2026)
    expect(candidates).toHaveLength(0)
  })
})
