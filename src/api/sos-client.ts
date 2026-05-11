/**
 * TN Secretary of State candidate filings client.
 * Fetches xlsx files from sos.tn.gov and parses them into typed candidate data.
 * No auth, no sessions — just static page scraping + xlsx download.
 */

import type { SosCandidateIndex, SosOfficeCategory } from '../types.js'
import { parseCandidateListPage, parseXlsx } from '../parsers/sos-xlsx.js'

const TIMEOUT_MS = 15_000
const CACHE_TTL_MS = 15 * 60 * 1000  // 15 minutes

const cache = new Map<number, SosCandidateIndex>()

function buildPageUrl(year: number): string {
  return `https://sos.tn.gov/elections/${year}-candidate-lists`
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`)
    }
    return response
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Fetch and parse all SOS candidate filing data for a given election year.
 *
 * 1. Fetches the HTML page listing xlsx/pdf download links
 * 2. Downloads all xlsx files in parallel
 * 3. Parses each into typed candidate records
 * 4. Caches the combined result for 15 minutes
 */
export async function getFiledCandidates(year: number = 2026): Promise<SosCandidateIndex> {
  // Check cache
  const cached = cache.get(year)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached
  }

  // Fetch the HTML page
  const pageUrl = buildPageUrl(year)
  const pageResponse = await fetchWithTimeout(pageUrl)
  const html = await pageResponse.text()

  // Parse office categories with xlsx/pdf URLs
  const offices = parseCandidateListPage(html)
  if (offices.length === 0) {
    throw new Error(`No candidate list files found at ${pageUrl}. The page may have changed structure or the year may not be available.`)
  }

  // Download all xlsx files in parallel (small files, ~10-18KB each)
  const xlsxResults = await Promise.all(
    offices.map(async (office): Promise<{ office: SosOfficeCategory; buffer: ArrayBuffer }> => {
      const response = await fetchWithTimeout(office.xlsxUrl)
      const buffer = await response.arrayBuffer()
      return { office, buffer }
    }),
  )

  // Parse each xlsx file
  const allCandidates = xlsxResults.flatMap(({ office, buffer }) => {
    const candidates = parseXlsx(buffer, office.name, year)
    office.candidateCount = candidates.length
    return candidates
  })

  const index: SosCandidateIndex = {
    year,
    offices,
    candidates: allCandidates,
    fetchedAt: Date.now(),
  }

  // Cache (don't cache empty results — might be a fetch issue)
  if (allCandidates.length > 0) {
    cache.set(year, index)
  }

  return index
}
