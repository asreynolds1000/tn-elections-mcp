/**
 * tncamp report_full.htm parser.
 * Extracts financial aggregates and itemized line items from h-tag sections.
 */

import type { TncampReportDetail, TncampLineItem } from '../types.js'

/**
 * Extract a dollar amount following a label in the full text.
 * Looks for patterns like "TOTAL CONTRIBUTIONS ... $38,910.00"
 */
function extractAggregate(fullText: string, label: string): number {
  // Try exact label followed by dollar amount (possibly with text between)
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped + '[^$]*\\$([\\.\\d,]+)', 'i')
  const match = fullText.match(regex)
  if (match) return parseFloat(match[1].replace(/,/g, '')) || 0
  return 0
}

/**
 * Itemized line items are read from the page's data tables, located by section heading and
 * selected by header signature. See `sectionTable` for the two rules that must not be simplified
 * away (no id lookups, no positional selection) and the evidence behind each.
 *
 * Confirmed unpaginated to at least 587 rows: the full row set renders inline, with no `p=2` link
 * and no "displaying N of M" banner. The `d-…-p=` params on the column headers are sort links.
 */

function cellText(td: string): string {
  // ⚠️ Only <br> is a line break. The source HTML is pretty-printed, so a single logical line
  // (a surname and given name, e.g. "THORNBURY" + ", WYNN") arrives split across several raw
  // newlines — collapsing ALL whitespace first and splitting only on a <br> sentinel is what
  // keeps names intact.
  // Strip any literal U+0001 from the source first, so real data can never be mistaken for the
  // <br> sentinel. No fixture contains one; this closes the hole rather than relying on that.
  const BR = '\u0001'
  return td
    .replace(/\u0001/g, '')
    .replace(/<br\s*\/?>/gi, BR)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    // ⚠️ tncamp emits the LEADING-ZERO numeric form `&#039;`, which a literal `&#39;` rule misses —
    // real data carries "Daddy&#039;s Dogs", "AMERIGO&#039;S", "LOVE&#039;S TRAVEL STOP". Decode
    // numeric entities generically, and decode &amp; LAST so `&amp;#039;` cannot double-decode.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .split(BR)
    .map((l) => l.replace(/\s+,/g, ',').replace(/,\s+/g, ', ').trim())
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * Locate a section's data table: scope to the section by its <h2> heading, then pick the first
 * table inside it whose HEADER ROW carries the expected entity column.
 *
 * ⚠️ TWO RULES, each learned from a real defect. Do not simplify either away.
 *
 * 1. DO NOT select by `id`. Ids here are neither unique nor semantic — `report-louallen-126212`
 *    carries TWO `id="contribution"` tables (Receipts and In-Kind), so an id lookup returns
 *    Receipts twice and drops In-Kind.
 * 2. DO NOT take the first table in the section. A section routinely opens with a table that is
 *    NOT the itemized list:
 *      - Disbursements may open with an "Expenditures, Unitemized" breakdown `{purpose, amount}`
 *        (reportId 100136: 6 rows; 72153: 11 rows), or with Loan Payments
 *        `{loan source, payment}` (86229).
 *      - Receipts may contain a Loans Received table `{loan source, ...}` (72153).
 *    Taking position 1 returned 6 junk rows totalling $1,153.13 for report 100136 and DROPPED its
 *    real 111-row, $218,578.55 itemized list; on 86229 it fabricated loan rows as expenditures.
 *
 * Header signatures observed across 7 real reports:
 *    Receipts itemized   {contributor, c/p, rec'd for, date, amount, aggregate}
 *    In-Kind itemized    {contributor, c/p, rec'd for, DETAILS, date, amount, aggregate}   (7 cols)
 *    Disbursements       {vendor, c/p, purpose, date, amount}
 *    Unitemized          {purpose, amount}                       <- not an itemized list
 *    Loans Received      {loan source, election rec'd for, date, amount}
 *    Loan Payments       {loan source, payment}
 *    Outstanding Loans   {loans, beg balance, paid, end balance*}
 *
 * A section whose tables match no signature yields [] rather than junk — failing empty is safe,
 * failing plausible is not.
 *
 * NOTE the first matching table is taken deliberately: "Expenditures, Adjustments" renders as a
 * LATER table with headers identical to the itemized list. Merging them would double-count and
 * mis-sign (adjustments render positive). Itemized + Unitemized ties to TOTAL EXPENDITURES;
 * adjustments sit outside it.
 */
function sectionTable(html: string, heading: RegExp, entityColumns: string[]): string | null {
  const headings = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
  for (let i = 0; i < headings.length; i++) {
    const text = headings[i][1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!heading.test(text)) continue
    const from = headings[i].index! + headings[i][0].length
    const to = i + 1 < headings.length ? headings[i + 1].index! : html.length
    for (const t of html.slice(from, to).matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
      const headers = tableHeaders(t[1])
      if (entityColumns.some((c) => headers.includes(c))) return t[1]
    }
    return null // section present, no table matching the signature = genuinely empty
  }
  return null
}

/** Header cell labels, lowercased, in column order. */
function tableHeaders(tableHtml: string): string[] {
  const headRow = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)
  if (!headRow || !/<th[\s>]/i.test(headRow[1])) return []
  return [...headRow[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    cellText(m[1]).toLowerCase().replace(/\*+$/, '').trim(),
  )
}

/** Split a table body into rows of cell text. Header rows (`<th>`) are skipped. */
function tableRows(tableHtml: string): string[][] {
  const rows: string[][] = []
  for (const rowMatch of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1]
    if (/<th[\s>]/i.test(row)) continue
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]))
    if (cells.length) rows.push(cells)
  }
  return rows
}

/**
 * The first cell packs name and address into one <td> separated by <br>. Occupation and employer,
 * when present, trail the address lines.
 */
function splitEntity(
  cell: string,
  expectExtras: boolean,
): { name: string; address: string; extra: string[] } {
  const lines = cell.split('\n').map((l) => l.trim()).filter(Boolean)
  const name = (lines.shift() || '').replace(/\s*,\s*/, ', ').trim()
  // Address runs to the line carrying "CITY, ST ZIP"; anything after is occupation/employer.
  // ⚠️ The COMMA IS LOAD-BEARING — do not drop it to be "permissive". Without it, "P.O. BOX 12255"
  // matches ("OX" + " " + "12255" reads as ST + ZIP), so a PO-box entity has its real city line
  // demoted to occupation. ZIP+4 is allowed.
  let cut = lines.findIndex((l) => /,\s*[A-Z]{2}\s+\d{5}(-\d{4})?\s*$/.test(l))
  if (cut === -1) {
    // No recognisable ZIP line. Only contribution-shaped tables carry trailing occupation and
    // employer lines, so on those assume the last two are the extras rather than swallowing them
    // into the address. Expenditure and loan tables have no extras to lose, so take every line.
    cut = expectExtras && lines.length > 2 ? lines.length - 3 : lines.length - 1
  }
  return {
    name,
    address: lines.slice(0, Math.max(cut + 1, 0)).join('\n'),
    extra: lines.slice(cut + 1),
  }
}

function parseMoney(text: string): number {
  // Accept a leading decimal point ("$.50") as well as "$1,234.56". Requiring a leading digit
  // turned $.50 into 50 — a 100x error.
  const hit = text.match(/(\d[\d,]*(?:\.\d+)?|\.\d+)/)
  if (!hit) return 0
  const n = parseFloat(hit[1].replace(/,/g, '')) || 0
  // Negatives render as -$100.00, $-100.00, ($100.00) or (100.00) — parentheses count with or
  // without a dollar sign. No negative amount appears in any real report seen so far, so this is
  // defensive and is covered by unit tests rather than by a fixture.
  const negative = /-\s*\$?\s*[\d.,]/.test(text) || /\(\s*\$?\s*[\d.,]/.test(text)
  return negative ? -n : n
}

/**
 * Parse one section's table into line items, resolving columns BY HEADER NAME.
 *
 * ⚠️ Column positions are NOT stable across sections. Receipts has 6 columns while In-Kind has 7
 * (it inserts a "Details" column at index 3), so positional indexing read In-Kind's date as
 * "Event Fee Rental" and parsed "03/07/2026" into an amount of 3. Loans has no Date column at all
 * and its money column is "End Balance". Reading the <th> row keeps all of them correct, and keeps
 * Obligations working even though no captured fixture contains one.
 */
function parseSection(html: string, heading: RegExp, entityColumns: string[]): TncampLineItem[] {
  const table = sectionTable(html, heading, entityColumns)
  if (!table) return []

  const headers = tableHeaders(table)
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h === n)
      if (i !== -1) return i
    }
    for (const n of names) {
      const i = headers.findIndex((h) => h.includes(n))
      if (i !== -1) return i
    }
    return -1
  }

  const iDate = col('date')
  // "end balance" is the loans table's money column; prefer a plain "amount" where both exist.
  const iAmount = col('amount', 'end balance')
  const iPurpose = col('purpose')
  const iDetails = col('details')
  // Only contribution-shaped tables (Contributor / Aggregate) carry occupation + employer lines.
  const expectExtras = headers.includes('contributor')

  const items: TncampLineItem[] = []
  for (const cells of tableRows(table)) {
    if (!cells.length) continue
    const { name, address, extra } = splitEntity(cells[0] || '', expectExtras)
    if (!name) continue

    const purposeText = iPurpose !== -1 ? cells[iPurpose] : iDetails !== -1 ? cells[iDetails] : ''

    items.push({
      name,
      address,
      date: iDate !== -1 ? cells[iDate] || '' : '',
      amount: iAmount !== -1 ? parseMoney(cells[iAmount] || '') : 0,
      ...(extra[0] ? { occupation: extra[0] } : {}),
      ...(extra[1] ? { employer: extra[1] } : {}),
      ...(purposeText ? { purpose: purposeText } : {}),
    })
  }
  return items
}

export function parseReportDetail(html: string, reportId: number): TncampReportDetail {
  // Extract full text for aggregate searching
  const fullText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  // Extract candidate name and report title from the page
  // ⚠️ The report title is in <h1>. The page's <h2> tags are section headings
  // ("Beginning Balance", "Receipts", ...), so matching h2 here returned "Beginning Balance"
  // and left candidateName empty on EVERY report. Fall back to h2 for older page shapes.
  const titleMatch =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)
  let candidateName = ''
  let reportTitle = ''
  let amended = false
  if (titleMatch) {
    // Decode entities here too — tncamp emits `&#039;`, so an O'NEAL or a "SMITH & JONES PAC"
    // would otherwise surface still-encoded in candidateName.
    const titleText = cellText(titleMatch[1]).replace(/\s+/g, ' ').trim()
    // Format: "2028 \n Annual Year End Supplemental \n (2025) \n for BILL POWERS submitted on 02/02/2026"
    const forMatch = titleText.match(/for\s+(.+?)\s+submitted/i)
    if (forMatch) candidateName = forMatch[1].trim()
    // ⚠️ The title may be prefixed "Amended", e.g. "Amended 2026 1st Quarter for JOHN LOUALLEN".
    // Anchoring on a leading 4-digit year dropped reportTitle to '' on every amended filing.
    // Capture the amendment separately rather than discarding it — an amended report supersedes
    // its original, which matters when comparing filings.
    amended = /^\s*amended\b/i.test(titleText)
    const reportMatch = titleText.match(/^(?:amended\s+)?\d{4}\s+(.*?)(?:\s*\(\d{4}\))?\s+for\s/i)
    if (reportMatch) reportTitle = reportMatch[1].trim()
  }

  // Extract aggregates
  const beginningBalance = extractAggregate(fullText, 'Beginning Balance')
  const totalContributions = extractAggregate(fullText, 'TOTAL CONTRIBUTIONS')
  const totalReceipts = extractAggregate(fullText, 'TOTAL RECEIPTS')
  const totalExpenditures = extractAggregate(fullText, 'TOTAL EXPENDITURES')
  const totalDisbursements = extractAggregate(fullText, 'TOTAL DISBURSEMENTS')
  const endingBalance = extractAggregate(fullText, 'ENDING BALANCE')
  const totalOutstandingLoans = extractAggregate(fullText, 'TOTAL OUTSTANDING LOAN BALANCE')

  // Itemized line items come straight from the tables (see parser note above — the old
  // h3-section walk matched nothing because the page has no h3 tags).
  const receipts = parseSection(html, /^receipts$/i, ['contributor'])
  const disbursements = parseSection(html, /^disbursements$/i, ['vendor'])
  const inKindContributions = parseSection(html, /in-?kind/i, ['contributor'])
  const loans = parseSection(html, /outstanding loans/i, ['loans'])
  // ⚠️ No captured report has a nonzero Obligations table, so its header shape is UNVERIFIED.
  // Accepting either entity column means an unexpected shape yields [] rather than junk.
  const obligations = parseSection(html, /^obligations$/i, ['contributor', 'vendor'])

  return {
    reportId,
    candidateName,
    reportTitle,
    amended,
    beginningBalance,
    totalContributions,
    totalReceipts,
    totalExpenditures,
    totalDisbursements,
    endingBalance,
    totalOutstandingLoans,
    receipts,
    disbursements,
    inKindContributions,
    loans,
    obligations,
  }
}
