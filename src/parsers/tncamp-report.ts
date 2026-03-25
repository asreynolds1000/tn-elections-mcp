/**
 * tncamp report_full.htm parser.
 * Extracts financial aggregates and itemized line items from h-tag sections.
 */

import type { TncampReportDetail, TncampLineItem } from '../types.js'

function parseDollar(text: string): number {
  const match = text.match(/\$([\d,]+\.?\d*)/)
  if (!match) return 0
  return parseFloat(match[1].replace(/,/g, '')) || 0
}

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
 * Split HTML content into sections based on h3 tags.
 * Returns array of { header, bodyText } pairs.
 */
function splitSections(html: string): Array<{ header: string; bodyText: string }> {
  const sections: Array<{ header: string; bodyText: string }> = []
  // Split on h3 tags (which tncamp uses for section headers)
  const parts = html.split(/<h3[^>]*>/i)

  for (let i = 1; i < parts.length; i++) {
    const closeTag = parts[i].indexOf('</h3>')
    if (closeTag === -1) continue

    const header = parts[i].substring(0, closeTag).replace(/<[^>]+>/g, '').trim()
    const body = parts[i].substring(closeTag + 5)
    // Get text until next h-tag or end
    const nextH = body.match(/<h[2-5][^>]*>/i)
    const bodyHtml = nextH ? body.substring(0, nextH.index) : body
    const bodyText = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

    sections.push({ header, bodyText })
  }

  return sections
}

/**
 * Parse itemized line items from section body text.
 * Each entry follows a pattern: Name, Address, optional fields, Date, Amount
 */
function parseLineItems(bodyText: string): TncampLineItem[] {
  const items: TncampLineItem[] = []
  if (!bodyText || !bodyText.includes('$')) return items

  // Remove the summary lines (Unitemized, TOTAL, etc.)
  const cleanText = bodyText
    .replace(/Monetary Contributions,\s*Unitemized\s*\$[\d,.]+/gi, '')
    .replace(/Monetary Contributions,\s*Itemized/gi, '')
    .replace(/Expenditures,\s*Unitemized\s*\$[\d,.]+/gi, '')
    .replace(/Expenditures,\s*Itemized/gi, '')
    .replace(/TOTAL[^$]*\$[\d,.]+/gi, '')
    .replace(/Contribution Adjustments[^$]*\$[\d,.]+/gi, '')
    .replace(/Loans? Received[^$]*\$[\d,.]+/gi, '')
    .replace(/Interest Received[^$]*\$[\d,.]+/gi, '')
    .replace(/Loan Payments[^$]*\$[\d,.]+/gi, '')
    .replace(/Obligation Payments[^$]*\$[\d,.]+/gi, '')
    .replace(/Expenditures?, Adjustments[^$]*\$[\d,.]+/gi, '')
    .replace(/Unitemized\s*\$[\d,.]+/gi, '')
    .replace(/Itemized\s*\$[\d,.]+/gi, '')
    .replace(/Obligations?, Outstanding from Previous[^$]*\$[\d,.]+/gi, '')
    .trim()

  if (!cleanText) return items

  // Split on patterns that look like: date followed by dollar amount
  // Each itemized entry ends with a date (MM/DD/YYYY) and amount ($X,XXX.XX)
  // There may also be an aggregate amount after the contribution amount
  const entryPattern = /(\d{2}\/\d{2}\/\d{4})\s+\$([\d,]+\.?\d*)/g
  let match: RegExpExecArray | null
  let lastEnd = 0
  const entries: Array<{ textBefore: string; date: string; amount: number }> = []

  while ((match = entryPattern.exec(cleanText)) !== null) {
    const textBefore = cleanText.substring(lastEnd, match.index).trim()
    entries.push({
      textBefore,
      date: match[1],
      amount: parseFloat(match[2].replace(/,/g, '')) || 0,
    })
    // Skip past the amount and any aggregate that follows
    lastEnd = match.index + match[0].length
    // Check if there's an aggregate amount right after (e.g., "$1,500.00 $1,500.00")
    const afterMatch = cleanText.substring(lastEnd).match(/^\s+\$([\d,]+\.?\d*)/)
    if (afterMatch) {
      lastEnd += afterMatch[0].length
    }
  }

  for (const entry of entries) {
    if (!entry.textBefore) continue

    // The text before the date contains: Name, Address, optional Occupation/Employer
    // Split into lines by looking for state+zip patterns or C/P markers
    const parts = entry.textBefore.split(/(?:Contributor|Vendor|C\/P|Rec'd For|Primary|General)\s*/i)
    const mainText = parts[0] || entry.textBefore

    // Try to extract name and address
    // Name is typically all caps, address follows
    // Address often contains state abbreviation + zip
    const addrMatch = mainText.match(/(.+?)\s+((?:\d+|P\.?O\.?\s*BOX).+)/i)

    let name = mainText
    let address = ''

    if (addrMatch) {
      name = addrMatch[1].trim()
      address = addrMatch[2].trim()
    }

    items.push({
      name,
      address,
      date: entry.date,
      amount: entry.amount,
    })
  }

  return items
}

export function parseReportDetail(html: string, reportId: number): TncampReportDetail {
  // Extract full text for aggregate searching
  const fullText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  // Extract candidate name and report title from the page
  const titleMatch = html.match(/<h2[^>]*>(.*?)<\/h2>/is)
  let candidateName = ''
  let reportTitle = ''
  if (titleMatch) {
    const titleText = titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    // Format: "2028 \n Annual Year End Supplemental \n (2025) \n for BILL POWERS submitted on 02/02/2026"
    const forMatch = titleText.match(/for\s+(.+?)\s+submitted/i)
    if (forMatch) candidateName = forMatch[1].trim()
    const reportMatch = titleText.match(/^\d{4}\s+(.*?)(?:\(\d{4}\))?(?:\s+for)/i)
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

  // Extract itemized sections
  const sections = splitSections(html)
  let receipts: TncampLineItem[] = []
  let disbursements: TncampLineItem[] = []
  let inKindContributions: TncampLineItem[] = []
  let loans: TncampLineItem[] = []
  let obligations: TncampLineItem[] = []

  for (const section of sections) {
    const h = section.header.toLowerCase()
    if (h.includes('receipt')) {
      receipts = parseLineItems(section.bodyText)
    } else if (h.includes('disbursement')) {
      disbursements = parseLineItems(section.bodyText)
    } else if (h.includes('in-kind')) {
      inKindContributions = parseLineItems(section.bodyText)
    } else if (h.includes('outstanding loan')) {
      loans = parseLineItems(section.bodyText)
    } else if (h.includes('obligation')) {
      obligations = parseLineItems(section.bodyText)
    }
  }

  return {
    reportId,
    candidateName,
    reportTitle,
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
