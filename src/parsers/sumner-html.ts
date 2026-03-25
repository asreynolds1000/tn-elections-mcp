/**
 * Sumner County financial disclosure page parser.
 *
 * Parses votesumnertn.org disclosure pages where candidate/office info
 * is encoded in inline style colors (not semantic HTML classes).
 */

import { parse } from 'node-html-parser'
import type {
  SumnerCandidate,
  SumnerNonDisclosure,
  SumnerReportLink,
  SumnerCyclePage,
  SumnerElectionCycle,
} from '../types.js'

const BASE_URL = 'https://www.votesumnertn.org'

/** Match office header background color (rgb or hex variants) */
function isOfficeHeader(style: string): boolean {
  return (style.includes('background-color') || style.includes('background:')) &&
    (style.includes('71, 85, 119') || style.includes('71,85,119') ||
     style.includes('#475577') || style.includes('#47557'))
}

/** Match candidate/district text color (without background) */
function isCandidateColor(style: string): boolean {
  if (style.includes('background')) return false
  return style.includes('71, 85, 119') || style.includes('71,85,119') ||
    style.includes('#475577') || style.includes('#47557')
}

/** Match municipal header color */
function isMunicipalColor(style: string): boolean {
  return (style.includes('41, 105, 176') || style.includes('41,105,176') ||
    style.includes('#2969b0') || style.includes('#2969B0'))
}

/** Check if text looks like a district identifier rather than a name */
function isDistrictText(text: string): boolean {
  return /^(district|zone|seat|ward)\s+\d/i.test(text.trim())
}

/** Check if text is a section header or office title rather than a candidate name */
function isSectionOrOfficeTitle(text: string): boolean {
  const lower = text.toLowerCase().trim()
  return lower === 'municipal offices' ||
    lower === 'county offices' ||
    lower === 'school districts' ||
    lower === 'state offices' ||
    lower === 'mayor' ||
    lower === 'alderman' ||
    lower === 'aldermen' ||
    lower === 'vice mayor' ||
    lower === 'city council' ||
    lower === 'city judge' ||
    lower === 'city recorder' ||
    lower === 'non-disclosure' ||
    lower === 'statements of non-disclosure' ||
    /^(register|clerk|trustee|sheriff|assessor|superintendent)\s*$/i.test(lower)
}

export function parseSumnerCyclePage(html: string, cycle: SumnerElectionCycle): SumnerCyclePage {
  const root = parse(html)
  const candidates: SumnerCandidate[] = []
  const nonDisclosures: SumnerNonDisclosure[] = []

  // Find the content area
  const contentArea = root.querySelector('.fr-view') ||
    root.querySelector('.ContentPadding') ||
    root.querySelector('.entry-content') ||
    root

  // The page content is one big blob of inline-styled spans, strongs, and links.
  // We need to walk through the raw HTML and track state as we encounter markers.
  const contentHtml = contentArea.innerHTML

  // Strategy: split on <br> and block-level tags to get "lines", then classify each
  // This is more robust than walking the DOM because the markup is flat (not nested hierarchically).

  // Extract all meaningful elements in order using regex on the raw HTML
  const elements: Array<{ type: string; text: string; href?: string; style?: string }> = []

  // Office headers: span with background-color
  const officePattern = /<span[^>]*style="[^"]*background-color[^"]*"[^>]*>(.*?)<\/span>/gi
  // Candidate names: strong > span OR span > strong with color (no background)
  // Both patterns exist: <strong><span style="color:...">Name</span></strong>
  //                  and: <span style="color:..."><strong>Name</strong></span>
  const candidatePattern = /(?:<strong[^>]*>\s*<span[^>]*style="[^"]*color[^"]*"[^>]*>(.*?)<\/span>\s*<\/strong>|<span[^>]*style="[^"]*color:\s*rgb\(71,?\s*85,?\s*119\)[^"]*"[^>]*>\s*<strong[^>]*>(.*?)<\/strong>\s*<\/span>)/gi
  // Municipal headers: span with blue color inside strong
  const municipalPattern = /<span[^>]*style="[^"]*color:\s*rgb\(41,?\s*105,?\s*176\)[^"]*"[^>]*>\s*<strong[^>]*>(.*?)<\/strong>\s*<\/span>/gi
  // Also catch strong > span variant for municipal
  const municipal2Pattern = /<strong[^>]*>\s*<span[^>]*style="[^"]*color:\s*rgb\(41,?\s*105,?\s*176\)[^"]*"[^>]*>(.*?)<\/span>\s*<\/strong>/gi
  // PDF links
  const linkPattern = /<a[^>]*class="fr-file"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi

  // Build a position-ordered list of all elements
  const allMatches: Array<{ pos: number; type: string; text: string; href?: string }> = []

  let m: RegExpExecArray | null

  while ((m = officePattern.exec(contentHtml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    if (text) allMatches.push({ pos: m.index, type: 'office', text })
  }

  while ((m = municipalPattern.exec(contentHtml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    if (text) allMatches.push({ pos: m.index, type: 'municipal', text })
  }

  while ((m = municipal2Pattern.exec(contentHtml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    if (text && !allMatches.some(x => x.type === 'municipal' && x.text === text)) {
      allMatches.push({ pos: m.index, type: 'municipal', text })
    }
  }

  while ((m = candidatePattern.exec(contentHtml)) !== null) {
    // Two capture groups: m[1] from strong>span pattern, m[2] from span>strong pattern
    const text = (m[1] || m[2] || '').replace(/<[^>]+>/g, '').trim()
    if (text) {
      // Skip if this was already matched as an office header (overlapping regex)
      const isOffice = allMatches.some(x => x.type === 'office' && Math.abs(x.pos - m!.index) < 20)
      if (!isOffice) {
        allMatches.push({ pos: m.index, type: 'candidate', text })
      }
    }
  }

  while ((m = linkPattern.exec(contentHtml)) !== null) {
    const href = m[1]
    const text = m[2].replace(/<[^>]+>/g, '').trim()
    if (href && text) {
      const pdfUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`
      allMatches.push({ pos: m.index, type: 'link', text, href: pdfUrl })
    }
  }

  // Sort by position in the HTML
  allMatches.sort((a, b) => a.pos - b.pos)

  // Walk through matches and build the candidate list
  let currentMunicipality: string | undefined = undefined
  let currentOffice: string | undefined = undefined
  let currentDistrict: string | undefined = undefined
  let isMunicipal = false
  let inNonDisclosure = false

  for (const match of allMatches) {
    if (match.type === 'municipal') {
      currentMunicipality = match.text
      isMunicipal = true
      inNonDisclosure = false
      continue
    }

    if (match.type === 'office') {
      // Check for non-disclosure section
      if (match.text.toLowerCase().includes('non-disclosure') ||
          match.text.toLowerCase().includes('non disclosure')) {
        inNonDisclosure = true
        continue
      }

      inNonDisclosure = false
      currentOffice = match.text
      currentDistrict = undefined

      // Extract district from office text if present
      const distMatch = match.text.match(/(district|zone|seat|ward)\s+\d+/i)
      if (distMatch) {
        currentDistrict = distMatch[0]
        currentOffice = match.text.replace(distMatch[0], '').replace(/[-–—,]\s*$/, '').trim()
        if (!currentOffice) currentOffice = match.text
      }
      continue
    }

    if (match.type === 'candidate') {
      // Check if this is a district identifier, not a candidate name
      if (isDistrictText(match.text)) {
        currentDistrict = match.text
        continue
      }

      // Check if this is a section header or office title (Mayor, Alderman, etc.)
      if (isSectionOrOfficeTitle(match.text)) {
        // Treat as a sub-office within a municipal section
        if (isMunicipal) {
          currentOffice = match.text.toUpperCase()
        }
        continue
      }

      if (inNonDisclosure) {
        nonDisclosures.push({ name: match.text, cycle: cycle.year })
      } else if (currentOffice) {
        candidates.push({
          name: match.text,
          office: {
            name: currentOffice,
            district: currentDistrict,
            isMunicipal,
            municipality: isMunicipal ? currentMunicipality : undefined,
          },
          reports: [],
          cycle: cycle.year,
        })
      }
      continue
    }

    if (match.type === 'link') {
      // Attach to most recent candidate
      if (candidates.length > 0) {
        candidates[candidates.length - 1].reports.push({
          reportName: match.text,
          pdfUrl: match.href!,
        })
      }
      continue
    }
  }

  return {
    cycle,
    candidates,
    nonDisclosures,
    scrapedAt: new Date().toISOString(),
  }
}
