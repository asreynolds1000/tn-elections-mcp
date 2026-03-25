import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  searchCandidates,
  getCandidateReports,
  getReportDetail,
  searchContributions,
  searchExpenditures,
} from '../api/tncamp-client.js'

export function registerTncampTools(server: McpServer) {
  // ============================================================
  // search_state_candidates
  // ============================================================
  server.tool(
    'search_state_candidates',
    'Search Tennessee state-level candidates and PACs in the tncamp system (apps.tn.gov/tncamp). Covers Governor, state Senate, state House, judges, DAs, and statewide PACs. Returns candidate name, party, office, district, election year, and candidate ID. Use the candidate ID with get_candidate_reports to see filed reports. Name search accepts last name or full name. For county-level candidates, use search_county_filers instead.',
    {
      name: z.string().optional().describe('Candidate or PAC name (last name or full name)'),
      search_type: z.enum(['candidate', 'pac', 'both']).optional().describe('Search candidates, PACs, or both (default: both)'),
      limit: z.number().optional().describe('Max results (default 50, 0 for all)'),
    },
    async ({ name, search_type, limit }) => {
      try {
        if (!name) {
          return { content: [{ type: 'text' as const, text: 'A name parameter is required for candidate search.' }] }
        }

        let results = await searchCandidates({ name, searchType: search_type })

        // If multi-word name returned nothing, retry with last word (likely last name)
        // tncamp searches "Last, First" format — "Bill Lee" won't match but "Lee" will
        if (results.length === 0 && name.includes(' ')) {
          const words = name.trim().split(/\s+/)
          const lastName = words[words.length - 1]
          results = await searchCandidates({ name: lastName, searchType: search_type })
          if (results.length > 0) {
            // Filter to entries that also match the first name
            const firstName = words[0].toLowerCase()
            const filtered = results.filter(c =>
              c.name.toLowerCase().includes(firstName),
            )
            if (filtered.length > 0) results = filtered
          }
        }

        if (results.length === 0) {
          return { content: [{ type: 'text' as const, text: `No state candidates or PACs found matching "${name}".` }] }
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
            text: `${limitNote}${totalCount} state candidate/PAC result(s):\n\n${JSON.stringify(limited, null, 2)}`,
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
  // get_candidate_reports
  // ============================================================
  server.tool(
    'get_candidate_reports',
    'Get the list of filed campaign finance reports for a Tennessee state candidate or PAC. Returns report names, election years, submission dates, amendment flags, and report IDs. Use the report ID with get_report_detail for the full financial breakdown. Requires candidate_id and candidate_name from search_state_candidates results.',
    {
      candidate_id: z.number().describe('Candidate ID (from search_state_candidates candidateId field)'),
      candidate_name: z.string().describe('Candidate name as it appears in search results (e.g., "POWERS, BILL")'),
    },
    async ({ candidate_id, candidate_name }) => {
      try {
        const reports = await getCandidateReports(candidate_id, candidate_name)

        if (reports.length === 0) {
          return { content: [{ type: 'text' as const, text: `No reports found for candidate ID ${candidate_id} (${candidate_name}).` }] }
        }

        return {
          content: [{
            type: 'text' as const,
            text: `${reports.length} report(s) for ${candidate_name}:\n\n${JSON.stringify(reports, null, 2)}`,
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
  // get_report_detail
  // ============================================================
  server.tool(
    'get_report_detail',
    'Get the full financial breakdown for a Tennessee state campaign finance report. Returns beginning/ending balance (cash on hand), total contributions, receipts, expenditures, disbursements, outstanding loans, and optionally itemized line items. Requires a report_id from get_candidate_reports. Set include_line_items=false for just the aggregate totals (faster, smaller response).',
    {
      report_id: z.number().describe('Report ID (from get_candidate_reports reportId field)'),
      include_line_items: z.boolean().optional().describe('Include itemized line items (default true). False for summary only.'),
    },
    async ({ report_id, include_line_items }) => {
      try {
        const detail = await getReportDetail(report_id)

        const output = include_line_items === false
          ? {
              ...detail,
              receipts: `${detail.receipts.length} item(s) (omitted — set include_line_items=true)`,
              disbursements: `${detail.disbursements.length} item(s) (omitted)`,
              inKindContributions: `${detail.inKindContributions.length} item(s) (omitted)`,
              loans: `${detail.loans.length} item(s) (omitted)`,
              obligations: `${detail.obligations.length} item(s) (omitted)`,
            }
          : detail

        return {
          content: [{
            type: 'text' as const,
            text: `Report ${report_id} — ${detail.candidateName}:\n\n${JSON.stringify(output, null, 2)}`,
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
  // search_state_contributions
  // ============================================================
  server.tool(
    'search_state_contributions',
    'Search campaign contributions across Tennessee state candidates and PACs. Search by donor name, candidate name, employer, occupation, or zip code. Year is REQUIRED. Fetches all pages (50/page, max 1000). IMPORTANT: candidate_name must be LAST NAME ONLY (e.g., "Powers" not "Powers, Bill"). For county-level contributions, use search_county_contributions instead.',
    {
      year: z.string().describe('Report year (REQUIRED, e.g., "2025")'),
      candidate_name: z.string().optional().describe('Candidate LAST NAME ONLY'),
      contributor_name: z.string().optional().describe('Donor/contributor name'),
      employer: z.string().optional().describe('Donor employer'),
      occupation: z.string().optional().describe('Donor occupation'),
      zip_code: z.string().optional().describe('Donor zip code'),
      type: z.enum(['monetary', 'inkind', 'independent', 'all']).optional().describe('Contribution type (default: all)'),
      min_amount: z.number().optional().describe('Minimum dollar amount'),
      limit: z.number().optional().describe('Max results (default 200, 0 for all)'),
    },
    async (params) => {
      try {
        if (!params.candidate_name && !params.contributor_name && !params.employer && !params.zip_code) {
          return {
            content: [{ type: 'text' as const, text: 'At least one search filter (candidate_name, contributor_name, employer, or zip_code) is required in addition to year.' }],
          }
        }

        const { items, totalCount, truncated } = await searchContributions({
          year: params.year,
          candName: params.candidate_name,
          contributorName: params.contributor_name,
          employer: params.employer,
          occupation: params.occupation,
          zipCode: params.zip_code,
          typeOf: params.type,
          amountDollars: params.min_amount,
          amountSelection: params.min_amount ? 'greater' : undefined,
        })

        if (items.length === 0) {
          return { content: [{ type: 'text' as const, text: `No contributions found for ${params.year} matching your search.` }] }
        }

        const effectiveLimit = params.limit === undefined ? 200 : params.limit
        const limited = effectiveLimit > 0 ? items.slice(0, effectiveLimit) : items
        const totalAmount = items.reduce((sum, c) => sum + c.amount, 0)
        const shownAmount = limited.reduce((sum, c) => sum + c.amount, 0)

        let header = effectiveLimit > 0 && items.length > effectiveLimit
          ? `Showing ${limited.length} of ${totalCount} contributions ($${shownAmount.toLocaleString()} of $${totalAmount.toLocaleString()} total). Increase limit for more.\n\n`
          : `${totalCount} contribution(s) totaling $${totalAmount.toLocaleString()}:\n\n`

        if (truncated) {
          header = `WARNING: Results were truncated at ${items.length} of ${totalCount} total (pagination limit). Narrow your search for complete results.\n\n` + header
        }

        return { content: [{ type: 'text' as const, text: header + JSON.stringify(limited, null, 2) }] }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  // ============================================================
  // search_state_expenditures
  // ============================================================
  server.tool(
    'search_state_expenditures',
    'Search campaign expenditures across Tennessee state candidates and PACs. Search by vendor name, candidate name, purpose, or vendor zip. Year is REQUIRED. Fetches all pages (50/page, max 1000). IMPORTANT: candidate_name must be LAST NAME ONLY. Known limitation: "Candidate For" column is almost always empty — you cannot determine which candidate made a payment from search results alone. For county-level data, use EasyVote tools.',
    {
      year: z.string().describe('Report year (REQUIRED, e.g., "2025")'),
      candidate_name: z.string().optional().describe('Candidate LAST NAME ONLY'),
      vendor_name: z.string().optional().describe('Vendor/payee name'),
      vendor_zip_code: z.string().optional().describe('Vendor zip code'),
      purpose: z.string().optional().describe('Purpose of expenditure'),
      type: z.enum(['monetary', 'inkind', 'independent', 'all']).optional().describe('Type (default: all)'),
      min_amount: z.number().optional().describe('Minimum dollar amount'),
      limit: z.number().optional().describe('Max results (default 200, 0 for all)'),
    },
    async (params) => {
      try {
        if (!params.candidate_name && !params.vendor_name && !params.purpose && !params.vendor_zip_code) {
          return {
            content: [{ type: 'text' as const, text: 'At least one search filter (candidate_name, vendor_name, purpose, or vendor_zip_code) is required in addition to year.' }],
          }
        }

        const { items, totalCount, truncated } = await searchExpenditures({
          year: params.year,
          candName: params.candidate_name,
          vendorName: params.vendor_name,
          vendorZipCode: params.vendor_zip_code,
          purpose: params.purpose,
          typeOf: params.type,
          amountDollars: params.min_amount,
          amountSelection: params.min_amount ? 'greater' : undefined,
        })

        if (items.length === 0) {
          return { content: [{ type: 'text' as const, text: `No expenditures found for ${params.year} matching your search.` }] }
        }

        const effectiveLimit = params.limit === undefined ? 200 : params.limit
        const limited = effectiveLimit > 0 ? items.slice(0, effectiveLimit) : items
        const totalAmount = items.reduce((sum, e) => sum + e.amount, 0)
        const shownAmount = limited.reduce((sum, e) => sum + e.amount, 0)

        let header = effectiveLimit > 0 && items.length > effectiveLimit
          ? `Showing ${limited.length} of ${totalCount} expenditures ($${shownAmount.toLocaleString()} of $${totalAmount.toLocaleString()} total). Increase limit for more.\n\n`
          : `${totalCount} expenditure(s) totaling $${totalAmount.toLocaleString()}:\n\n`

        if (truncated) {
          header = `WARNING: Results were truncated at ${items.length} of ${totalCount} total (pagination limit). Narrow your search for complete results.\n\n` + header
        }

        return { content: [{ type: 'text' as const, text: header + JSON.stringify(limited, null, 2) }] }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        }
      }
    },
  )

  // ============================================================
  // get_candidate_financials
  // ============================================================
  server.tool(
    'get_candidate_financials',
    'Convenience tool: look up a Tennessee state candidate by name, find their most recent report, and return headline financials (cash on hand, total contributions, total expenditures). Combines search + reports + report detail in one call. Does NOT include itemized line items — use get_report_detail with the report ID for those. If multiple candidates match, uses the first result (most recent election) and includes all matches for clarification.',
    {
      name: z.string().describe('Candidate name (last name or full name)'),
      search_type: z.enum(['candidate', 'pac', 'both']).optional().describe('Search type (default: candidate)'),
    },
    async ({ name, search_type }) => {
      try {
        let candidates = await searchCandidates({ name, searchType: search_type || 'candidate' })

        // Multi-word name fallback (same as search_state_candidates)
        if (candidates.length === 0 && name.includes(' ')) {
          const words = name.trim().split(/\s+/)
          const lastName = words[words.length - 1]
          candidates = await searchCandidates({ name: lastName, searchType: search_type || 'candidate' })
          if (candidates.length > 0) {
            const firstName = words[0].toLowerCase()
            const filtered = candidates.filter(c => c.name.toLowerCase().includes(firstName))
            if (filtered.length > 0) candidates = filtered
          }
        }

        if (candidates.length === 0) {
          return { content: [{ type: 'text' as const, text: `No state candidates found matching "${name}".` }] }
        }

        const candidate = candidates[0]

        if (!candidate.candidateId) {
          return {
            content: [{
              type: 'text' as const,
              text: `Found "${candidate.name}" but no candidate ID available.\n\nAll matches:\n${JSON.stringify(candidates.slice(0, 10), null, 2)}`,
            }],
          }
        }

        const reports = await getCandidateReports(candidate.candidateId, candidate.name)

        if (reports.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Found ${candidate.name} (ID: ${candidate.candidateId}, ${candidate.officeSought} ${candidate.district}) but no filed reports yet.\n\nAll matches:\n${JSON.stringify(candidates.slice(0, 5), null, 2)}`,
            }],
          }
        }

        // Get the most recent report (last in list = most recent by election year)
        const latestReport = reports[reports.length - 1]
        const detail = await getReportDetail(latestReport.reportId)

        const financials = {
          candidate,
          allMatches: candidates.length > 1 ? candidates.slice(0, 10) : undefined,
          reportCount: reports.length,
          latestReport: {
            reportId: detail.reportId,
            reportTitle: detail.reportTitle,
            submittedOn: latestReport.submittedOn,
            beginningBalance: detail.beginningBalance,
            totalContributions: detail.totalContributions,
            totalReceipts: detail.totalReceipts,
            totalExpenditures: detail.totalExpenditures,
            totalDisbursements: detail.totalDisbursements,
            endingBalance: detail.endingBalance,
            totalOutstandingLoans: detail.totalOutstandingLoans,
            itemCounts: {
              receipts: detail.receipts.length,
              disbursements: detail.disbursements.length,
              inKindContributions: detail.inKindContributions.length,
              loans: detail.loans.length,
              obligations: detail.obligations.length,
            },
          },
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Financials for ${candidate.name} (${candidate.officeSought} ${candidate.district}):\n\n${JSON.stringify(financials, null, 2)}`,
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
