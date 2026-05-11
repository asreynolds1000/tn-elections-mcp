/**
 * Parser for tncamp cpsearch.htm form dropdowns and districts.htm JSON.
 * Pure functions — no network calls.
 */

import type { TncampFormOptions, TncampOffice, TncampDistrict, TncampElectionYear } from '../types.js'

/**
 * Parse the cpsearch.htm form page to extract office, election year, and party dropdowns.
 * Options are in <select> elements with <option value="X">Label</option>.
 */
export function parseFormOptions(html: string): TncampFormOptions {
  const offices: TncampOffice[] = []
  const electionYears: TncampElectionYear[] = []
  const parties: { id: string; name: string }[] = []

  // Extract all <select> blocks with name attribute
  const selectRegex = /<select[^>]*name="(\w+)"[^>]*>([\s\S]*?)<\/select>/g
  let selectMatch
  while ((selectMatch = selectRegex.exec(html)) !== null) {
    const name = selectMatch[1]
    const content = selectMatch[2]

    // Extract <option> tags with non-empty values
    const optRegex = /<option\s+value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/g
    let optMatch
    while ((optMatch = optRegex.exec(content)) !== null) {
      const id = optMatch[1].trim()
      const label = optMatch[2].replace(/\s+/g, ' ').trim()
      if (!id) continue

      switch (name) {
        case 'officeSelection':
          offices.push({ id, name: label })
          break
        case 'electionYearSelection':
          electionYears.push({ id, label })
          break
        case 'partySelection':
          parties.push({ id, name: label })
          break
      }
    }
  }

  return { offices, electionYears, parties }
}

/**
 * Parse the districts.htm JSON response.
 * Response format: {"districts":[{"id":369,"name":"18-2","office_id":10,"nameWithoutSeat":"18"}, ...]}
 */
export function parseDistrictsJson(json: string, officeId: string): TncampDistrict[] {
  const data = JSON.parse(json) as {
    districts: Array<{ id: number; name: string; office_id: number; nameWithoutSeat: string }>
  }

  return data.districts.map(d => ({
    id: String(d.id),
    label: d.name,
    officeId,
  }))
}
