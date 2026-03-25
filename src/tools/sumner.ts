import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { listCycles, getCycleCandidates, getReport } from '../api/sumner-client.js'
import { isImageFallback } from '../api/gemini-pdf.js'

export function registerSumnerTools(server: McpServer) {
  // ============================================================
  // list_sumner_election_cycles
  // ============================================================
  server.tool(
    'list_sumner_election_cycles',
    'List available Sumner County TN campaign finance disclosure cycles (2016-2028). Sumner County publishes PDF campaign finance reports on votesumnertn.org. Use search_sumner_candidates to see candidates and their report PDFs for a specific cycle. Use get_sumner_report to extract financial data from a specific PDF via Gemini Vision AI.',
    {},
    async () => {
      const cycles = listCycles()
      return {
        content: [{
          type: 'text' as const,
          text: `${cycles.length} Sumner County election cycles:\n\n${JSON.stringify(cycles, null, 2)}`,
        }],
      }
    },
  )

  // ============================================================
  // search_sumner_candidates
  // ============================================================
  server.tool(
    'search_sumner_candidates',
    'Search candidates in a Sumner County TN election cycle. Scrapes votesumnertn.org and returns candidates, offices, districts, and links to their PDF campaign finance reports. Results cached 15 minutes. This returns metadata and PDF links only — use get_sumner_report with a PDF URL to extract actual financial data (contributions, expenditures, balances).',
    {
      cycle: z.string().describe('Election cycle year (e.g., "2026", "2024", "2016" matches "2016-2018")'),
      name: z.string().optional().describe('Filter by candidate name (case-insensitive partial match)'),
      office: z.string().optional().describe('Filter by office name (case-insensitive partial match, e.g., "mayor", "commissioner", "school")'),
    },
    async ({ cycle, name, office }) => {
      try {
        const page = await getCycleCandidates(cycle)
        let candidates = page.candidates

        if (name) {
          const lower = name.toLowerCase()
          candidates = candidates.filter(c => c.name.toLowerCase().includes(lower))
        }
        if (office) {
          const lower = office.toLowerCase()
          candidates = candidates.filter(c =>
            c.office.name.toLowerCase().includes(lower) ||
            (c.office.district || '').toLowerCase().includes(lower) ||
            (c.office.municipality || '').toLowerCase().includes(lower),
          )
        }

        const output = {
          cycle: page.cycle,
          candidateCount: candidates.length,
          candidates: candidates.map(c => ({
            name: c.name,
            office: c.office.name,
            district: c.office.district || null,
            municipality: c.office.municipality || null,
            reportCount: c.reports.length,
            reports: c.reports,
          })),
          nonDisclosureCount: page.nonDisclosures.length,
          nonDisclosures: name
            ? page.nonDisclosures.filter(nd => nd.name.toLowerCase().includes(name.toLowerCase()))
            : page.nonDisclosures,
          scrapedAt: page.scrapedAt,
        }

        if (candidates.length === 0 && output.nonDisclosures.length === 0) {
          const hint = name || office
            ? `No candidates matched your filters in the ${cycle} cycle. Try broader terms.`
            : `No candidates found for the ${cycle} cycle. The page may have changed format.`
          return { content: [{ type: 'text' as const, text: hint }] }
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Sumner County ${page.cycle.label} — ${candidates.length} candidate(s):\n\n${JSON.stringify(output, null, 2)}`,
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
  // get_sumner_report
  // ============================================================
  server.tool(
    'get_sumner_report',
    'Extract financial data from a Sumner County campaign finance PDF using Gemini Flash AI. Downloads the PDF from votesumnertn.org, sends it to Gemini for structured extraction, and returns contributions, expenditures, beginning/ending balance (cash on hand), and totals. If Gemini is unavailable, falls back to returning PDF page images for Claude to read directly. IMPORTANT: Gemini path takes 10-30 seconds and uses API credits. Results cached 30 minutes. Get the PDF URL from search_sumner_candidates results. Set include_line_items=false for summary totals only.',
    {
      pdf_url: z.string().describe('Full PDF URL from search_sumner_candidates report links'),
      report_name: z.string().optional().describe('Report name for context (e.g., "YE 2025 Report")'),
      include_line_items: z.boolean().optional().describe('Include itemized contributions/expenditures (default true). False for summary only.'),
    },
    async ({ pdf_url, report_name, include_line_items }) => {
      try {
        // Validate URL strictly
        const url = new URL(pdf_url)
        if ((url.hostname !== 'www.votesumnertn.org' && url.hostname !== 'votesumnertn.org') ||
            url.protocol !== 'https:' || !url.pathname.endsWith('.pdf')) {
          return {
            content: [{ type: 'text' as const, text: 'Error: URL must be an HTTPS PDF from votesumnertn.org' }],
            isError: true,
          }
        }

        const result = await getReport(pdf_url, report_name || 'Unknown Report')

        // Image fallback: return page images for Claude to read directly
        if (isImageFallback(result)) {
          const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
            { type: 'text' as const, text: result.message },
          ]
          for (const img of result.images) {
            content.push({
              type: 'image' as const,
              data: img.base64,
              mimeType: img.mimeType,
            })
          }
          return { content }
        }

        // Structured Gemini result
        const report = result
        const output = include_line_items === false
          ? {
              ...report,
              contributions: `${report.contributions.length} item(s) (omitted — set include_line_items=true)`,
              expenditures: `${report.expenditures.length} item(s) (omitted)`,
            }
          : report

        const confidence = report.extractionConfidence === 'high' ? ''
          : `\nExtraction confidence: ${report.extractionConfidence}. Review warnings for details.\n`

        return {
          content: [{
            type: 'text' as const,
            text: `${report.candidateName} — ${report.reportPeriod}:${confidence}\n${JSON.stringify(output, null, 2)}`,
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
