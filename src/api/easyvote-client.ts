/**
 * EasyVote Campaign Finance API client.
 *
 * Multi-tenant JSON API at ecf-api.easyvoteapp.com. Each Tennessee county
 * gets its own tenant ID. All endpoints are public (no login required).
 *
 * Critical: every request needs Origin header matching the county subdomain,
 * plus zumo-api-version header. Data endpoints also need the auth header
 * containing UserId and CustomerId (tenant ID).
 */

import type { EasyVoteAuthContext, EasyVoteFiler, EasyVoteContribution, EasyVoteDistribution } from '../types.js'
import type { EasyVoteCountyConfig } from '../data/tn-counties.js'

const ECF_BASE = 'https://ecf-api.easyvoteapp.com'
const TIMEOUT_MS = 10_000
const CACHE_TTL_MS = 10 * 60 * 1000  // 10 minutes

// ============================================================
// Auth context cache (bootstrapped per county, TTL 30 min)
// ============================================================

const AUTH_CACHE_TTL_MS = 30 * 60 * 1000
const authCache = new Map<string, { data: EasyVoteAuthContext; timestamp: number }>()

function originUrl(slug: string): string {
  return `https://${slug}.easyvotecampaignfinance.com`
}

function buildAuthHeader(ctx: EasyVoteAuthContext): string {
  return `UserId:${ctx.UserId}|CustomerId:${ctx.CustomerId}|ZumoToken:null`
}

function buildHeaders(county: EasyVoteCountyConfig, ctx: EasyVoteAuthContext): Record<string, string> {
  return {
    'Origin': originUrl(county.slug),
    'easy-vote-authenticated-user': buildAuthHeader(ctx),
    'zumo-api-version': '2.0.0',
    'Accept': 'application/json',
  }
}

// ============================================================
// Fetch with timeout and JSON sanitization
// ============================================================

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { headers, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

/** Strip control characters that break JSON.parse (observed in Knox County responses) */
function sanitizeJson(raw: string): string {
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<{ data: T | null; status: number }> {
  const response = await fetchWithTimeout(url, headers)
  if (!response.ok) {
    return { data: null, status: response.status }
  }
  const raw = await response.text()
  return { data: JSON.parse(sanitizeJson(raw)) as T, status: response.status }
}

// ============================================================
// Bootstrap: get auth context for a county
// ============================================================

export async function bootstrapCounty(slug: string): Promise<EasyVoteAuthContext | null> {
  const cached = authCache.get(slug)
  if (cached && Date.now() - cached.timestamp < AUTH_CACHE_TTL_MS) {
    return cached.data
  }

  const url = `${ECF_BASE}/authentication/getwebsiteuser/${slug}`
  const headers = {
    'Origin': originUrl(slug),
    'Accept': 'application/json',
  }

  const { data: ctx } = await fetchJson<EasyVoteAuthContext>(url, headers)
  if (ctx) {
    authCache.set(slug, { data: ctx, timestamp: Date.now() })
  }
  return ctx
}

/** Clear cached auth and re-bootstrap (for retry-on-401) */
async function rebootstrap(slug: string): Promise<EasyVoteAuthContext | null> {
  authCache.delete(slug)
  return bootstrapCounty(slug)
}

/** Get auth context, retrying bootstrap on failure */
async function getAuth(county: EasyVoteCountyConfig): Promise<EasyVoteAuthContext> {
  const ctx = await bootstrapCounty(county.slug)
  if (!ctx) {
    throw new Error(`Failed to bootstrap EasyVote auth for ${county.name} County (${county.slug})`)
  }
  return ctx
}

/** Fetch with retry-on-401 (re-bootstraps auth once) */
async function fetchJsonWithRetry<T>(
  county: EasyVoteCountyConfig,
  buildUrl: (tenantId: string) => string,
): Promise<T | null> {
  let ctx = await getAuth(county)
  let headers = buildHeaders(county, ctx)
  const url = buildUrl(ctx.CustomerId)

  const { data, status } = await fetchJson<T>(url, headers)
  if (data !== null) return data

  // Only re-bootstrap on auth errors (401/403), not other failures
  if (status === 401 || status === 403) {
    const freshCtx = await rebootstrap(county.slug)
    if (!freshCtx) return null
    ctx = freshCtx
    headers = buildHeaders(county, ctx)
    const retry = await fetchJson<T>(buildUrl(ctx.CustomerId), headers)
    return retry.data
  }

  return null
}

// ============================================================
// Data caches with size limits (filers + contributions + distributions)
// ============================================================

const MAX_CACHE_ENTRIES = 8  // Prevent unbounded memory growth (~250MB max with large counties)

interface CacheEntry<T> { data: T; timestamp: number }

function cachedGet<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) return entry.data
  if (entry) cache.delete(key)
  return null
}

function cachedSet<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
  // Evict oldest entry if at capacity
  if (cache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [k, v] of cache) {
      if (v.timestamp < oldestTime) { oldestKey = k; oldestTime = v.timestamp }
    }
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, { data, timestamp: Date.now() })
}

const filerCache = new Map<string, CacheEntry<EasyVoteFiler[]>>()
const contributionCache = new Map<string, CacheEntry<EasyVoteContribution[]>>()
const distributionCache = new Map<string, CacheEntry<EasyVoteDistribution[]>>()

// ============================================================
// Public API functions
// ============================================================

/** Get all filers and their documents for a county */
export async function getFilers(county: EasyVoteCountyConfig): Promise<EasyVoteFiler[]> {
  const cached = cachedGet(filerCache, county.slug)
  if (cached) return cached

  const data = await fetchJsonWithRetry<EasyVoteFiler[]>(
    county,
    (tenantId) => `${ECF_BASE}/filer/documentsearch/${tenantId}`,
  )
  const filers = data || []
  cachedSet(filerCache, county.slug, filers)
  return filers
}

/** Get offices for a county */
export async function getOffices(county: EasyVoteCountyConfig): Promise<unknown[]> {
  const data = await fetchJsonWithRetry<unknown[]>(
    county,
    (tenantId) => `${ECF_BASE}/filer/offices/${tenantId}`,
  )
  return data || []
}

/** Search contribution parameters */
export interface ContributionSearchParams {
  donorLastName?: string
  donorFirstName?: string
  recipientLastName?: string
  recipientFirstName?: string
}

/**
 * Get ALL contributions for a county (cached 10 min).
 *
 * The EasyVote API ignores all query parameters on the contributions endpoint —
 * it always returns the full dataset. All filtering is done client-side.
 * Large counties (Shelby: ~29MB, Davidson: ~25K records) will be cached after
 * the first fetch to avoid repeated large downloads.
 */
export async function getAllContributions(county: EasyVoteCountyConfig): Promise<EasyVoteContribution[]> {
  const cached = cachedGet(contributionCache, county.slug)
  if (cached) return cached

  const data = await fetchJsonWithRetry<EasyVoteContribution[]>(
    county,
    (tenantId) => `${ECF_BASE}/advancedsearch/contributions/${tenantId}`,
  )
  const contributions = data || []
  cachedSet(contributionCache, county.slug, contributions)
  return contributions
}

/** Search contributions with client-side filtering (API ignores query params) */
export async function searchContributions(
  county: EasyVoteCountyConfig,
  params: ContributionSearchParams,
): Promise<EasyVoteContribution[]> {
  const all = await getAllContributions(county)

  return all.filter(c => {
    if (params.donorLastName) {
      const donor = (c.ContributorLastName || '').toLowerCase()
      if (!donor.includes(params.donorLastName.toLowerCase())) return false
    }
    if (params.donorFirstName) {
      const donor = (c.ContributorFirstName || '').toLowerCase()
      if (!donor.includes(params.donorFirstName.toLowerCase())) return false
    }
    if (params.recipientLastName) {
      const recip = (c.RecipientLastName || '').toLowerCase()
      const committee = (c.RecipientCommitteeName || '').toLowerCase()
      if (!recip.includes(params.recipientLastName.toLowerCase()) &&
          !committee.includes(params.recipientLastName.toLowerCase())) return false
    }
    if (params.recipientFirstName) {
      const recip = (c.RecipientFirstName || '').toLowerCase()
      if (!recip.includes(params.recipientFirstName.toLowerCase())) return false
    }
    return true
  })
}

/** Distribution/expenditure search parameters */
export interface DistributionSearchParams {
  payeeLastName?: string
  payeeFirstName?: string
  candidateLastName?: string
  candidateFirstName?: string
}

/**
 * Get ALL distributions/expenditures for a county (cached 10 min).
 * Same pattern as contributions — API likely ignores query params.
 */
export async function getAllDistributions(county: EasyVoteCountyConfig): Promise<EasyVoteDistribution[]> {
  const cached = cachedGet(distributionCache, county.slug)
  if (cached) return cached

  const data = await fetchJsonWithRetry<EasyVoteDistribution[]>(
    county,
    (tenantId) => `${ECF_BASE}/advancedsearch/distributions/${tenantId}`,
  )
  const distributions = data || []
  cachedSet(distributionCache, county.slug, distributions)
  return distributions
}

/** Search distributions with client-side filtering */
export async function searchDistributions(
  county: EasyVoteCountyConfig,
  params: DistributionSearchParams,
): Promise<EasyVoteDistribution[]> {
  const all = await getAllDistributions(county)

  return all.filter(d => {
    if (params.payeeLastName) {
      const payee = (d.PayeeLastName || '').toLowerCase()
      const org = (d.PayeeOrganizationName || '').toLowerCase()
      if (!payee.includes(params.payeeLastName.toLowerCase()) &&
          !org.includes(params.payeeLastName.toLowerCase())) return false
    }
    if (params.payeeFirstName) {
      const payee = (d.PayeeFirstName || '').toLowerCase()
      if (!payee.includes(params.payeeFirstName.toLowerCase())) return false
    }
    if (params.candidateLastName) {
      const cand = (d.CandidateLastName || '').toLowerCase()
      const committee = (d.CandidateCommitteeName || '').toLowerCase()
      if (!cand.includes(params.candidateLastName.toLowerCase()) &&
          !committee.includes(params.candidateLastName.toLowerCase())) return false
    }
    if (params.candidateFirstName) {
      const cand = (d.CandidateFirstName || '').toLowerCase()
      if (!cand.includes(params.candidateFirstName.toLowerCase())) return false
    }
    return true
  })
}

/** Get election documents for a county */
export async function getElectionDocuments(county: EasyVoteCountyConfig): Promise<unknown[]> {
  const data = await fetchJsonWithRetry<unknown[]>(
    county,
    (tenantId) => `${ECF_BASE}/documents/elections/${tenantId}`,
  )
  return data || []
}
