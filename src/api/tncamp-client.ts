/**
 * tncamp (Tennessee Registry of Election Finance) HTTP client.
 *
 * Session-based Java web app at apps.tn.gov/tncamp/public/.
 * Flow: GET form → POST → 302 redirect → GET results page.
 * Responses are Windows-1252 encoded.
 */

import type {
  TncampCandidate,
  TncampReport,
  TncampReportDetail,
  TncampContribution,
  TncampExpenditure,
} from '../types.js'
import { parseResultsTable, parsePaginationInfo } from '../parsers/tncamp-results.js'
import { parseReportDetail } from '../parsers/tncamp-report.js'

const BASE = 'https://apps.tn.gov/tncamp/public'
const SEARCH_BASE = 'https://apps.tn.gov/tncamp/search/pub'
const TIMEOUT_MS = 10_000
const MAX_PAGES = 20
const PAGE_DELAY_MS = 300

// ============================================================
// Session management
// Each form path gets its own session — a session from cpsearch.htm
// does NOT carry state for cesearch.htm (different servlet contexts).
// ============================================================

interface SessionContext {
  cookie: string
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function decodeBody(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer()
  return new TextDecoder('windows-1252').decode(buffer)
}

function extractSessionCookie(response: Response): string | null {
  const setCookie = response.headers.get('set-cookie') || ''
  const match = setCookie.match(/JSESSIONID="?([^";]+)/)
  return match ? `JSESSIONID=${match[1]}` : null
}

async function startSession(formPath: string = 'cpsearch.htm'): Promise<SessionContext> {
  const response = await fetchWithTimeout(`${BASE}/${formPath}`)
  await response.arrayBuffer()
  const cookie = extractSessionCookie(response)
  if (!cookie) {
    throw new Error(`Failed to get session cookie from ${formPath}`)
  }
  return { cookie }
}

async function submitForm(
  session: SessionContext,
  formPath: string,
  params: URLSearchParams,
): Promise<string> {
  const postResponse = await fetchWithTimeout(`${BASE}/${formPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': session.cookie,
      'Referer': `${BASE}/${formPath}`,
    },
    body: params.toString(),
    redirect: 'manual',
  })

  // If POST returns 200 instead of 302, a required param may be missing.
  // Detect the search form specifically (not just any <form> — results pages also have nav forms).
  if (postResponse.status === 200) {
    const body = await decodeBody(postResponse)
    if (body.includes('id="frmCandidates"') || body.includes('id="frmContributions"') || body.includes('id="frmReports"')) {
      throw new Error('Search form returned without results — a required parameter may be missing (e.g., yearSelection for contribution/expenditure searches)')
    }
    return body
  }

  const location = postResponse.headers.get('location')
  if (!location) {
    return decodeBody(postResponse)
  }

  const resultsUrl = location.startsWith('http') ? location : `https://apps.tn.gov${location}`

  const resultsResponse = await fetchWithTimeout(resultsUrl, {
    headers: { 'Cookie': session.cookie },
  })

  return decodeBody(resultsResponse)
}

async function fetchPage(
  session: SessionContext,
  resultsPath: string,
  page: number,
  paginationParam: string,
): Promise<string> {
  const url = `${BASE}/${resultsPath}?${paginationParam}=${page}`
  const response = await fetchWithTimeout(url, {
    headers: { 'Cookie': session.cookie },
  })
  return decodeBody(response)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================
// All 16 report selection values (must send all for complete results)
// ============================================================

const ALL_REPORT_SELECTIONS = Array.from({ length: 16 }, (_, i) => String(i + 1))

// ============================================================
// Public API
// ============================================================

export interface CandidateSearchParams {
  name?: string
  searchType?: 'candidate' | 'pac' | 'both'
  officeId?: string
  district?: string
  electionYearId?: string
  partyId?: string
}

export async function searchCandidates(params: CandidateSearchParams): Promise<TncampCandidate[]> {
  const session = await startSession()

  const form = new URLSearchParams()
  // Always use 'both' — searchType=candidate/pac returns 200 (form re-display)
  // without additional required fields. Filter results client-side instead.
  form.set('searchType', 'both')
  form.set('name', params.name || '')
  form.set('officeSelection', params.officeId || '')
  form.set('districtSelection', params.district || '')
  form.set('electionYearSelection', params.electionYearId || '')
  form.set('partySelection', params.partyId || '')
  form.set('nameField', 'true')
  form.set('partyField', 'true')
  form.set('officeField', 'true')
  form.set('districtField', 'true')
  form.set('electionYearField', 'true')
  form.set('_continue', 'Search')

  const html = await submitForm(session, 'cpsearch.htm', form)
  let candidates = parseResultsTable<TncampCandidate>(html, 'candidate')
  const pagination = parsePaginationInfo(html)

  if (pagination && pagination.totalPages > 1) {
    for (let page = 2; page <= Math.min(pagination.totalPages, MAX_PAGES); page++) {
      await delay(PAGE_DELAY_MS)
      const pageHtml = await fetchPage(session, 'cpresults.htm', page, pagination.paginationParam)
      candidates.push(...parseResultsTable<TncampCandidate>(pageHtml, 'candidate'))
    }
  }

  // Client-side filter by searchType (server always returns both)
  if (params.searchType === 'candidate') {
    candidates = candidates.filter(c => c.officeSought.toLowerCase() !== 'pac')
  } else if (params.searchType === 'pac') {
    candidates = candidates.filter(c => c.officeSought.toLowerCase() === 'pac')
  }

  return candidates
}

export async function getCandidateReports(candidateId: number, ownerName: string): Promise<TncampReport[]> {
  // replist.htm needs a session cookie but no POST
  const session = await startSession()
  const url = `${BASE}/replist.htm?id=${candidateId}&owner=${encodeURIComponent(ownerName)}`
  const response = await fetchWithTimeout(url, {
    headers: { 'Cookie': session.cookie },
  })
  const html = await decodeBody(response)
  return parseResultsTable<TncampReport>(html, 'report')
}

export async function getReportDetail(reportId: number): Promise<TncampReportDetail> {
  // report_full.htm needs a session cookie but no POST
  const session = await startSession()
  const url = `${SEARCH_BASE}/report_full.htm?reportId=${reportId}`
  const response = await fetchWithTimeout(url, {
    headers: { 'Cookie': session.cookie },
  })
  const html = await decodeBody(response)
  return parseReportDetail(html, reportId)
}

export interface ContributionSearchParams {
  candName?: string
  contributorName?: string
  employer?: string
  occupation?: string
  zipCode?: string
  typeOf?: 'monetary' | 'inkind' | 'independent' | 'all'
  amountDollars?: number
  amountSelection?: 'equal' | 'greater' | 'less'
  year: string
  electionYearId?: string
}

export interface ExpenditureSearchParams {
  candName?: string
  vendorName?: string
  vendorZipCode?: string
  purpose?: string
  typeOf?: 'monetary' | 'inkind' | 'independent' | 'all'
  amountDollars?: number
  amountSelection?: 'equal' | 'greater' | 'less'
  year: string
  electionYearId?: string
}

function buildCeFormData(
  searchType: 'contributions' | 'expenditures',
  params: ContributionSearchParams | ExpenditureSearchParams,
): URLSearchParams {
  const form = new URLSearchParams()
  form.set('searchType', searchType)
  form.set('toType', 'both')
  form.set('candName', params.candName || '')
  form.set('yearSelection', params.year)
  form.set('electionYearSelection', params.electionYearId || '')
  form.set('typeOf', params.typeOf || 'all')

  if (params.amountDollars !== undefined) {
    form.set('amountDollars', String(params.amountDollars))
    form.set('amountCents', '0')
    form.set('amountSelection', params.amountSelection || 'greater')
  } else {
    form.set('amountDollars', '')
    form.set('amountCents', '')
    form.set('amountSelection', 'equal')
  }

  for (const r of ALL_REPORT_SELECTIONS) {
    form.append('reportSelection', r)
  }

  form.set('fromCandidate', 'true')
  form.set('fromPAC', 'true')
  form.set('fromIndividual', 'true')
  form.set('fromOrganization', 'true')
  form.set('toCandidate', 'true')
  form.set('toPac', 'true')
  form.set('toOther', 'true')

  if (searchType === 'contributions') {
    const cp = params as ContributionSearchParams
    form.set('contributorName', cp.contributorName || '')
    form.set('recipientName', '')
    form.set('employer', cp.employer || '')
    form.set('occupation', cp.occupation || '')
    form.set('zipCode', cp.zipCode || '')
    form.set('vendorName', '')
    form.set('vendorZipCode', '')
    form.set('purpose', '')
    form.set('typeField', 'true')
    form.set('amountField', 'true')
    form.set('dateField', 'true')
    form.set('electionYearField', 'true')
    form.set('recipientNameField', 'true')
    form.set('contributorNameField', 'true')
    form.set('contributorAddressField', 'true')
    form.set('contributorOccupationField', 'true')
    form.set('contributorEmployerField', 'true')
  } else {
    const ep = params as ExpenditureSearchParams
    form.set('contributorName', '')
    form.set('recipientName', '')
    form.set('employer', '')
    form.set('occupation', '')
    form.set('zipCode', '')
    form.set('vendorName', ep.vendorName || '')
    form.set('vendorZipCode', ep.vendorZipCode || '')
    form.set('purpose', ep.purpose || '')
    form.set('typeField', 'true')
    form.set('amountField', 'true')
    form.set('dateField', 'true')
    form.set('vendorNameField', 'true')
    form.set('vendorAddressField', 'true')
    form.set('purposeField', 'true')
    form.set('candidateForField', 'true')
  }

  form.set('_continue', 'Search')
  return form
}

async function fetchAllPages<T extends TncampContribution | TncampExpenditure>(
  session: SessionContext,
  firstPageHtml: string,
  resultsPath: string,
  tableType: 'contribution' | 'expenditure',
): Promise<{ items: T[]; totalCount: number; truncated: boolean }> {
  const items = parseResultsTable<T>(firstPageHtml, tableType)
  const pagination = parsePaginationInfo(firstPageHtml)
  const totalCount = pagination?.totalItems || items.length

  if (pagination && pagination.totalPages > 1) {
    const pagesToFetch = Math.min(pagination.totalPages, MAX_PAGES)
    for (let page = 2; page <= pagesToFetch; page++) {
      await delay(PAGE_DELAY_MS)
      const pageHtml = await fetchPage(session, resultsPath, page, pagination.paginationParam)
      items.push(...parseResultsTable<T>(pageHtml, tableType))
    }
  }

  const truncated = pagination ? pagination.totalPages > MAX_PAGES : false
  return { items, totalCount, truncated }
}

export async function searchContributions(
  params: ContributionSearchParams,
): Promise<{ items: TncampContribution[]; totalCount: number; truncated: boolean }> {
  const session = await startSession('cesearch.htm')
  const form = buildCeFormData('contributions', params)
  const html = await submitForm(session, 'cesearch.htm', form)
  return fetchAllPages<TncampContribution>(session, html, 'ceresults.htm', 'contribution')
}

export async function searchExpenditures(
  params: ExpenditureSearchParams,
): Promise<{ items: TncampExpenditure[]; totalCount: number; truncated: boolean }> {
  const session = await startSession('cesearch.htm')
  const form = buildCeFormData('expenditures', params)
  const html = await submitForm(session, 'cesearch.htm', form)
  return fetchAllPages<TncampExpenditure>(session, html, 'ceresults.htm', 'expenditure')
}
