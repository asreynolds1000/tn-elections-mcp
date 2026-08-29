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

/**
 * ⚠️ sos.tn.gov 403s Node's DEFAULT User-Agent. Measured 2026-08-29 against
 * https://sos.tn.gov/elections/2026-candidate-lists — default UA returns 403, a browser UA
 * returns 200. Without this header all three SOS tools fail, and they fail with the misleading
 * message "No candidate list files found", which reads like the page changed rather than like
 * the request was refused.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,*/*' },
    })
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

const SOS_ALLOWED_HOSTS = new Set(['sos.tn.gov', 'www.sos.tn.gov', 'sos-prod.tnsosgovfiles.com'])

/** Reject a scraped file URL that points anywhere but the SoS's own hosts, over https. */
function assertSosHost(rawUrl: string): void {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error(`Refusing to fetch malformed candidate-list URL: ${rawUrl}`)
  }
  if (u.protocol !== 'https:' || !SOS_ALLOWED_HOSTS.has(u.hostname)) {
    throw new Error(`Refusing to fetch candidate list from unexpected host: ${u.hostname}`)
  }
}

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
      // ⚠️ The xlsx URL is scraped from the page's own href, so it is remote-controlled and the
      // bytes go straight into XLSX.read (a parser with known unfixed advisories). Pin the host.
      // NOTE the real links live on a DIFFERENT host than the page — sos.tn.gov serves the index,
      // sos-prod.tnsosgovfiles.com serves the files — so a naive one-host check breaks the tool.
      assertSosHost(office.xlsxUrl)
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
