import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseReportDetail } from './tncamp-report.js'
import type { TncampLineItem } from '../types.js'

// ── Fixtures ────────────────────────────────────────────────────────────────
// Three REAL captured report_full.htm pages from apps.tn.gov. Values in the
// GOLDEN table below were measured by running the live parser against these
// files (not invented), then cross-checked by hand against the raw HTML.

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__')

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8')
}

const HANCOCK_HTML = loadFixture('report-hancock-128092.html')
const PROCTOR_HTML = loadFixture('report-proctor-127993.html')
const LOUALLEN_HTML = loadFixture('report-louallen-126212.html')

// Four more REAL report_full.htm pages, captured to close a structural blind spot: the three
// fixtures above are all small 2026 legislative reports, so the suite never exercised a report
// where the FIRST table under a section heading is NOT the itemized list. That is exactly the
// shape that broke `sectionTable()` in production (it used to take the first <table>, full stop).
// See the header-signature doc comment on `sectionTable()` in tncamp-report.ts for the fix.
const LEE_100136_HTML = loadFixture('report-lee-100136.html')
const LEE_72153_HTML = loadFixture('report-lee-72153.html') // 1.3MB — parsed once below, not per-test
const HARWELL_HTML = loadFixture('report-harwell-81223.html')
const BLACK_HTML = loadFixture('report-black-86229.html')

const sumOf = (items: TncampLineItem[]) => items.reduce((acc, item) => acc + item.amount, 0)

// Parse the two large/expensive fixtures ONCE and reuse the result everywhere below, per the
// perf note that shipped with these fixtures: re-parsing a 1.3MB page (587 + 437 + 9 rows) in
// every `it()` adds up fast. The three original fixtures stay parsed inline per-test, matching
// this file's existing style for them (they're small; not worth the churn to change).
const LEE_100136 = parseReportDetail(LEE_100136_HTML, 100136)
const LEE_72153 = parseReportDetail(LEE_72153_HTML, 72153)
const HARWELL = parseReportDetail(HARWELL_HTML, 81223)
const BLACK = parseReportDetail(BLACK_HTML, 86229)

// ── Golden values ────────────────────────────────────────────────────────────
// Reconciled against the raw page text (see the perl/python spot-checks that
// accompanied this suite's authoring — every figure here ties to the page's
// own "TOTAL …" / "Beginning/Ending Balance" lines).

interface Golden {
  label: string
  html: string
  reportId: number
  candidateName: string
  beginningBalance: number
  totalReceipts: number
  totalDisbursements: number
  endingBalance: number
  receiptsCount: number
  receiptsSum: number
  disbursementsCount: number
  disbursementsSum: number
  loansCount: number
  loansSum: number
}

const GOLDEN: Golden[] = [
  {
    label: 'hancock',
    html: HANCOCK_HTML,
    reportId: 128092,
    candidateName: 'BILL HANCOCK',
    beginningBalance: 204827.18,
    totalReceipts: 12542.82,
    totalDisbursements: 7599.56,
    endingBalance: 209770.44,
    receiptsCount: 20,
    receiptsSum: 12467.82,
    disbursementsCount: 6,
    disbursementsSum: 7599.56,
    loansCount: 3,
    loansSum: 398.22,
  },
  {
    label: 'proctor',
    html: PROCTOR_HTML,
    reportId: 127993,
    candidateName: 'MARK PROCTOR',
    beginningBalance: 48599.85,
    totalReceipts: 17786,
    totalDisbursements: 41510.17,
    endingBalance: 24875.68,
    receiptsCount: 54,
    receiptsSum: 17786,
    disbursementsCount: 19,
    disbursementsSum: 41510.17,
    loansCount: 2,
    loansSum: 20851.35,
  },
  {
    label: 'louallen',
    html: LOUALLEN_HTML,
    reportId: 126212,
    candidateName: 'JOHN LOUALLEN',
    beginningBalance: 16217.08,
    totalReceipts: 3115.15,
    totalDisbursements: 12493.27,
    endingBalance: 6838.96,
    receiptsCount: 13,
    receiptsSum: 3115.15,
    disbursementsCount: 33,
    disbursementsSum: 12493.27,
    loansCount: 0,
    loansSum: 0,
  },
]

// ── Golden values: the four hazard fixtures ─────────────────────────────────
// Same measured-then-hand-verified discipline as GOLDEN above. Every figure here was checked
// against the fixture's own "TOTAL …" text (see the probe transcript in the PR/commit that added
// these fixtures) — NOT copied from a summary. Two of these (harwell, black) have genuinely ZERO
// itemized receipts and/or disbursements for the quarter; that is real, verified page content,
// not a parsing failure, which is exactly why they're valuable fixtures: a parser that fabricates
// plausible-looking rows to fill a real empty section is worse than one that returns [].
const NEW_GOLDEN: Golden[] = [
  {
    label: 'lee-100136',
    html: LEE_100136_HTML,
    reportId: 100136,
    candidateName: 'BILL LEE',
    beginningBalance: 4635189.61,
    totalReceipts: 42722.3,
    totalDisbursements: 219566.68,
    endingBalance: 4458345.23,
    receiptsCount: 21,
    receiptsSum: 42562.3,
    disbursementsCount: 111,
    disbursementsSum: 218578.55,
    loansCount: 5,
    loansSum: 4583000,
  },
  {
    label: 'lee-72153',
    html: LEE_72153_HTML,
    reportId: 72153,
    candidateName: 'BILL LEE',
    beginningBalance: 2527673.65,
    totalReceipts: 1812742.75,
    totalDisbursements: 595986.74,
    endingBalance: 3744429.66,
    receiptsCount: 587,
    receiptsSum: 897287.73,
    disbursementsCount: 437,
    disbursementsSum: 592635.35,
    loansCount: 2,
    loansSum: 2283000,
  },
  {
    label: 'harwell-81223',
    html: HARWELL_HTML,
    reportId: 81223,
    candidateName: 'BETH HARWELL',
    beginningBalance: 1483196.35,
    totalReceipts: 0,
    totalDisbursements: 1480640.27,
    endingBalance: 2556.08,
    receiptsCount: 0,
    receiptsSum: 0,
    disbursementsCount: 1,
    disbursementsSum: 545.0,
    loansCount: 1,
    loansSum: 0,
  },
  {
    label: 'black-86229',
    html: BLACK_HTML,
    reportId: 86229,
    candidateName: 'DIANE BLACK',
    beginningBalance: 68.43,
    totalReceipts: 0,
    totalDisbursements: 68.43,
    endingBalance: 0,
    receiptsCount: 0,
    receiptsSum: 0,
    disbursementsCount: 0,
    disbursementsSum: 0,
    loansCount: 1,
    loansSum: 0,
  },
]

// Every shared/table-driven assertion below runs against all seven fixtures. The narrower
// id-based "informational" guardrail near the bottom of the file is the one deliberate
// exception — it stays scoped to the original three, with its own explanation, because its
// premise (an `id="contribution"`/`id="expenditure"` table exists to mis-select) does not hold
// for a genuinely-empty section that renders no `<table>` at all. See that test for specifics.
const ALL_GOLDEN: Golden[] = [...GOLDEN, ...NEW_GOLDEN]

const ALL_SEVEN: Array<{ label: string; html: string; reportId: number }> = [
  { label: 'hancock', html: HANCOCK_HTML, reportId: 128092 },
  { label: 'proctor', html: PROCTOR_HTML, reportId: 127993 },
  { label: 'louallen', html: LOUALLEN_HTML, reportId: 126212 },
  { label: 'lee-100136', html: LEE_100136_HTML, reportId: 100136 },
  { label: 'lee-72153', html: LEE_72153_HTML, reportId: 72153 },
  { label: 'harwell-81223', html: HARWELL_HTML, reportId: 81223 },
  { label: 'black-86229', html: BLACK_HTML, reportId: 86229 },
]

// ── A. Regression tests for the four bugs just fixed ────────────────────────
// Each of these fails against the OLD behavior: old code split on <h3> (the
// page has none, so every list came back []), read candidateName from <h2>
// (a section heading, always empty), and shattered names/addresses by
// splitting on every raw HTML newline instead of only on <br>.

describe.each(ALL_GOLDEN)('parseReportDetail — $label (golden values)', (f) => {
  it('populates receipts as real line items, not [] — unless the fixture is genuinely empty, in which case it must be exactly []', () => {
    const d = parseReportDetail(f.html, f.reportId)
    if (f.receiptsCount === 0) {
      // harwell/black: verified real report content is zero itemized receipts that quarter.
      // Failing empty here is correct; fabricating rows to avoid an empty array is the bug.
      expect(d.receipts).toEqual([])
    } else {
      expect(d.receipts.length).toBeGreaterThan(0)
    }
    expect(d.receipts).toHaveLength(f.receiptsCount)
    expect(sumOf(d.receipts)).toBeCloseTo(f.receiptsSum, 2)
  })

  it('populates disbursements as real line items, not [] — unless the fixture is genuinely empty, in which case it must be exactly []', () => {
    const d = parseReportDetail(f.html, f.reportId)
    if (f.disbursementsCount === 0) {
      // black-86229: the ONLY table under its Disbursements heading is a Loan Payments table
      // ({loan source, payment}), not a vendor table. The old code took it anyway (position 1)
      // and fabricated 2 "Self-Endorsed" disbursement rows. See the structural hazard section
      // below for the raw-HTML proof this table exists and has no vendor column.
      expect(d.disbursements).toEqual([])
    } else {
      expect(d.disbursements.length).toBeGreaterThan(0)
    }
    expect(d.disbursements).toHaveLength(f.disbursementsCount)
    expect(sumOf(d.disbursements)).toBeCloseTo(f.disbursementsSum, 2)
  })

  it('populates loans matching the golden count/sum', () => {
    const d = parseReportDetail(f.html, f.reportId)
    expect(d.loans).toHaveLength(f.loansCount)
    expect(sumOf(d.loans)).toBeCloseTo(f.loansSum, 2)
  })

  it('extracts candidateName from <h1>, not the <h2> "Beginning Balance" section heading', () => {
    const d = parseReportDetail(f.html, f.reportId)
    expect(d.candidateName).toBe(f.candidateName)
    expect(d.candidateName).not.toBe('')
    expect(d.candidateName).not.toMatch(/balance/i)
  })

  it('extracts the top-line aggregates', () => {
    const d = parseReportDetail(f.html, f.reportId)
    expect(d.beginningBalance).toBeCloseTo(f.beginningBalance, 2)
    expect(d.totalReceipts).toBeCloseTo(f.totalReceipts, 2)
    expect(d.totalDisbursements).toBeCloseTo(f.totalDisbursements, 2)
    expect(d.endingBalance).toBeCloseTo(f.endingBalance, 2)
  })

  it('passes reportId through unchanged', () => {
    const d = parseReportDetail(f.html, f.reportId)
    expect(d.reportId).toBe(f.reportId)
  })

  it('never returns undefined arrays for sections with no activity (obligations)', () => {
    const d = parseReportDetail(f.html, f.reportId)
    expect(Array.isArray(d.obligations)).toBe(true)
  })
})

describe('parseReportDetail — regression: names and addresses are not shattered', () => {
  // The old parser split the whole cell on every raw HTML newline (the source is
  // pretty-printed), not just on <br>. A surname and given name sit on two raw lines
  // but form one logical line, so the name came out truncated to the surname with
  // ", <given name>" leaking into the first line of the address.
  //
  // ⚠️ Assert POSITIVELY on the synthetic values below, never negatively against the
  // real name this fixture was scrubbed of. A blocklist test republishes the very name
  // it protects, in a public repo. See publishing-safety.md > anonymized test fixtures.

  it('hancock receipts[0]: full name intact, address is two clean lines', () => {
    const d = parseReportDetail(HANCOCK_HTML, 128092)
    expect(d.receipts[0]).toEqual({
      name: 'THORNBURY, WYNN',
      address: '800 SORREL TRL\nKESWICK, TN 37819',
      date: '07/27/2026',
      amount: 100,
      occupation: 'EDITOR',
      employer: 'GRANARY WORKS',
    })
    // Name is one logical line, not shattered at the comma.
    expect(d.receipts[0].name).toContain(',')
    expect(d.receipts[0].address.startsWith(',')).toBe(false)
    // Not one-token-per-line: the address is 2 lines, not 4+ (street / city / , / state / zip).
    expect(d.receipts[0].address.split('\n')).toHaveLength(2)
  })

  it('hancock disbursements[0]: vendor name and address intact', () => {
    const d = parseReportDetail(HANCOCK_HTML, 128092)
    expect(d.disbursements[0]).toEqual({
      name: 'ANEDOT INC',
      address: '831 MULBERRY LN\nNORTHFIELD, TN 37228',
      date: '07/27/2026',
      amount: 210.02,
      purpose: 'CREDIT CARD FEES',
    })
  })

  it('proctor receipts[0]: name, address, occupation and employer all correct', () => {
    const d = parseReportDetail(PROCTOR_HTML, 127993)
    expect(d.receipts[0]).toEqual({
      name: 'OAKHAVEN, WYNN',
      address: '491 BIRCHFIELD PKWY\nTHORNDALE, TN 37555',
      date: '07/01/2026',
      amount: 50,
      occupation: 'ARCHITECT',
      employer: "BRIARWOOD'S WORKS",
    })
  })

  it('every "Last, First" contributor across all seven fixtures keeps first+last on one name line', () => {
    // Guards the general case, not just receipts[0]: if the old bug reappeared,
    // any name containing a comma followed by a real given name would instead
    // show up as a bare surname with the given name leaking into the address.
    for (const f of ALL_GOLDEN) {
      const d = parseReportDetail(f.html, f.reportId)
      for (const item of [...d.receipts, ...d.disbursements]) {
        if (item.name.includes(',')) {
          // The line right after the comma is a name fragment, not a street address
          // (no digits at the start of the line, i.e. it isn't "123 MAIN ST").
          const afterComma = item.name.split(',')[1]?.trim() ?? ''
          expect(afterComma).not.toMatch(/^\d/)
        }
      }
    }
  })
})

describe('parseReportDetail — regression: addresses are single clean lines, not one token per line', () => {
  const CITY_STATE_ZIP = /,\s*[A-Z]{2}\s+\d{5}(-\d{4})?$/

  it('every non-empty address across all fixtures is at most 2 lines, ending in "CITY, ST ZIP"', () => {
    for (const f of ALL_GOLDEN) {
      const d = parseReportDetail(f.html, f.reportId)
      const allItems = [...d.receipts, ...d.disbursements, ...d.loans, ...d.inKindContributions]
      for (const item of allItems) {
        if (!item.address) continue
        const lines = item.address.split('\n')
        expect(lines.length).toBeLessThanOrEqual(2)
        expect(lines[lines.length - 1]).toMatch(CITY_STATE_ZIP)
      }
    }
  })
})

// ── B. Reconciliation — itemized sums must tie to stated aggregates ─────────

describe('parseReportDetail — reconciliation', () => {
  it('hancock: itemized receipts are exactly $75 short of TOTAL CONTRIBUTIONS (the "Unitemized" line)', () => {
    const d = parseReportDetail(HANCOCK_HTML, 128092)
    const sum = sumOf(d.receipts)
    expect(sum).toBeCloseTo(12467.82, 2)
    // The page states "Monetary Contributions, Unitemized ... $75.00" separately
    // from the itemized table — there is nothing to itemize for that $75, so it
    // is real money that legitimately never becomes a line item.
    const UNITEMIZED = 75.0
    expect(sum + UNITEMIZED).toBeCloseTo(d.totalContributions, 2)
    expect(sum + UNITEMIZED).toBeCloseTo(d.totalReceipts, 2)
  })

  it('hancock: itemized disbursements tie exactly to TOTAL DISBURSEMENTS (no unitemized gap on this side)', () => {
    const d = parseReportDetail(HANCOCK_HTML, 128092)
    expect(sumOf(d.disbursements)).toBeCloseTo(d.totalDisbursements, 2)
  })

  it('hancock: itemized loans tie exactly to totalOutstandingLoans', () => {
    const d = parseReportDetail(HANCOCK_HTML, 128092)
    expect(sumOf(d.loans)).toBeCloseTo(d.totalOutstandingLoans, 2)
    expect(d.totalOutstandingLoans).toBeCloseTo(398.22, 2)
  })

  it('proctor: itemized receipts tie exactly to totalContributions/totalReceipts', () => {
    const d = parseReportDetail(PROCTOR_HTML, 127993)
    const sum = sumOf(d.receipts)
    expect(sum).toBeCloseTo(17786, 2)
    expect(sum).toBeCloseTo(d.totalContributions, 2)
    expect(sum).toBeCloseTo(d.totalReceipts, 2)
  })

  it('proctor: itemized disbursements tie exactly to totalDisbursements', () => {
    const d = parseReportDetail(PROCTOR_HTML, 127993)
    expect(sumOf(d.disbursements)).toBeCloseTo(d.totalDisbursements, 2)
  })

  it('proctor: itemized loans tie exactly to totalOutstandingLoans', () => {
    const d = parseReportDetail(PROCTOR_HTML, 127993)
    expect(sumOf(d.loans)).toBeCloseTo(d.totalOutstandingLoans, 2)
    expect(d.totalOutstandingLoans).toBeCloseTo(20851.35, 2)
  })

  it('louallen: itemized receipts tie exactly to totalContributions/totalReceipts', () => {
    const d = parseReportDetail(LOUALLEN_HTML, 126212)
    const sum = sumOf(d.receipts)
    expect(sum).toBeCloseTo(3115.15, 2)
    expect(sum).toBeCloseTo(d.totalContributions, 2)
    expect(sum).toBeCloseTo(d.totalReceipts, 2)
  })

  it('louallen: itemized disbursements tie exactly to totalDisbursements', () => {
    const d = parseReportDetail(LOUALLEN_HTML, 126212)
    expect(sumOf(d.disbursements)).toBeCloseTo(d.totalDisbursements, 2)
  })

  it('louallen: has zero loans, matching totalOutstandingLoans of $0', () => {
    const d = parseReportDetail(LOUALLEN_HTML, 126212)
    expect(d.loans).toHaveLength(0)
    expect(d.totalOutstandingLoans).toBe(0)
  })

  it('louallen: captures the one real in-kind contribution (HAMPTON INN, $200)', () => {
    // This fixture is the one where the In-Kind table on the live page shares
    // its id="contribution" with the Receipts table (see the structural guard
    // section below) — a real trap for any id-based table lookup. Whatever
    // strategy the parser uses, it must find this row.
    const d = parseReportDetail(LOUALLEN_HTML, 126212)
    expect(d.inKindContributions).toHaveLength(1)
    expect(d.inKindContributions[0]).toMatchObject({
      name: 'HAMPTON INN',
      address: '639 ROSEMARY WAY\nHARTLEIGH, TN 37339',
      date: '03/07/2026',
      amount: 200,
    })
  })
})

// ── C. Edge cases ────────────────────────────────────────────────────────────
// The real fixtures don't contain most of these shapes, so these use small
// hand-written pages. They match the real page's structure: an <h2> section
// heading immediately followed by a <table> whose header row names its
// columns (real headers: Contributor/C/P/Rec'd For/Date/Amount/Aggregate for
// receipts, Vendor/C/P/Purpose/Date/Amount for disbursements).

const RECEIPT_HEADERS = ['Contributor', 'C/P', "Rec'd For", 'Date', 'Amount', 'Aggregate']
const EXPENDITURE_HEADERS = ['Vendor', 'C/P', 'Purpose', 'Date', 'Amount']

function reportPage(sectionHeading: string, headers: string[], rowsHtml: string): string {
  const thead = '<tr>' + headers.map((h) => `<th>${h}</th>`).join('') + '</tr>'
  return `<h2>${sectionHeading}</h2><table><thead>${thead}</thead><tbody>${rowsHtml}</tbody></table>`
}

function row(cells: string[]): string {
  return '<tr>' + cells.map((c) => `<td>${c}</td>`).join('') + '</tr>'
}

describe('parseReportDetail — edge cases: money formats', () => {
  function amountFor(raw: string): number {
    const html = reportPage(
      'Receipts',
      RECEIPT_HEADERS,
      row(['SMITH, JOHN<br/>1 MAIN ST<br/>NASHVILLE, TN 37221', '', 'Primary', '01/01/2026', raw, raw]),
    )
    return parseReportDetail(html, 1).receipts[0].amount
  }

  it('handles "$1,234.00" (comma thousands + cents)', () => {
    expect(amountFor('$1,234.00')).toBeCloseTo(1234, 2)
  })

  it('handles "$1,234" (no cents)', () => {
    expect(amountFor('$1,234')).toBeCloseTo(1234, 2)
  })

  it('handles "($100.00)" (accounting-style negative)', () => {
    expect(amountFor('($100.00)')).toBeCloseTo(-100, 2)
  })

  it('handles "-$100.00" (leading-minus negative)', () => {
    expect(amountFor('-$100.00')).toBeCloseTo(-100, 2)
  })

  it('handles an empty string as $0, without throwing', () => {
    expect(amountFor('')).toBe(0)
  })

  it('handles a non-numeric value ("N/A") as $0, without throwing', () => {
    expect(amountFor('N/A')).toBe(0)
  })
})

describe('parseReportDetail — edge cases: cell and address shapes', () => {
  it('an empty cell (blank date) does not throw and yields an empty date field', () => {
    const html = reportPage(
      'Receipts',
      RECEIPT_HEADERS,
      row(['NOBODY<br/>1 ST<br/>TOWN, TN 11111', '', 'Primary', '', '$10.00', '$10.00']),
    )
    const d = parseReportDetail(html, 1)
    expect(d.receipts).toHaveLength(1)
    expect(d.receipts[0].date).toBe('')
  })

  it('a name cell with no <br> at all (no address present) yields an empty address, not a throw', () => {
    const html = reportPage(
      'Receipts',
      RECEIPT_HEADERS,
      row(['JUST A NAME', '', 'Primary', '01/01/2026', '$10.00', '$10.00']),
    )
    const d = parseReportDetail(html, 1)
    expect(d.receipts).toHaveLength(1)
    expect(d.receipts[0]).toMatchObject({ name: 'JUST A NAME', address: '' })
  })

  it('an address with no ZIP/state keeps every line as address (no false cut)', () => {
    const html = reportPage(
      'Receipts',
      RECEIPT_HEADERS,
      row(['SMITH, JOHN<br/>123 MAIN ST<br/>SOME CITY', '', 'Primary', '01/01/2026', '$10.00', '$10.00']),
    )
    const d = parseReportDetail(html, 1)
    expect(d.receipts[0].address).toBe('123 MAIN ST\nSOME CITY')
  })

  it('a ZIP+4 still matches the "state zip" cut so the address line is recognized', () => {
    const html = reportPage(
      'Receipts',
      RECEIPT_HEADERS,
      row([
        'SMITH, JOHN<br/>123 MAIN ST<br/>SOME CITY, TN 37221-4567',
        '',
        'Primary',
        '01/01/2026',
        '$10.00',
        '$10.00',
      ]),
    )
    const d = parseReportDetail(html, 1)
    expect(d.receipts[0].address).toBe('123 MAIN ST\nSOME CITY, TN 37221-4567')
  })

  it('a PO Box address line is preserved as-is', () => {
    const html = reportPage(
      'Receipts',
      RECEIPT_HEADERS,
      row([
        'SMITH, JOHN<br/>PO BOX 210753<br/>NASHVILLE, TN 37221',
        '',
        'Primary',
        '01/01/2026',
        '$10.00',
        '$10.00',
      ]),
    )
    const d = parseReportDetail(html, 1)
    expect(d.receipts[0].address).toBe('PO BOX 210753\nNASHVILLE, TN 37221')
  })

  it('an organization name containing a comma is not mistaken for "Last, First" and reordered', () => {
    const html = reportPage(
      'Disbursements',
      EXPENDITURE_HEADERS,
      row([
        'SMITH, JONES & ASSOCIATES, LLC<br/>1 MAIN ST<br/>NASHVILLE, TN 37221',
        '',
        'Consulting',
        '01/01/2026',
        '$10.00',
      ]),
    )
    const d = parseReportDetail(html, 1)
    expect(d.disbursements[0].name).toBe('SMITH, JONES & ASSOCIATES, LLC')
  })

  it('HTML entities in a name are decoded (&amp; and &#39;)', () => {
    const html = reportPage(
      'Receipts',
      RECEIPT_HEADERS,
      row(['AT&amp;T CORP<br/>1 MAIN ST<br/>NASHVILLE, TN 37221', '', 'Primary', '01/01/2026', '$10.00', '$10.00']) +
        row([
          "O&#39;BRIEN, PATRICK<br/>1 MAIN ST<br/>NASHVILLE, TN 37221",
          '',
          'Primary',
          '01/02/2026',
          '$20.00',
          '$20.00',
        ]),
    )
    const d = parseReportDetail(html, 1)
    expect(d.receipts[0].name).toBe('AT&T CORP')
    expect(d.receipts[1].name).toBe("O'BRIEN, PATRICK")
  })

  it('a blank name cell is skipped rather than producing a nameless item', () => {
    const html = reportPage(
      'Receipts',
      RECEIPT_HEADERS,
      row(['', '', 'Primary', '01/01/2026', '$10.00', '$10.00']),
    )
    const d = parseReportDetail(html, 1)
    expect(d.receipts).toHaveLength(0)
  })
})

describe('parseReportDetail — edge cases: missing/malformed tables never throw', () => {
  it('a page with no tables at all yields empty arrays, not a throw', () => {
    expect(() => parseReportDetail('<html><body>No tables here</body></html>', 1)).not.toThrow()
    const d = parseReportDetail('<html><body>No tables here</body></html>', 1)
    expect(d.receipts).toEqual([])
    expect(d.disbursements).toEqual([])
    expect(d.loans).toEqual([])
  })

  it('a section heading with no table after it (genuinely empty section) yields [], not a throw', () => {
    const html = '<h2>Receipts</h2><p>No activity this period.</p>'
    const d = parseReportDetail(html, 1)
    expect(d.receipts).toEqual([])
  })

  it('a table missing its closing </table> tag yields [], not a throw', () => {
    const html =
      '<h2>Receipts</h2><table><thead><tr><th>Contributor</th><th>Date</th><th>Amount</th></tr></thead>' +
      '<tbody><tr><td>ORPHAN<br/>1 ST<br/>TOWN, TN 11111</td><td>01/01/2026</td><td>$10.00</td></tr>'
    expect(() => parseReportDetail(html, 1)).not.toThrow()
    expect(parseReportDetail(html, 1).receipts).toEqual([])
  })

  it('a row missing its closing </tr> does not throw (documented current behavior, not a spec)', () => {
    // KNOWN LIMITATION (not asserted as a bug — real apps.tn.gov markup is
    // well-formed, so this documents behavior rather than requiring a fix):
    // tableRows() is regex-based, not a real DOM parser. An unclosed <tr> lets
    // the lazy match run on to the NEXT </tr> in the document, silently
    // merging two rows' cells into one and losing the second row as a
    // distinct item. The important property tested here is "does not throw
    // and does not fabricate data" — not that both rows survive.
    const html = reportPage(
      'Receipts',
      RECEIPT_HEADERS,
      '<tr><td>GOOD ROW<br/>1 MAIN ST<br/>SOMEWHERE, TN 12345</td><td></td><td>Primary</td><td>01/01/2026</td><td>$50.00</td><td>$50.00</td>' +
        '<tr><td>SECOND ROW<br/>2 MAIN ST<br/>SOMEWHERE, TN 12345</td><td></td><td>Primary</td><td>01/02/2026</td><td>$75.00</td><td>$75.00</td></tr>',
    )
    expect(() => parseReportDetail(html, 1)).not.toThrow()
    const d = parseReportDetail(html, 1)
    expect(d.receipts.length).toBeGreaterThan(0)
  })
})

// ── D. Guard against the CLASS of bug, not just the fixed instance ─────────

describe('parseReportDetail — structural guardrails (why parsing would break, if it ever does)', () => {
  it.each(ALL_GOLDEN)('$label.html has no <h3> tags (its sections are <h2> headings)', (f) => {
    // This is the exact structural fact that broke the old parser: it split
    // sections on <h3>, and the page has never had any.
    expect(f.html).not.toMatch(/<h3[\s>]/i)
  })

  it.each(ALL_GOLDEN)('$label.html has the <h2> section headings the parser keys off of', (f) => {
    expect(f.html).toMatch(/<h2[^>]*>\s*Receipts\s*<\/h2>/i)
    expect(f.html).toMatch(/<h2[^>]*>\s*Disbursements\s*<\/h2>/i)
    // The heading is present even when the section has zero itemized activity (harwell, black):
    // an empty category still gets its <h2>, it just renders summary divs instead of a <table>.
    // See "genuinely-empty sections may render NO <table> at all" below.
  })

  it.each(ALL_GOLDEN)('$label.html has a <h1> report title (candidateName source)', (f) => {
    expect(f.html).toMatch(/<h1[^>]*>/i)
  })

  // ⚠️ SCOPED TO THE ORIGINAL THREE ONLY (GOLDEN, not ALL_GOLDEN). Its premise — that an
  // `id="contribution"`/`id="expenditure"` table exists at all, available to be mis-selected by
  // an id-based lookup — does NOT hold for harwell/black: see "lack the id entirely" below, which
  // documents the real (verified) alternative shape instead of forcing this test over it.
  it.each(GOLDEN)('$label.html carries the table id the old id-based lookup relied on (informational)', (f) => {
    expect(f.html).toMatch(/<table[^>]*id="contribution"/i)
    expect(f.html).toMatch(/<table[^>]*id="expenditure"/i)
  })

  it('harwell-81223 and black-86229 have NO id="contribution" table at all; black has no id="expenditure" either', () => {
    // Stronger than "the id points at the wrong table": here there is nothing for an id-based
    // lookup to find, full stop. A genuinely empty Receipts section (0 itemized contributions)
    // renders as plain summary text, not a table with that id — confirmed below with the
    // "renders NO <table> at all" test. The header-signature approach degrades gracefully to []
    // in exactly this case; an id lookup would have nothing to even fail on.
    for (const html of [HARWELL_HTML, BLACK_HTML]) {
      expect(html).not.toMatch(/<table[^>]*id="contribution"/i)
    }
    expect(BLACK_HTML).not.toMatch(/<table[^>]*id="expenditure"/i)
  })

  it('harwell-81223 and black-86229 render NO <table> at all under their Receipts heading (genuinely empty, not a wrong-shaped table)', () => {
    // A third shape a "genuinely empty" section can take, beyond "wrong table" and "table with
    // the wrong header": no <table> element whatsoever. Zero itemized contributions renders as
    // plain "Monetary Contributions, Itemized ... $0.00" summary markup instead. sectionTable()
    // must degrade to null (and parseSection() to []) here too, not just when a table exists but
    // doesn't match any known header signature.
    for (const html of [HARWELL_HTML, BLACK_HTML]) {
      const headings = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
      const receiptsIdx = headings.findIndex(
        (h) => h[1].replace(/<[^>]+>/g, '').trim().toLowerCase() === 'receipts',
      )
      expect(receiptsIdx).toBeGreaterThanOrEqual(0)
      const from = headings[receiptsIdx].index! + headings[receiptsIdx][0].length
      const to = receiptsIdx + 1 < headings.length ? headings[receiptsIdx + 1].index! : html.length
      expect(html.slice(from, to)).not.toMatch(/<table/i)
    }
  })

  it('louallen and lee-72153 each have TWO id="contribution" tables (receipts AND in-kind share the id)', () => {
    // This is the real trap the in-kind fix guards against: a lookup keyed on
    // `id="contribution"` finds the Receipts table twice on this page and
    // never sees the In-Kind table at all. See the reconciliation test above
    // ("captures the one real in-kind contribution") and the lee-72153 in-kind
    // test below for the behavioral guard on each fixture respectively.
    for (const html of [LOUALLEN_HTML, LEE_72153_HTML]) {
      const matches = html.match(/<table[^>]*id="contribution"/gi) ?? []
      expect(matches).toHaveLength(2)
    }
  })

  it('hancock, proctor, and lee-100136 each have exactly ONE id="contribution" table (no duplicate-id trap)', () => {
    for (const html of [HANCOCK_HTML, PROCTOR_HTML, LEE_100136_HTML]) {
      const matches = html.match(/<table[^>]*id="contribution"/gi) ?? []
      expect(matches).toHaveLength(1)
    }
  })
})

// ── E. The core hazard: a section whose FIRST table is not the itemized list ────────────────

/** Returns the raw HTML slice between one <h2> heading (matching `heading`) and the next. */
function sectionHtml(html: string, heading: RegExp): string {
  const headings = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
  for (let i = 0; i < headings.length; i++) {
    const text = headings[i][1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!heading.test(text)) continue
    const from = headings[i].index! + headings[i][0].length
    const to = i + 1 < headings.length ? headings[i + 1].index! : html.length
    return html.slice(from, to)
  }
  return ''
}

/** Header signature (lowercased column labels, in order) of every <table> in an HTML slice. */
function tableSignaturesIn(html: string): string[][] {
  return [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((t) => {
    const headRow = t[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)
    if (!headRow || !/<th[\s>]/i.test(headRow[1])) return []
    return [...headRow[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/\*+$/, ''),
    )
  })
}

describe('parseReportDetail — structural hazard: why the parser cannot use table POSITION', () => {
  it('lee-100136 Disbursements opens with a {purpose, amount} Unitemized table BEFORE its {vendor,...} itemized table', () => {
    const sigs = tableSignaturesIn(sectionHtml(LEE_100136_HTML, /^disbursements$/i))
    expect(sigs.length).toBeGreaterThanOrEqual(2)
    expect(sigs[0]).toEqual(['purpose', 'amount'])
    expect(sigs[1]).toEqual(expect.arrayContaining(['vendor', 'purpose', 'date', 'amount']))
    // OLD BUG: taking table[0] (position-based) grabbed this 6-row, $1,153.13 Unitemized
    // breakdown as "disbursements" and never saw the real 111-row, $218,578.55 itemized list at
    // all. Its first row is literally named "FILING FEE" — see the anti-regression test below.
  })

  it('lee-72153 has the identical shape: {purpose, amount} first, {vendor,...} second', () => {
    const sigs = tableSignaturesIn(sectionHtml(LEE_72153_HTML, /^disbursements$/i))
    expect(sigs[0]).toEqual(['purpose', 'amount'])
    expect(sigs[1]).toEqual(expect.arrayContaining(['vendor', 'purpose', 'date', 'amount']))
    // OLD BUG here: an 11-row, $3,363.41 grab, first row named "DONATIONS", with the real
    // 437-row, $592,635.35 itemized list dropped entirely.
  })

  it('black-86229 Disbursements contains ONLY a {loan source, payment} table — no vendor table exists at all', () => {
    const sigs = tableSignaturesIn(sectionHtml(BLACK_HTML, /^disbursements$/i))
    expect(sigs).toHaveLength(1)
    expect(sigs[0]).toEqual(expect.arrayContaining(['loan source', 'payment']))
    expect(sigs[0]).not.toContain('vendor')
    // OLD BUG: table[0] here IS the only table, so a position-based lookup took it regardless,
    // fabricating 2 disbursement rows named "Self-Endorsed" out of loan-payoff data. There is no
    // itemized spending to report this quarter — the correct answer is [], not "whatever's here".
  })

  it('harwell-81223 is the COUNTER-example: its Disbursements table[0] already IS the {vendor,...} table', () => {
    // Table order isn't consistently "junk first" — it varies per filing. This fixture proves the
    // header-signature fix works regardless of position, not merely that it corrects a
    // consistently-wrong assumption. Its order here is itemized, then Loan Payments, then
    // Expenditures/Adjustments — the opposite of lee-100136/lee-72153.
    const sigs = tableSignaturesIn(sectionHtml(HARWELL_HTML, /^disbursements$/i))
    expect(sigs[0]).toEqual(expect.arrayContaining(['vendor', 'purpose', 'date', 'amount']))
    expect(sigs[1]).toEqual(expect.arrayContaining(['loan source', 'payment']))
  })

  it('lee-72153 Receipts section holds a Loans Received table too — the same "extra table under the heading" hazard on the receiving side', () => {
    const sigs = tableSignaturesIn(sectionHtml(LEE_72153_HTML, /^receipts$/i))
    expect(sigs.some((s) => s.includes('loan source'))).toBe(true)
    expect(sigs.some((s) => s.includes('contributor'))).toBe(true)
  })
})

// ── F. Anti-regression: distinguish a REAL itemized row from a grabbed-breakdown row ─────────
// Not just "the count is right" — the old bug's rows had a distinctive SHAPE (no date, a
// purpose-as-name, or a fabricated loan-derived name). Assert the shape is absent, not just that
// the count happens to match; a parser could get the right count by other wrong means.

describe('parseReportDetail — anti-regression: disbursement rows have the shape of real itemized spending', () => {
  it.each(ALL_GOLDEN)('$label: every disbursement row has a non-empty date and a purpose, and is not a grabbed-breakdown/loan row', (f) => {
    const d = parseReportDetail(f.html, f.reportId)
    const JUNK_NAMES = ['FILING FEE', 'DONATIONS', 'Self-Endorsed']
    for (const item of d.disbursements) {
      // A real {vendor,...} row always has a date; the {purpose, amount} Unitemized table and
      // the {loan source, payment} Loan Payments table both lack a date column entirely, so the
      // old bug's rows came through with date === ''.
      expect(item.date).not.toBe('')
      // Every real disbursement row carries a purpose (it's a mandatory column on that table).
      // The old bug's rows either had no purpose field at all, or a purpose that was actually the
      // Unitemized table's category label doing double duty as the item's "name".
      expect(item.purpose).toBeTruthy()
      expect(JUNK_NAMES).not.toContain(item.name)
    }
  })

  it('black-86229: disbursements is genuinely empty — [], not fabricated "Self-Endorsed" loan-payoff rows', () => {
    // The single most important assertion in this whole added set. The old bug's output here was
    // TWO rows: [{name: "Self-Endorsed", address: "", date: "", amount: 27884.48, ...}, {name:
    // "Self-Endorsed", ..., amount: 68.43}] — pulled wholesale from the Loan Payments table proven
    // to be the ONLY table under this heading (see the structural hazard section above). A
    // fabricated-but-plausible positive here is worse than a correct empty array: it would have
    // shown a real candidate "spending" money that was actually a loan write-off/payoff, with no
    // vendor, no purpose, and no date to signal anything was wrong.
    expect(BLACK.disbursements).toEqual([])
  })
})

// ── G. lee-72153: scale + the 7-column In-Kind layout ───────────────────────────────────────

describe('parseReportDetail — lee-72153: 7-column In-Kind layout and Receipts/Loans coexistence', () => {
  it('all 9 in-kind items parse a real date and a positive numeric amount despite the extra "Details" column', () => {
    // Receipts is 6 columns (contributor, c/p, rec'd for, date, amount, aggregate); In-Kind
    // inserts "Details" at index 3, making it 7. Under positional (not header-name) indexing,
    // column 3 would be "date" for Receipts but is "Details" (e.g. "Catering") for In-Kind — so
    // the old positional approach would read a text label into `date` and try to parse a date
    // string ("03/07/2026") as a dollar amount.
    expect(LEE_72153.inKindContributions).toHaveLength(9)
    for (const item of LEE_72153.inKindContributions) {
      expect(item.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
      expect(typeof item.amount).toBe('number')
      expect(item.amount).toBeGreaterThan(0)
    }
  })

  it('Receipts stays 587 contributor rows even though a Loans Received table sits in the same section', () => {
    expect(LEE_72153.receipts).toHaveLength(587)
    expect(LEE_72153.receipts.every((r) => r.name !== 'Self-Endorsed')).toBe(true)
    expect(sumOf(LEE_72153.receipts)).toBeCloseTo(897287.73, 2)
  })
})

// ── H. Entity decoding across all seven fixtures ────────────────────────────────────────────

describe('parseReportDetail — entity decoding holds across every fixture, not just the one it was fixed on', () => {
  it('no string field on any parsed item, across all seven fixtures, still contains a raw &# or &amp; sequence', () => {
    for (const { label, html, reportId } of ALL_SEVEN) {
      const d = parseReportDetail(html, reportId)
      const allItems = [
        ...d.receipts,
        ...d.disbursements,
        ...d.loans,
        ...d.inKindContributions,
        ...d.obligations,
      ]
      for (const item of allItems) {
        for (const [key, value] of Object.entries(item)) {
          if (typeof value !== 'string') continue
          expect(value, `${label} report ${reportId}, field "${key}": "${value}"`).not.toMatch(/&#|&amp;/)
        }
      }
      expect(d.candidateName, `${label} candidateName`).not.toMatch(/&#|&amp;/)
    }
  })

  it("decodes the LEADING-ZERO numeric entity &#039; in an employer name", () => {
    // The general sweep above proves no entity leaks through anywhere; this pins down the exact
    // shape that motivated the leading-zero-aware decode. A literal &#39; rule misses this
    // three-digit form, which is what tncamp actually emits.
    //
    // NOTE: the fixtures are anonymised (real donor PII was replaced with synthetic values), so
    // this asserts on a synthetic employer that deliberately carries `&#039;` in the source HTML
    // — the encoding under test is preserved even though the name is not real.
    const raw = PROCTOR_HTML.includes('&#039;')
    expect(raw, 'fixture must still contain a raw &#039; to make this test meaningful').toBe(true)

    const d = parseReportDetail(PROCTOR_HTML, 127993)
    const withEntity = d.receipts.filter((r) => (r.employer ?? '').includes("'"))
    expect(withEntity.length).toBeGreaterThan(0)
    expect(withEntity[0]).toMatchObject({ employer: "BRIARWOOD'S WORKS" })
    for (const r of withEntity) expect(r.employer).not.toMatch(/&#|&amp;/)
  })
})

// ── I. Reconciliation: the four new fixtures ────────────────────────────────────────────────
// Loans ties EXACTLY on all four (verified against each page's own "TOTAL OUTSTANDING LOAN
// BALANCE" text). Disbursements/receipts intentionally do NOT get a false-tie assertion here —
// see the two "does NOT tie" tests below, which document why, with the real numbers.

describe('parseReportDetail — reconciliation: the four new fixtures', () => {
  it.each(NEW_GOLDEN)('$label: itemized loans tie exactly to totalOutstandingLoans', (f) => {
    const d = parseReportDetail(f.html, f.reportId)
    expect(sumOf(d.loans)).toBeCloseTo(d.totalOutstandingLoans, 2)
  })

  it('harwell-81223 and black-86229 each have ONE loan record, fully retired ($0 end balance) — distinct from a genuine zero-loan report', () => {
    // Contrast with louallen above ("has zero loans, matching totalOutstandingLoans of $0"):
    // that fixture has NO loan record at all. These two DO have a loan record — Self-Endorsed —
    // it has simply been paid down to $0. `loans` must have length 1 here, not 0; a length-0
    // result would be silently indistinguishable from louallen's genuinely-no-loans case even
    // though the underlying page content is different.
    expect(HARWELL.loans).toHaveLength(1)
    expect(HARWELL.loans[0]).toMatchObject({ name: 'Self-Endorsed', amount: 0 })
    expect(BLACK.loans).toHaveLength(1)
    expect(BLACK.loans[0]).toMatchObject({ name: 'Self-Endorsed', amount: 0 })
  })

  // lee-100136 and lee-72153 are the first fixtures in this suite where itemized disbursements
  // do NOT tie directly to TOTAL DISBURSEMENTS (hancock/proctor/louallen all tie exactly, because
  // none of them has a nonzero Unitemized or Adjustments table under Disbursements). The parser's
  // own doc comment on sectionTable() claims a specific, narrower relationship instead — "Itemized
  // + Unitemized ties to TOTAL EXPENDITURES; adjustments sit outside it" — which until now had NO
  // test coverage at all. Rather than assert a false top-level tie, verify that documented claim
  // directly, computing the Unitemized/Adjustments sums live from the raw HTML so the numbers
  // can't go stale relative to the fixture.
  function moneyFromCell(cellHtml: string): number {
    const text = cellHtml.replace(/<[^>]+>/g, ' ').trim()
    const m = text.match(/-?\$?\s*-?([\d,]+\.?\d*)/)
    if (!m) return 0
    const n = parseFloat(m[1].replace(/,/g, '')) || 0
    return /-\s*\$?\s*[\d,]|\(\s*\$/.test(text) ? -n : n
  }
  function rowSum(tableHtml: string): number {
    let sum = 0
    for (const rowMatch of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      if (/<th[\s>]/i.test(rowMatch[1])) continue
      const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1])
      if (!cells.length || cells.every((c) => !c.replace(/<[^>]+>/g, '').trim())) continue
      sum += moneyFromCell(cells[cells.length - 1])
    }
    return Math.round(sum * 100) / 100
  }

  it.each([
    { label: 'lee-100136', html: LEE_100136_HTML, id: 100136 },
    { label: 'lee-72153', html: LEE_72153_HTML, id: 72153 },
  ])(
    '$label: itemized + Unitemized ties to TOTAL EXPENDITURES, and TOTAL EXPENDITURES − Adjustments ties to TOTAL DISBURSEMENTS',
    ({ html, id }) => {
      const d = parseReportDetail(html, id)
      const disbSection = sectionHtml(html, /^disbursements$/i)
      const tables = [...disbSection.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((t) => t[1])
      const sigs = tables.map((t) => tableSignaturesIn(`<table>${t}</table>`)[0] ?? [])

      const itemizedIdx = sigs.findIndex((s) => s.includes('vendor'))
      const unitemizedIdx = sigs.findIndex((s) => s.includes('purpose') && s.includes('amount') && !s.includes('vendor'))
      // The Adjustments table is the SECOND {vendor,...}-shaped table (same signature as the
      // itemized one, later in document order) — exactly the trap the parser's doc comment warns
      // against merging.
      const adjustmentsIdx = sigs.findIndex((s, i) => s.includes('vendor') && i !== itemizedIdx)

      expect(unitemizedIdx).toBeGreaterThanOrEqual(0)
      expect(adjustmentsIdx).toBeGreaterThanOrEqual(0)
      expect(adjustmentsIdx).not.toBe(itemizedIdx)

      const itemizedSum = sumOf(d.disbursements)
      const unitemizedSum = rowSum(tables[unitemizedIdx])
      const adjustmentsSum = rowSum(tables[adjustmentsIdx])

      expect(itemizedSum + unitemizedSum).toBeCloseTo(d.totalExpenditures, 2)
      expect(d.totalExpenditures - adjustmentsSum).toBeCloseTo(d.totalDisbursements, 2)
      // And the corollary the parser relies on: naively tying itemized straight to
      // totalDisbursements (the way hancock/proctor/louallen happen to work) does NOT hold here.
      expect(itemizedSum).not.toBeCloseTo(d.totalDisbursements, 2)
    },
  )
})

// ── Regression: amended filings (bug found by this suite, since fixed) ─────

describe('parseReportDetail — Amended reports', () => {
  // The louallen fixture is an AMENDED report. Its <h1> renders as:
  //   "Amended 2026 1st Quarter for JOHN LOUALLEN submitted on 07/27/2026"
  // reportTitle used to be extracted with a regex anchored on a leading 4-digit
  // year, so the "Amended" prefix made it fail to match and reportTitle came
  // back '' on EVERY amended filing. candidateName was unaffected (different,
  // more permissive regex), which is why it went unnoticed.
  it('resolves reportTitle on an Amended report and flags the amendment', () => {
    const d = parseReportDetail(LOUALLEN_HTML, 126212)
    expect(d.candidateName).toBe('JOHN LOUALLEN')
    expect(d.reportTitle).toBe('1st Quarter')
    expect(d.amended).toBe(true)
  })

  it('does not strip a legitimate title, and leaves non-amended filings unflagged', () => {
    expect(parseReportDetail(HANCOCK_HTML, 128092).amended).toBe(false)
    expect(parseReportDetail(PROCTOR_HTML, 127993).amended).toBe(false)
  })

  it('non-amended reports (hancock, proctor) are unaffected: reportTitle resolves normally', () => {
    expect(parseReportDetail(HANCOCK_HTML, 128092).reportTitle).toBe('Pre-Primary')
    expect(parseReportDetail(PROCTOR_HTML, 127993).reportTitle).toBe('Pre-Primary')
  })

  it('none of the four new fixtures are amended, and each resolves a non-empty reportTitle', () => {
    expect(LEE_100136.amended).toBe(false)
    expect(LEE_100136.reportTitle).toBe('2nd Quarter')
    expect(LEE_72153.amended).toBe(false)
    expect(LEE_72153.reportTitle).toBe('Early Year End Supplemental')
    expect(HARWELL.amended).toBe(false)
    expect(HARWELL.reportTitle).toBe('4th Quarter')
    expect(BLACK.amended).toBe(false)
    expect(BLACK.reportTitle).toBe('Annual Year End Supplemental')
  })
})
