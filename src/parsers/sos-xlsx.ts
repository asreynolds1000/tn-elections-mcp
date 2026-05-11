/**
 * Parser for TN Secretary of State candidate filing data.
 * Pure functions — no network calls.
 *
 * Two data formats:
 * 1. HTML page listing xlsx/pdf links (parsed with node-html-parser)
 * 2. xlsx files with 6 columns of candidate data (parsed with xlsx)
 */

import { parse } from 'node-html-parser'
import * as XLSX from 'xlsx'
import type { SosFiledCandidate, SosOfficeCategory } from '../types.js'

/** Header variations across federal vs state xlsx files */
const HEADER_MAP: Record<string, keyof SosFiledCandidate> = {
  'Office': 'office',
  'Candidate': 'candidateName',
  'Party': 'party',
  'Party Name': 'party',
  'City': 'city',
  'Filing Date': 'filingDate',
  'Filed': 'filingDate',
  'Status': 'status',
}

/**
 * Parse the SOS candidate list HTML page to extract office categories with xlsx/pdf URLs.
 *
 * Expected HTML structure:
 * <li>Office Name: <a href="...pdf">PDF</a> | <a href="...xlsx">Excel</a></li>
 */
export function parseCandidateListPage(html: string): SosOfficeCategory[] {
  const root = parse(html)
  const offices: SosOfficeCategory[] = []

  const listItems = root.querySelectorAll('li')
  for (const li of listItems) {
    const links = li.querySelectorAll('a')
    let xlsxUrl = ''
    let pdfUrl = ''

    for (const link of links) {
      const href = link.getAttribute('href') || ''
      if (href.endsWith('.xlsx')) xlsxUrl = href
      else if (href.endsWith('.pdf')) pdfUrl = href
    }

    if (!xlsxUrl) continue

    // Office name is the text before the colon
    const rawText = li.text || ''
    const colonIdx = rawText.indexOf(':')
    const name = colonIdx > 0 ? rawText.substring(0, colonIdx).trim() : rawText.trim()

    if (name) {
      offices.push({ name, xlsxUrl, pdfUrl, candidateCount: 0 })
    }
  }

  return offices
}

/**
 * Normalize a date string to YYYY-MM-DD format.
 *
 * Handles three cases:
 * - Full date: "3/6/2026" → "2026-03-06"
 * - Year-less date: "4/4" → "{year}-04-04" (state-level files omit the year)
 * - Already formatted: "2026-03-06" → pass through
 */
function normalizeDate(raw: string, year: number): string {
  if (!raw) return ''

  const trimmed = raw.trim()

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // M/D/YYYY or M/D/YY
  const fullMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (fullMatch) {
    const month = fullMatch[1].padStart(2, '0')
    const day = fullMatch[2].padStart(2, '0')
    let yr = fullMatch[3]
    if (yr.length === 2) yr = `20${yr}`
    return `${yr}-${month}-${day}`
  }

  // M/D (no year — state-level files)
  const shortMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (shortMatch) {
    const month = shortMatch[1].padStart(2, '0')
    const day = shortMatch[2].padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Fallback: return as-is
  return trimmed
}

/**
 * Parse an xlsx buffer into an array of SosFiledCandidate.
 *
 * @param buffer - Raw xlsx file contents
 * @param officeCategory - Category name (e.g., "Governor", "TN Senate")
 * @param year - Election cycle year (used to infer year for date-only strings)
 */
export function parseXlsx(
  buffer: ArrayBuffer,
  officeCategory: string,
  year: number,
): SosFiledCandidate[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return []

  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []

  // Read as array of arrays to handle header normalization ourselves
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
  if (rows.length < 2) return [] // Need at least header + 1 data row

  // Map header row to our field names
  const headerRow = rows[0]
  const columnMap: Array<keyof SosFiledCandidate | null> = headerRow.map(h => {
    const trimmed = String(h).trim()
    return HEADER_MAP[trimmed] || null
  })

  const candidates: SosFiledCandidate[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]

    // Skip empty rows
    const hasData = row.some(cell => String(cell).trim() !== '')
    if (!hasData) continue

    const candidate: Partial<SosFiledCandidate> = { officeCategory }

    for (let col = 0; col < columnMap.length; col++) {
      const field = columnMap[col]
      if (!field) continue

      let value = String(row[col] ?? '').trim()

      if (field === 'filingDate') {
        value = normalizeDate(value, year)
      }

      ;(candidate as Record<string, string>)[field] = value
    }

    // Only add if we have at least a candidate name
    if (candidate.candidateName) {
      candidates.push({
        office: candidate.office || '',
        candidateName: candidate.candidateName,
        party: candidate.party || '',
        city: candidate.city || '',
        filingDate: candidate.filingDate || '',
        status: candidate.status || '',
        officeCategory,
      })
    }
  }

  return candidates
}
