import type { SumnerElectionCycle } from '../types.js'

export const SUMNER_CYCLES: SumnerElectionCycle[] = [
  { year: '2028', url: 'https://www.votesumnertn.org/financial-disclosures-2028-election-cycle/', label: '2028 Election Cycle' },
  { year: '2026', url: 'https://www.votesumnertn.org/financial-disclosures-2026-election-cycle/', label: '2026 Election Cycle' },
  { year: '2024', url: 'https://www.votesumnertn.org/financial-disclosures-2024-election-cycle/', label: '2024 Election Cycle' },
  { year: '2023', url: 'https://www.votesumnertn.org/financial-disclosures-2023-election-cycle/', label: '2023 Election Cycle' },
  { year: '2022', url: 'https://www.votesumnertn.org/financial-disclosures-2022-election-cycle/', label: '2022 Election Cycle' },
  { year: '2020', url: 'https://www.votesumnertn.org/financial-disclosures-2020-election-cycle/', label: '2020 Election Cycle' },
  { year: '2016-2018', url: 'https://www.votesumnertn.org/financial-disclosures-2016-and-2018-election-cycles/', label: '2016 & 2018 Election Cycles' },
]

export function resolveCycle(input: string): SumnerElectionCycle | null {
  const lower = input.toLowerCase().trim()
  if (!lower) return null
  const exact = SUMNER_CYCLES.find(c => c.year === lower)
  if (exact) return exact
  return SUMNER_CYCLES.find(c => c.year.includes(lower)) || null
}
