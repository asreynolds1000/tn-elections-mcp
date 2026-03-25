/**
 * PDF financial data extraction.
 *
 * Primary: Gemini Flash (cheap, fast, handles PDFs natively)
 * Fallback: Download PDF → pdftoppm → JPEG images → return as base64
 *           for Claude to read directly via MCP image content.
 *
 * The fallback works because these are scanned PDFs (pdftotext returns empty).
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { SumnerReportData } from '../types.js'

const GEMINI_MODEL = 'gemini-2.5-flash'
const MAX_PDF_SIZE = 10 * 1024 * 1024

const reportCache = new Map<string, { data: SumnerReportData; timestamp: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000

function getApiKey(): string | null {
  return process.env.GEMINI_API_KEY || null
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

async function fetchPdf(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_PDF_SIZE) {
    throw new Error(`PDF too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max ${MAX_PDF_SIZE / 1024 / 1024}MB)`)
  }
  return buffer
}

const EXTRACTION_PROMPT = `Extract ALL data from this Tennessee campaign finance disclosure PDF into valid JSON.

{
  "candidateName": "string — full name as printed",
  "officeSought": "string",
  "reportPeriod": "string — e.g. 'Mid-Year 2023', 'Year-End 2025'",
  "beginningBalance": number,
  "totalContributions": number,
  "totalExpenditures": number,
  "endingBalance": number,
  "contributions": [
    {"date": "MM/DD/YYYY", "name": "contributor name", "address": "full address", "amount": number, "type": "Monetary", "employer": "string or null", "occupation": "string or null"}
  ],
  "expenditures": [
    {"date": "MM/DD/YYYY", "payee": "payee name", "address": "full address", "amount": number, "purpose": "string or null"}
  ],
  "warnings": ["array of any extraction issues or unclear values"]
}

Rules:
- Return ONLY the JSON object. No markdown fencing, no explanation.
- Amounts must be numbers. $1,500.00 becomes 1500.00.
- Empty sections get empty arrays.
- If not a campaign finance report, return {"error": "Not a campaign finance report"}.
- Include ALL itemized entries. Do not truncate.
- Default contribution type to "Monetary" unless clearly In-Kind or Loan.`

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
    finishReason?: string
  }>
  error?: { message: string }
}

function parseGeminiResponse(response: GeminiResponse): { text: string; finishReason: string } {
  if (response.error) {
    throw new Error(`Gemini API error: ${response.error.message}`)
  }

  const candidate = (response.candidates || [])[0]
  if (!candidate) throw new Error('Gemini returned no candidates')

  const finishReason = candidate.finishReason || 'UNKNOWN'
  const parts = candidate.content?.parts || []
  const texts = parts.filter(p => p.text).map(p => p.text!)
  if (texts.length === 0) {
    throw new Error(`Gemini returned no text (finishReason: ${finishReason})`)
  }

  return { text: texts[texts.length - 1].trim(), finishReason }
}

function cleanJsonResponse(raw: string): string {
  let cleaned = raw
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7)
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3)
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3)
  cleaned = cleaned.trim()
  cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
  return cleaned
}

function determineConfidence(parsed: Record<string, unknown>, warnings: string[]): 'high' | 'medium' | 'low' {
  if (warnings.length === 0 && parsed.candidateName && parsed.endingBalance !== undefined) return 'high'
  if (warnings.length <= 2) return 'medium'
  return 'low'
}

function buildReport(parsed: Record<string, unknown>, reportName: string, model: string, extraWarnings: string[]): SumnerReportData {
  const geminiWarnings = Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : []
  const allWarnings = [...extraWarnings, ...geminiWarnings]

  return {
    candidateName: String(parsed.candidateName || ''),
    officeSought: String(parsed.officeSought || ''),
    reportPeriod: String(parsed.reportPeriod || reportName),
    beginningBalance: Number(parsed.beginningBalance) || 0,
    totalContributions: Number(parsed.totalContributions) || 0,
    totalExpenditures: Number(parsed.totalExpenditures) || 0,
    endingBalance: Number(parsed.endingBalance) || 0,
    contributions: Array.isArray(parsed.contributions)
      ? (parsed.contributions as Record<string, unknown>[]).map(c => ({
          date: String(c.date || ''),
          name: String(c.name || ''),
          address: String(c.address || ''),
          amount: Number(c.amount) || 0,
          type: String(c.type || 'Monetary'),
          employer: c.employer ? String(c.employer) : undefined,
          occupation: c.occupation ? String(c.occupation) : undefined,
        }))
      : [],
    expenditures: Array.isArray(parsed.expenditures)
      ? (parsed.expenditures as Record<string, unknown>[]).map(e => ({
          date: String(e.date || ''),
          payee: String(e.payee || ''),
          address: String(e.address || ''),
          amount: Number(e.amount) || 0,
          purpose: e.purpose ? String(e.purpose) : undefined,
        }))
      : [],
    extractionModel: model,
    extractionConfidence: determineConfidence(parsed, allWarnings),
    warnings: allWarnings,
  }
}

// ============================================================
// Primary: Gemini Flash extraction
// ============================================================

async function extractViaGemini(pdfBuffer: Buffer, reportName: string): Promise<SumnerReportData> {
  const base64Pdf = pdfBuffer.toString('base64')

  const requestBody = {
    contents: [{
      parts: [
        { text: EXTRACTION_PROMPT },
        { inlineData: { mimeType: 'application/pdf', data: base64Pdf } },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 65536,
      thinkingConfig: { thinkingBudget: 0 },
    },
  }

  let retried = false
  const doFetch = async (): Promise<GeminiResponse> => {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': getApiKey()!,
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const status = response.status
      if ((status === 429 || status >= 500) && !retried) {
        retried = true
        await new Promise(r => setTimeout(r, 2000))
        return doFetch()
      }
      const errorText = await response.text()
      throw new Error(`Gemini API HTTP ${status}: ${errorText.slice(0, 500)}`)
    }

    return await response.json() as GeminiResponse
  }

  const geminiResult = await doFetch()
  const { text: rawText, finishReason } = parseGeminiResponse(geminiResult)
  const cleanedJson = cleanJsonResponse(rawText)

  const warnings: string[] = []
  if (finishReason === 'MAX_TOKENS') {
    warnings.push('Response was truncated (MAX_TOKENS). Some data may be missing.')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleanedJson)
  } catch {
    throw new Error(`Failed to parse Gemini JSON. finishReason: ${finishReason}. First 500 chars: ${rawText.slice(0, 500)}`)
  }

  if (parsed.error) {
    throw new Error(`Gemini extraction: ${parsed.error}`)
  }

  return buildReport(parsed, reportName, GEMINI_MODEL, warnings)
}

// ============================================================
// Fallback: PDF → JPEG images for Claude to read
// ============================================================

export interface PdfImageFallback {
  type: 'image_fallback'
  pageCount: number
  images: Array<{ page: number; base64: string; mimeType: string }>
  message: string
}

const execFileAsync = promisify(execFile)

async function convertPdfToImages(pdfBuffer: Buffer, maxPages: number = 10): Promise<PdfImageFallback> {
  const tmpDir = join(tmpdir(), `tn-elections-pdf-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })

  const pdfPath = join(tmpDir, 'report.pdf')
  writeFileSync(pdfPath, pdfBuffer)

  try {
    // Convert PDF pages to JPEG (async, non-blocking)
    await execFileAsync('pdftoppm', [
      '-f', '1', '-l', String(maxPages),
      '-jpeg', '-jpegopt', 'quality=60', '-r', '200',
      pdfPath, join(tmpDir, 'page'),
    ], { timeout: 30_000 })

    const images: Array<{ page: number; base64: string; mimeType: string }> = []
    for (let i = 1; i <= maxPages; i++) {
      // pdftoppm names files page-01.jpg, page-02.jpg, etc.
      const padded = String(i).padStart(String(maxPages).length, '0')
      const imgPath = join(tmpDir, `page-${padded}.jpg`)
      if (existsSync(imgPath)) {
        const imgBuffer = readFileSync(imgPath)
        images.push({
          page: i,
          base64: imgBuffer.toString('base64'),
          mimeType: 'image/jpeg',
        })
      }
    }

    return {
      type: 'image_fallback',
      pageCount: images.length,
      images,
      message: `Gemini unavailable. Converted ${images.length} PDF page(s) to images. Please read these images to extract the campaign finance data.`,
    }
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch { /* ignore cleanup errors */ }
  }
}

// ============================================================
// Public API
// ============================================================

export async function extractReportFromPdf(
  pdfUrl: string,
  reportName: string,
): Promise<SumnerReportData | PdfImageFallback> {
  // Check cache
  const cached = reportCache.get(pdfUrl)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data
  }

  const pdfBuffer = await fetchPdf(pdfUrl)

  // Try Gemini first
  const apiKey = getApiKey()
  if (apiKey) {
    try {
      const report = await extractViaGemini(pdfBuffer, reportName)
      reportCache.set(pdfUrl, { data: report, timestamp: Date.now() })
      return report
    } catch (error) {
      // Gemini failed — fall through to image fallback
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`Gemini extraction failed, falling back to images: ${msg}`)
    }
  }

  // Fallback: convert to images for Claude to read
  return await convertPdfToImages(pdfBuffer)
}

/** Check if a result is the image fallback (not structured data) */
export function isImageFallback(result: SumnerReportData | PdfImageFallback): result is PdfImageFallback {
  return 'type' in result && result.type === 'image_fallback'
}
