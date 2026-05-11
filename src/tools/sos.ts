import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getFiledCandidates } from '../api/sos-client.js'

export function registerSosTools(server: McpServer) {
  // ============================================================
  // search_filed_candidates
  // ============================================================
  server.tool(
    'search_filed_candidates',
    'Search candidates who have officially filed with the Tennessee Secretary of State. This is the OFFICIAL candidate filing list (who is on the ballot), distinct from tncamp campaign finance data (who has a campaign account). Covers state and federal races only: Governor, US Senate, US House, TN Senate, TN House, and party executive committees. County-level races are NOT covered — use search_county_filers for those. Only the current election cycle is available.',
    {
      office: z.string().optional().describe('Filter by office name (case-insensitive partial match, e.g., "senate", "house district 5", "governor")'),
      name: z.string().optional().describe('Filter by candidate name (case-insensitive partial match)'),
      party: z.string().optional().describe('Filter by party (e.g., "Republican", "Democratic", "Independent")'),
      city: z.string().optional().describe('Filter by city (case-insensitive partial match)'),
      year: z.number().optional().describe('Election year (default 2026). Only current cycle available.'),
      limit: z.number().optional().describe('Max results (default 50, 0 for all)'),
    },
    async ({ office, name, party, city, year, limit }) => {
      try {
        const index = await getFiledCandidates(year || 2026)

        let results = index.candidates

        if (office) {
          const q = office.toLowerCase()
          results = results.filter(c => c.office.toLowerCase().includes(q) || c.officeCategory.toLowerCase().includes(q))
        }
        if (name) {
          const q = name.toLowerCase()
          results = results.filter(c => c.candidateName.toLowerCase().includes(q))
        }
        if (party) {
          const q = party.toLowerCase()
          results = results.filter(c => c.party.toLowerCase().includes(q))
        }
        if (city) {
          const q = city.toLowerCase()
          results = results.filter(c => c.city.toLowerCase().includes(q))
        }

        if (results.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No filed candidates found matching your search.' }] }
        }

        const effectiveLimit = limit === undefined ? 50 : limit
        const totalCount = results.length
        const limited = effectiveLimit > 0 ? results.slice(0, effectiveLimit) : results

        const limitNote = effectiveLimit > 0 && totalCount > effectiveLimit
          ? `Showing ${limited.length} of ${totalCount} results. Use limit=0 for all.\n\n`
          : ''

        return {
          content: [{
            type: 'text' as const,
            text: `${limitNote}${totalCount} officially filed candidate(s):\n\n${JSON.stringify(limited, null, 2)}`,
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
  // list_filed_offices
  // ============================================================
  server.tool(
    'list_filed_offices',
    'List office categories in the TN Secretary of State candidate filing list. Returns each office category with candidate count and links to the official PDF/Excel files. Only the current election cycle is available.',
    {
      year: z.number().optional().describe('Election year (default 2026)'),
    },
    async ({ year }) => {
      try {
        const index = await getFiledCandidates(year || 2026)

        return {
          content: [{
            type: 'text' as const,
            text: `${index.offices.length} office category(s) for ${index.year} (${index.candidates.length} total candidates):\n\n${JSON.stringify(index.offices, null, 2)}`,
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
  // get_filing_summary
  // ============================================================
  server.tool(
    'get_filing_summary',
    'Get an aggregated summary of TN Secretary of State candidate filings by office and party. Returns total counts and breakdowns without listing individual candidates. Only the current election cycle is available.',
    {
      year: z.number().optional().describe('Election year (default 2026)'),
      office: z.string().optional().describe('Narrow to one office category (partial match)'),
    },
    async ({ year, office }) => {
      try {
        const index = await getFiledCandidates(year || 2026)

        let candidates = index.candidates
        if (office) {
          const q = office.toLowerCase()
          candidates = candidates.filter(c =>
            c.office.toLowerCase().includes(q) || c.officeCategory.toLowerCase().includes(q),
          )
        }

        // Build by-office breakdown
        const byOffice: Record<string, Record<string, number>> = {}
        const byParty: Record<string, number> = {}

        for (const c of candidates) {
          const cat = c.officeCategory
          if (!byOffice[cat]) byOffice[cat] = {}
          byOffice[cat][c.party] = (byOffice[cat][c.party] || 0) + 1
          byParty[c.party] = (byParty[c.party] || 0) + 1
        }

        // Add totals per office
        const byOfficeWithTotals: Record<string, Record<string, number>> = {}
        for (const [cat, parties] of Object.entries(byOffice)) {
          const total = Object.values(parties).reduce((sum, n) => sum + n, 0)
          byOfficeWithTotals[cat] = { total, ...parties }
        }

        const summary = {
          year: index.year,
          totalCandidates: candidates.length,
          byOffice: byOfficeWithTotals,
          byParty,
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Filing summary for ${index.year}:\n\n${JSON.stringify(summary, null, 2)}`,
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
