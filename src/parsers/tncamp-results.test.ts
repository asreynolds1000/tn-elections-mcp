import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseResultsTable, parsePaginationInfo } from './tncamp-results.js'
import type { TncampCandidate, TncampContribution, TncampExpenditure } from '../types.js'

const CANDIDATE_HTML = `
<table id="results">
<thead><tr><th>Name</th><th>Party</th><th>Office</th><th>District</th><th>Year</th><th>Reports</th></tr></thead>
<tbody>
<tr><td>POWERS, BILL</td><td>Republican</td><td>Senate</td><td>22</td><td>2024</td><td><a href="/tncamp/public/replist.htm?id=7459&amp;owner=POWERS, BILL">Report List</a></td></tr>
<tr><td>TODD, CHRISTOPHER</td><td>Republican</td><td>House of Representatives</td><td>73</td><td>2026</td><td><a href="/tncamp/public/replist.htm?id=7015&amp;owner=TODD, CHRISTOPHER">Report List</a></td></tr>
</tbody>
</table>
`

const CONTRIBUTION_HTML = `
<span class="pagebanner">845 results found, displaying 1 to 50.</span>
<table id="results">
<thead><tr><th>Type</th><th>Amount</th><th>Date</th><th>Election Year</th><th>Recipient</th><th>Contributor</th><th>Address</th><th>Occupation</th><th>Employer</th></tr></thead>
<tbody>
<tr><td>Monetary</td><td>$1,500.00</td><td>07/10/2025</td><td>2026</td><td>HEMMER, CALEB</td><td>AT&amp;T TENNESSEE PAC</td><td>333 COMMERCE ST NASHVILLE TN</td><td></td><td></td></tr>
<tr><td>Monetary</td><td>$250.00</td><td>03/26/2025</td><td>2024</td><td>ROSE, JOHN</td><td>CLEM, CHRIS</td><td>4931 CHESTNUT AVE</td><td>ATTORNEY</td><td>SAMPLES PLLC</td></tr>
</tbody>
</table>
<a href="/tncamp/public/ceresults.htm?d-1341904-p=2">2</a>
<a href="/tncamp/public/ceresults.htm?d-1341904-p=17">17</a>
`

const EXPENDITURE_HTML = `
<table id="results">
<thead><tr><th>Type</th><th>Amount</th><th>Date</th><th>Vendor</th><th>Address</th><th>Purpose</th><th>Candidate For</th></tr></thead>
<tbody>
<tr><td></td><td>$5,000.00</td><td>08/06/2024</td><td>RJD GROUP</td><td>PO BOX 210753 NASHVILLE TN</td><td>CONSULTING FEE</td><td></td></tr>
</tbody>
</table>
`

describe('parseResultsTable — candidates', () => {
  it('parses candidate rows', () => {
    const results = parseResultsTable<TncampCandidate>(CANDIDATE_HTML, 'candidate')
    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('POWERS, BILL')
    expect(results[0].party).toBe('Republican')
    expect(results[0].officeSought).toBe('Senate')
    expect(results[0].district).toBe('22')
    expect(results[0].candidateId).toBe(7459)
  })

  it('extracts candidate ID from report link', () => {
    const results = parseResultsTable<TncampCandidate>(CANDIDATE_HTML, 'candidate')
    expect(results[1].candidateId).toBe(7015)
  })

  it('returns empty for no table', () => {
    expect(parseResultsTable('<html></html>', 'candidate')).toHaveLength(0)
  })
})

describe('parseResultsTable — contributions', () => {
  it('parses contribution rows with amounts', () => {
    const results = parseResultsTable<TncampContribution>(CONTRIBUTION_HTML, 'contribution')
    expect(results).toHaveLength(2)
    expect(results[0].amount).toBe(1500)
    expect(results[0].contributorName).toBe('AT&T TENNESSEE PAC')
    expect(results[0].recipientName).toBe('HEMMER, CALEB')
  })

  it('parses employer and occupation', () => {
    const results = parseResultsTable<TncampContribution>(CONTRIBUTION_HTML, 'contribution')
    expect(results[1].contributorOccupation).toBe('ATTORNEY')
    expect(results[1].contributorEmployer).toBe('SAMPLES PLLC')
  })
})

describe('parseResultsTable — expenditures', () => {
  it('parses expenditure rows', () => {
    const results = parseResultsTable<TncampExpenditure>(EXPENDITURE_HTML, 'expenditure')
    expect(results).toHaveLength(1)
    expect(results[0].amount).toBe(5000)
    expect(results[0].vendorName).toBe('RJD GROUP')
    expect(results[0].purpose).toBe('CONSULTING FEE')
  })
})

describe('parsePaginationInfo', () => {
  it('extracts total count and page info', () => {
    const info = parsePaginationInfo(CONTRIBUTION_HTML)
    expect(info).not.toBeNull()
    expect(info!.totalItems).toBe(845)
    expect(info!.itemsPerPage).toBe(50)
    expect(info!.totalPages).toBe(17)
    expect(info!.paginationParam).toBe('d-1341904-p')
  })

  it('returns null for no pagination', () => {
    expect(parsePaginationInfo(EXPENDITURE_HTML)).toBeNull()
  })
})

// Real page: apps.tn.gov ceresults.htm, expenditures, every column requested (see fixture header).
const ALL_COLUMNS_HTML = readFileSync(
  fileURLToPath(new URL('./__fixtures__/ceresults-expenditures-all-columns.html', import.meta.url)),
  'utf8',
)

describe('parseResultsTable — expenditures, real page with every column', () => {
  const results = parseResultsTable<TncampExpenditure>(ALL_COLUMNS_HTML, 'expenditure')

  it('names the FILER (Candidate/PAC Name), not just the payee', () => {
    const tea = results.find((r) => r.amount === 15400)
    expect(tea).toBeDefined()
    expect(tea!.filerName).toBe('TENNESSEE EDUC ASSN FUND FOR CHILDREN & PUBLIC EDU')
    expect(tea!.vendorName).toBe('PROCTOR, MARK')
    expect(tea!.date).toBe('09/08/2026')
    expect(tea!.purpose).toBe('CONTRIBUTION')
    expect(tea!.reportName).toBe('3rd Quarter')
    expect(tea!.reportId).toBe(129336)
    expect(tea!.adjustment).toBe('N')
  })

  it('reads every row and reconciles to the page', () => {
    expect(results).toHaveLength(4)
    expect(results.reduce((s, r) => s + r.amount, 0)).toBe(20400)
    expect(results.map((r) => r.filerName)).toEqual([
      "NASHVILLE CHILDREN'S ADVOCACY FUND",
      'IRON WORKERS L.U. 492 PAC',
      'IRON WORKERS L.U. 492 PAC',
      'TENNESSEE EDUC ASSN FUND FOR CHILDREN & PUBLIC EDU',
    ])
    expect(results.every((r) => r.vendorAddress.includes('BRENTWOOD'))).toBe(true)
  })

  it('maps by header, so a reordered table still lands in the right fields', () => {
    const reordered = `<table id="results"><thead><tr><th>Vendor Name</th><th>Amount</th><th>Candidate/PAC Name</th><th>Date</th></tr></thead>
<tbody><tr><td>ACME</td><td>$10.00</td><td>SOME PAC</td><td>01/02/2026</td></tr></tbody></table>`
    const [row] = parseResultsTable<TncampExpenditure>(reordered, 'expenditure')
    expect(row.vendorName).toBe('ACME')
    expect(row.filerName).toBe('SOME PAC')
    expect(row.amount).toBe(10)
    expect(row.date).toBe('01/02/2026')
  })
})
