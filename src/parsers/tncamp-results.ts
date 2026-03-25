/**
 * tncamp DisplayTag HTML table parser.
 * All tncamp result pages use <table id="results"> with <thead> and <tbody>.
 */

import { parse, type HTMLElement } from 'node-html-parser'
import type {
  TncampCandidate,
  TncampReport,
  TncampContribution,
  TncampExpenditure,
  TncampPaginationInfo,
} from '../types.js'

function text(cell: HTMLElement | undefined): string {
  return cell?.text?.trim() || ''
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[$,]/g, '').trim()
  return parseFloat(cleaned) || 0
}

function parseCandidateRow(cells: HTMLElement[]): TncampCandidate | null {
  if (cells.length < 6) return null

  const reportLink = cells[5]?.querySelector('a')
  const href = reportLink?.getAttribute('href') || ''
  const idMatch = href.match(/id=(\d+)/)

  return {
    name: text(cells[0]),
    party: text(cells[1]),
    officeSought: text(cells[2]),
    district: text(cells[3]),
    electionYear: text(cells[4]),
    candidateId: idMatch ? parseInt(idMatch[1], 10) : 0,
    reportListUrl: href,
  }
}

function parseReportRow(cells: HTMLElement[]): TncampReport | null {
  if (cells.length < 4) return null

  // Report link is in the second cell (Report Name)
  const reportLink = cells[1]?.querySelector('a')
  const href = reportLink?.getAttribute('href') || ''
  const idMatch = href.match(/reportId=(\d+)/)

  return {
    election: text(cells[0]),
    reportName: text(cells[1]),
    isAmendment: text(cells[2]).toUpperCase() === 'Y',
    submittedOn: text(cells[3]),
    reportId: idMatch ? parseInt(idMatch[1], 10) : 0,
    reportUrl: href,
  }
}

function parseContributionRow(cells: HTMLElement[]): TncampContribution | null {
  if (cells.length < 9) return null

  return {
    type: text(cells[0]),
    amount: parseAmount(text(cells[1])),
    date: text(cells[2]),
    electionYear: text(cells[3]),
    recipientName: text(cells[4]),
    contributorName: text(cells[5]),
    contributorAddress: text(cells[6]),
    contributorOccupation: text(cells[7]),
    contributorEmployer: text(cells[8]),
  }
}

function parseExpenditureRow(cells: HTMLElement[]): TncampExpenditure | null {
  if (cells.length < 7) return null

  return {
    type: text(cells[0]),
    amount: parseAmount(text(cells[1])),
    date: text(cells[2]),
    vendorName: text(cells[3]),
    vendorAddress: text(cells[4]),
    purpose: text(cells[5]),
    candidateFor: text(cells[6]),
  }
}

type TableType = 'candidate' | 'report' | 'contribution' | 'expenditure'
type RowResult = TncampCandidate | TncampReport | TncampContribution | TncampExpenditure

const ROW_PARSERS: Record<TableType, (cells: HTMLElement[]) => RowResult | null> = {
  candidate: parseCandidateRow,
  report: parseReportRow,
  contribution: parseContributionRow,
  expenditure: parseExpenditureRow,
}

export function parseResultsTable<T extends RowResult>(
  html: string,
  tableType: TableType,
): T[] {
  const root = parse(html)
  const table = root.querySelector('table#results')
  if (!table) return []

  const rows = table.querySelectorAll('tbody tr')
  if (rows.length === 0) return []

  const parser = ROW_PARSERS[tableType]
  const results: T[] = []

  for (const row of rows) {
    const cells = row.querySelectorAll('td')
    const parsed = parser(cells)
    if (parsed) results.push(parsed as T)
  }

  return results
}

export function parsePaginationInfo(html: string): TncampPaginationInfo | null {
  // Pattern: "845 results found, displaying 1 to 50."
  const bannerMatch = html.match(/(\d+)\s*results?\s*found,\s*displaying\s+(\d+)\s+to\s+(\d+)/i)
  if (!bannerMatch) return null

  const totalItems = parseInt(bannerMatch[1], 10)
  const startItem = parseInt(bannerMatch[2], 10)
  const endItem = parseInt(bannerMatch[3], 10)
  const itemsPerPage = endItem - startItem + 1
  const currentPage = Math.ceil(startItem / itemsPerPage)
  const totalPages = Math.ceil(totalItems / itemsPerPage)

  // Extract pagination param name dynamically
  const paramMatch = html.match(/(d-\d+-p)=\d+/)
  const paginationParam = paramMatch ? paramMatch[1] : 'd-1341904-p'

  return { totalItems, currentPage, totalPages, itemsPerPage, paginationParam }
}
