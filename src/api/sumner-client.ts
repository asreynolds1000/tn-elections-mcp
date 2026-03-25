/**
 * Sumner County campaign finance client.
 * Scrapes static HTML pages from votesumnertn.org.
 * No auth, no session management, UTF-8.
 */

import type { SumnerCyclePage, SumnerElectionCycle, SumnerReportData } from '../types.js'
import type { PdfImageFallback } from './gemini-pdf.js'
import { SUMNER_CYCLES, resolveCycle } from '../data/sumner-cycles.js'
import { parseSumnerCyclePage } from '../parsers/sumner-html.js'
import { extractReportFromPdf } from './gemini-pdf.js'

const TIMEOUT_MS = 15_000
const cyclePageCache = new Map<string, { data: SumnerCyclePage; timestamp: number }>()
const CACHE_TTL_MS = 15 * 60 * 1000

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'text/html' },
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

export function listCycles(): SumnerElectionCycle[] {
  return SUMNER_CYCLES
}

export { resolveCycle }

export async function getCycleCandidates(cycleInput: string): Promise<SumnerCyclePage> {
  const cycle = resolveCycle(cycleInput)
  if (!cycle) {
    const available = SUMNER_CYCLES.map(c => c.year).join(', ')
    throw new Error(`Cycle "${cycleInput}" not found. Available: ${available}`)
  }

  const cached = cyclePageCache.get(cycle.year)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const html = await fetchPage(cycle.url)
  const result = parseSumnerCyclePage(html, cycle)

  if (result.candidates.length === 0) {
    result.candidates = [] // ensure empty array not undefined
    // Don't cache empty results — might be a parsing issue
  } else {
    cyclePageCache.set(cycle.year, { data: result, timestamp: Date.now() })
  }

  return result
}

export async function getReport(pdfUrl: string, reportName: string): Promise<SumnerReportData | PdfImageFallback> {
  return extractReportFromPdf(pdfUrl, reportName)
}
