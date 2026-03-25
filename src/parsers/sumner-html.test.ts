import { describe, it, expect } from 'vitest'
import { parseSumnerCyclePage } from './sumner-html.js'

const SAMPLE_HTML = `
<div class="fbox-content fr-view">
<p><span style="background-color: rgb(71, 85, 119); color: rgb(255, 255, 255);">COUNTY MAYOR</span></p>
<p><span style="color: rgb(71, 85, 119);"><strong>John Isbell</strong></span><br>
<a class="fr-file" href="/uploads/files/abc123.pdf" target="_blank">Mid-Year 2023 Report</a>
<a class="fr-file" href="/uploads/files/def456.pdf" target="_blank">YE 2023 Report</a></p>

<p><span style="background-color: rgb(71, 85, 119); color: rgb(255, 255, 255);">COUNTY COMMISSIONERS</span></p>
<p><span style="color: rgb(71, 85, 119);"><strong>District 2</strong></span><br>
<span style="color: rgb(71, 85, 119);"><strong>Christopher Shoemaker</strong></span><br>
<a class="fr-file" href="/uploads/files/ghi789.pdf" target="_blank">YE 2025 Report</a></p>

<p><span style="color: rgb(71, 85, 119);"><strong>District 8</strong></span><br>
<span style="color: rgb(71, 85, 119);"><strong>Rory Edmonds</strong></span><br>
<a class="fr-file" href="/uploads/files/jkl012.pdf" target="_blank">YE 2025 Report</a></p>
<p><span style="color: rgb(71, 85, 119);"><strong>Baker Ring</strong></span><br>
<a class="fr-file" href="/uploads/files/mno345.pdf" target="_blank">YE 2025 Report</a></p>

<p><span style="color: rgb(41, 105, 176);"><strong>CITY OF GALLATIN</strong></span><br>
<span style="color: rgb(71, 85, 119);"><strong>Mayor</strong></span><br>
<span style="color: rgb(71, 85, 119);"><strong>Mary Genung</strong></span><br>
<a class="fr-file" href="/uploads/files/pqr678.pdf" target="_blank">YE 2025 Report</a></p>
</div>
`

describe('parseSumnerCyclePage', () => {
  const cycle = { year: '2026', url: 'https://example.com', label: '2026 Cycle' }

  it('extracts county officers', () => {
    const result = parseSumnerCyclePage(SAMPLE_HTML, cycle)
    const isbell = result.candidates.find(c => c.name === 'John Isbell')
    expect(isbell).toBeDefined()
    expect(isbell!.office.name).toBe('COUNTY MAYOR')
    expect(isbell!.reports).toHaveLength(2)
    expect(isbell!.reports[0].reportName).toBe('Mid-Year 2023 Report')
    expect(isbell!.reports[0].pdfUrl).toContain('abc123.pdf')
  })

  it('extracts commissioners with districts', () => {
    const result = parseSumnerCyclePage(SAMPLE_HTML, cycle)
    const shoemaker = result.candidates.find(c => c.name === 'Christopher Shoemaker')
    expect(shoemaker).toBeDefined()
    expect(shoemaker!.office.name).toBe('COUNTY COMMISSIONERS')
    expect(shoemaker!.office.district).toBe('District 2')
  })

  it('handles multiple candidates per district', () => {
    const result = parseSumnerCyclePage(SAMPLE_HTML, cycle)
    const d8 = result.candidates.filter(c =>
      c.office.district === 'District 8' && c.office.name === 'COUNTY COMMISSIONERS',
    )
    expect(d8).toHaveLength(2)
    expect(d8.map(c => c.name).sort()).toEqual(['Baker Ring', 'Rory Edmonds'])
  })

  it('handles municipal sections', () => {
    const result = parseSumnerCyclePage(SAMPLE_HTML, cycle)
    const genung = result.candidates.find(c => c.name === 'Mary Genung')
    expect(genung).toBeDefined()
    expect(genung!.office.isMunicipal).toBe(true)
    expect(genung!.office.municipality).toBe('CITY OF GALLATIN')
  })

  it('filters out office titles as candidates', () => {
    const result = parseSumnerCyclePage(SAMPLE_HTML, cycle)
    const mayor = result.candidates.find(c => c.name === 'Mayor')
    expect(mayor).toBeUndefined()
  })

  it('filters out district identifiers as candidates', () => {
    const result = parseSumnerCyclePage(SAMPLE_HTML, cycle)
    const d2 = result.candidates.find(c => c.name === 'District 2')
    expect(d2).toBeUndefined()
  })

  it('returns empty for HTML with no matching structure', () => {
    const result = parseSumnerCyclePage('<html><body>Nothing here</body></html>', cycle)
    expect(result.candidates).toHaveLength(0)
  })

  it('attaches PDF links to correct candidates', () => {
    const result = parseSumnerCyclePage(SAMPLE_HTML, cycle)
    const ring = result.candidates.find(c => c.name === 'Baker Ring')
    expect(ring!.reports).toHaveLength(1)
    expect(ring!.reports[0].pdfUrl).toContain('mno345.pdf')
  })
})
