import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { EASYVOTE_COUNTIES, resolveCounty } from '../data/tn-counties.js'
import { getFilers, getOffices, searchContributions, searchDistributions, getAllDistributions, getElectionDocuments } from '../api/easyvote-client.js'
import type { EasyVoteCountyConfig } from '../data/tn-counties.js'

function resolveOrError(countyInput: string): EasyVoteCountyConfig | { error: string } {
  const county = resolveCounty(countyInput)
  if (!county) {
    const available = EASYVOTE_COUNTIES.map(c => c.name).join(', ')
    return { error: `County "${countyInput}" not found in EasyVote system. Available counties: ${available}` }
  }
  return county
}

export function registerEasyVoteTools(server: McpServer) {
  // ============================================================
  // list_easyvote_counties
  // ============================================================
  server.tool(
    'list_easyvote_counties',
    'List the 14 Tennessee counties with EasyVote Campaign Finance portals. Returns county name, slug, filer count, and county seat. Only these counties have searchable campaign finance data via this MCP. Counties with 0 filers (Anderson, Madison, Marion) are registered but have no candidate data yet. For state-level candidates (Governor, legislature), use the state campaign finance tools instead.',
    {},
    async () => {
      const counties = EASYVOTE_COUNTIES.map(c => ({
        name: c.name,
        slug: c.slug,
        countySeat: c.countySeat,
        filerCount: c.filerCount,
        hasData: c.filerCount > 0,
        portalUrl: `https://${c.slug}.easyvotecampaignfinance.com`,
      }))
      return {
        content: [{
          type: 'text' as const,
          text: `${counties.length} Tennessee counties with EasyVote Campaign Finance portals:\n\n${JSON.stringify(counties, null, 2)}`,
        }],
      }
    },
  )

  // ============================================================
  // search_county_filers
  // ============================================================
  server.tool(
    'search_county_filers',
    'Search candidates and PACs filed in a Tennessee county via EasyVote. Returns filer name, office, type, status, and filed documents. Use list_easyvote_counties to see which counties are available. The county parameter accepts a name ("Knox"), slug ("knoxcountytn"), county seat ("Knoxville"), or partial match ("david" for Davidson). Name and office filters are applied client-side after fetching all filers.',
    {
      county: z.string().describe('County name, slug, county seat, or partial match'),
      name: z.string().optional().describe('Filter by filer name (case-insensitive partial match)'),
      office: z.string().optional().describe('Filter by office name (case-insensitive partial match)'),
      limit: z.number().optional().describe('Max results to return (default 50, 0 for all)'),
    },
    async ({ county: countyInput, name, office, limit }) => {
      try {
        const resolved = resolveOrError(countyInput)
        if ('error' in resolved) {
          return { content: [{ type: 'text' as const, text: resolved.error }] }
        }

        const allFilers = await getFilers(resolved)
        let filtered = allFilers

        if (name) {
          const lower = name.toLowerCase()
          filtered = filtered.filter(f =>
            f.displayname?.toLowerCase().includes(lower) ||
            f.firstname?.toLowerCase().includes(lower) ||
            f.lastname?.toLowerCase().includes(lower) ||
            f.committeename?.toLowerCase().includes(lower),
          )
        }

        if (office) {
          const lower = office.toLowerCase()
          filtered = filtered.filter(f => f.officename?.toLowerCase().includes(lower))
        }

        if (filtered.length === 0) {
          const hint = name || office
            ? `No filers matched your filters in ${resolved.name} County. Try broader terms or omit filters.`
            : `No filers found in ${resolved.name} County. This county may not have data yet.`
          return { content: [{ type: 'text' as const, text: hint }] }
        }

        const effectiveLimit = limit === undefined ? 50 : limit
        const totalCount = filtered.length
        const limited = effectiveLimit > 0 ? filtered.slice(0, effectiveLimit) : filtered

        const limitNote = effectiveLimit > 0 && totalCount > effectiveLimit
          ? `Showing ${limited.length} of ${totalCount} filers. Use limit=0 for all.\n\n`
          : ''

        return {
          content: [{
            type: 'text' as const,
            text: `${limitNote}${resolved.name} County — ${totalCount} filer(s):\n\n${JSON.stringify(limited, null, 2)}`,
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  // ============================================================
  // list_county_offices
  // ============================================================
  server.tool(
    'list_county_offices',
    'List elected offices available in a Tennessee county via EasyVote. Returns office names and IDs. Useful for understanding what positions are contested in a county before searching for filers or contributions.',
    {
      county: z.string().describe('County name, slug, county seat, or partial match'),
    },
    async ({ county: countyInput }) => {
      try {
        const resolved = resolveOrError(countyInput)
        if ('error' in resolved) {
          return { content: [{ type: 'text' as const, text: resolved.error }] }
        }

        const offices = await getOffices(resolved)

        if (offices.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No offices found for ${resolved.name} County.` }],
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: `${resolved.name} County — ${offices.length} office(s):\n\n${JSON.stringify(offices, null, 2)}`,
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  // ============================================================
  // search_county_contributions
  // ============================================================
  server.tool(
    'search_county_contributions',
    'Search campaign contributions filed in a Tennessee county via EasyVote. Filters by donor and/or recipient name (client-side — the API returns all contributions, so the first call for a county may take a few seconds while the full dataset downloads, then is cached for 10 min). Returns itemized records including amount, date, donor address, and recipient office. For expenditures/vendor payments, use search_county_expenditures. Only 14 TN counties have EasyVote portals; use list_easyvote_counties to check.',
    {
      county: z.string().describe('County name, slug, county seat, or partial match'),
      donor_last_name: z.string().optional().describe('Donor last name to search'),
      donor_first_name: z.string().optional().describe('Donor first name to narrow results'),
      recipient_last_name: z.string().optional().describe('Recipient/candidate last name'),
      recipient_first_name: z.string().optional().describe('Recipient/candidate first name'),
      limit: z.number().optional().describe('Max results to return (default 200, 0 for all). Common names can return 4000+ results.'),
    },
    async ({ county: countyInput, donor_last_name, donor_first_name, recipient_last_name, recipient_first_name, limit }) => {
      try {
        const resolved = resolveOrError(countyInput)
        if ('error' in resolved) {
          return { content: [{ type: 'text' as const, text: resolved.error }] }
        }

        if (!donor_last_name && !donor_first_name && !recipient_last_name && !recipient_first_name) {
          return {
            content: [{ type: 'text' as const, text: 'At least one search parameter (donor or recipient name) is required.' }],
          }
        }

        const results = await searchContributions(resolved, {
          donorLastName: donor_last_name,
          donorFirstName: donor_first_name,
          recipientLastName: recipient_last_name,
          recipientFirstName: recipient_first_name,
        })

        if (results.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No contributions found in ${resolved.name} County matching your search.` }],
          }
        }

        const effectiveLimit = limit === undefined ? 200 : limit
        const totalCount = results.length
        const limited = effectiveLimit > 0 ? results.slice(0, effectiveLimit) : results

        // Calculate summary stats
        const totalAmount = results.reduce((sum, c) => sum + (c.ContributionAmount || 0), 0)
        const shownAmount = limited.reduce((sum, c) => sum + (c.ContributionAmount || 0), 0)

        const limitNote = effectiveLimit > 0 && totalCount > effectiveLimit
          ? `Showing ${limited.length} of ${totalCount} contributions ($${shownAmount.toLocaleString()} of $${totalAmount.toLocaleString()} total). Increase limit for more.\n\n`
          : `${totalCount} contribution(s) totaling $${totalAmount.toLocaleString()}:\n\n`

        return {
          content: [{
            type: 'text' as const,
            text: `${resolved.name} County — ${limitNote}${JSON.stringify(limited, null, 2)}`,
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  // ============================================================
  // search_county_expenditures
  // ============================================================
  server.tool(
    'search_county_expenditures',
    'Search campaign expenditures/distributions filed in a Tennessee county via EasyVote. Filters by vendor/payee name and/or candidate name. Returns itemized records including amount, vendor address, and office. The API endpoint is "distributions" (not expenditures). First call for a county downloads the full dataset (cached 10 min). Only 14 TN counties have EasyVote portals; use list_easyvote_counties to check.',
    {
      county: z.string().describe('County name, slug, county seat, or partial match'),
      payee_last_name: z.string().optional().describe('Vendor/payee name to search'),
      payee_first_name: z.string().optional().describe('Vendor/payee first name'),
      candidate_last_name: z.string().optional().describe('Candidate last name or committee name'),
      candidate_first_name: z.string().optional().describe('Candidate first name'),
      limit: z.number().optional().describe('Max results (default 200, 0 for all)'),
    },
    async ({ county: countyInput, payee_last_name, payee_first_name, candidate_last_name, candidate_first_name, limit }) => {
      try {
        const resolved = resolveOrError(countyInput)
        if ('error' in resolved) {
          return { content: [{ type: 'text' as const, text: resolved.error }] }
        }

        if (!payee_last_name && !payee_first_name && !candidate_last_name && !candidate_first_name) {
          return {
            content: [{ type: 'text' as const, text: 'At least one search parameter (payee or candidate name) is required.' }],
          }
        }

        const results = await searchDistributions(resolved, {
          payeeLastName: payee_last_name,
          payeeFirstName: payee_first_name,
          candidateLastName: candidate_last_name,
          candidateFirstName: candidate_first_name,
        })

        if (results.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No expenditures found in ${resolved.name} County matching your search.` }],
          }
        }

        const effectiveLimit = limit === undefined ? 200 : limit
        const totalCount = results.length
        const limited = effectiveLimit > 0 ? results.slice(0, effectiveLimit) : results

        const totalAmount = results.reduce((sum, d) => sum + (d.DistributionAmount || 0), 0)
        const shownAmount = limited.reduce((sum, d) => sum + (d.DistributionAmount || 0), 0)

        const limitNote = effectiveLimit > 0 && totalCount > effectiveLimit
          ? `Showing ${limited.length} of ${totalCount} expenditures ($${shownAmount.toLocaleString()} of $${totalAmount.toLocaleString()} total). Increase limit for more.\n\n`
          : `${totalCount} expenditure(s) totaling $${totalAmount.toLocaleString()}:\n\n`

        return {
          content: [{
            type: 'text' as const,
            text: `${resolved.name} County — ${limitNote}${JSON.stringify(limited, null, 2)}`,
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  // ============================================================
  // get_county_election_documents
  // ============================================================
  server.tool(
    'get_county_election_documents',
    'Get election-related documents for a Tennessee county via EasyVote. Returns document listings if the county has published any. Many counties have no election documents in EasyVote yet.',
    {
      county: z.string().describe('County name, slug, county seat, or partial match'),
    },
    async ({ county: countyInput }) => {
      try {
        const resolved = resolveOrError(countyInput)
        if ('error' in resolved) {
          return { content: [{ type: 'text' as const, text: resolved.error }] }
        }

        const docs = await getElectionDocuments(resolved)

        if (docs.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No election documents found for ${resolved.name} County.` }],
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: `${resolved.name} County — ${docs.length} election document(s):\n\n${JSON.stringify(docs, null, 2)}`,
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  // ============================================================
  // search_all_counties_contributions
  // ============================================================
  server.tool(
    'search_all_counties_contributions',
    'Search for a donor across ALL 14 Tennessee EasyVote counties at once. Downloads and caches the full contribution dataset for each county (first call may be slow for large counties), then filters client-side. Batches 4 concurrent requests. Skips counties with 0 known filers. Returns results grouped by county. Useful for "who is this person giving to at the local level across Tennessee?"',
    {
      donor_last_name: z.string().describe('Donor last name (required)'),
      donor_first_name: z.string().optional().describe('Donor first name (strongly recommended for common names)'),
      limit: z.number().optional().describe('Max results per county (default 50). Use 0 for all.'),
    },
    async ({ donor_last_name, donor_first_name, limit }) => {
      try {
        const effectiveLimit = limit === undefined ? 50 : limit
        const BATCH_SIZE = 4
        const activeCounties = EASYVOTE_COUNTIES.filter(c => c.filerCount > 0)
        const countyResults: Array<{
          county: string
          totalFound: number
          shown: number
          totalAmount: number
          contributions: unknown[]
        }> = []

        // Process in batches
        for (let i = 0; i < activeCounties.length; i += BATCH_SIZE) {
          const batch = activeCounties.slice(i, i + BATCH_SIZE)
          const results = await Promise.allSettled(
            batch.map(async (county) => {
              const contributions = await searchContributions(county, {
                donorLastName: donor_last_name,
                donorFirstName: donor_first_name,
              })
              return { county, contributions }
            }),
          )

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value.contributions.length > 0) {
              const { county, contributions } = result.value
              const totalAmount = contributions.reduce((sum, c) => sum + (c.ContributionAmount || 0), 0)
              const shown = effectiveLimit > 0 ? contributions.slice(0, effectiveLimit) : contributions
              countyResults.push({
                county: county.name,
                totalFound: contributions.length,
                shown: shown.length,
                totalAmount,
                contributions: shown,
              })
            }
          }
        }

        if (countyResults.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `No contributions found for donor "${donor_first_name ? donor_first_name + ' ' : ''}${donor_last_name}" across ${activeCounties.length} Tennessee counties.`,
            }],
          }
        }

        const grandTotal = countyResults.reduce((sum, r) => sum + r.totalAmount, 0)
        const grandCount = countyResults.reduce((sum, r) => sum + r.totalFound, 0)

        const header = `Found ${grandCount} contribution(s) totaling $${grandTotal.toLocaleString()} across ${countyResults.length} counties:\n\n`

        return {
          content: [{
            type: 'text' as const,
            text: header + JSON.stringify(countyResults, null, 2),
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  // ============================================================
  // search_all_counties_expenditures
  // ============================================================
  server.tool(
    'search_all_counties_expenditures',
    'Search for a vendor/payee across ALL 14 Tennessee EasyVote counties at once. Downloads and caches the full expenditure dataset for each county, then filters client-side. Batches 4 concurrent requests. Skips counties with 0 known filers. Returns results grouped by county. Useful for finding which candidates across Tennessee paid a specific vendor.',
    {
      payee_last_name: z.string().describe('Vendor/payee name (required)'),
      payee_first_name: z.string().optional().describe('Vendor first name'),
      limit: z.number().optional().describe('Max results per county (default 50). Use 0 for all.'),
    },
    async ({ payee_last_name, payee_first_name, limit }) => {
      try {
        const effectiveLimit = limit === undefined ? 50 : limit
        const BATCH_SIZE = 4
        const activeCounties = EASYVOTE_COUNTIES.filter(c => c.filerCount > 0)
        const countyResults: Array<{
          county: string
          totalFound: number
          shown: number
          totalAmount: number
          expenditures: unknown[]
        }> = []

        for (let i = 0; i < activeCounties.length; i += BATCH_SIZE) {
          const batch = activeCounties.slice(i, i + BATCH_SIZE)
          const results = await Promise.allSettled(
            batch.map(async (county) => {
              const expenditures = await searchDistributions(county, {
                payeeLastName: payee_last_name,
                payeeFirstName: payee_first_name,
              })
              return { county, expenditures }
            }),
          )

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value.expenditures.length > 0) {
              const { county, expenditures } = result.value
              const totalAmount = expenditures.reduce((sum, d) => sum + (d.DistributionAmount || 0), 0)
              const shown = effectiveLimit > 0 ? expenditures.slice(0, effectiveLimit) : expenditures
              countyResults.push({
                county: county.name,
                totalFound: expenditures.length,
                shown: shown.length,
                totalAmount,
                expenditures: shown,
              })
            }
          }
        }

        if (countyResults.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `No expenditures found for payee "${payee_first_name ? payee_first_name + ' ' : ''}${payee_last_name}" across ${activeCounties.length} Tennessee counties.`,
            }],
          }
        }

        const grandTotal = countyResults.reduce((sum, r) => sum + r.totalAmount, 0)
        const grandCount = countyResults.reduce((sum, r) => sum + r.totalFound, 0)

        const header = `Found ${grandCount} expenditure(s) totaling $${grandTotal.toLocaleString()} across ${countyResults.length} counties:\n\n`

        return {
          content: [{
            type: 'text' as const,
            text: header + JSON.stringify(countyResults, null, 2),
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )
}
