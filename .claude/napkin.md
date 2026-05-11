# Napkin — tn-elections-mcp

## Mistakes & Corrections

- **EasyVote API ignores query params on contributions endpoint.** Assumed `donorLastName=smith` filtered results — it doesn't. API returns ALL contributions regardless. All filtering is client-side. Same likely true for distributions endpoint.
- **EasyVote expenditure endpoint is `/advancedsearch/distributions/`** — NOT expenditures, expenses, or disbursements. Spent time getting 404s before HAR capture revealed the correct name.
- **tncamp `searchType=candidate` causes 200 (form re-display)** instead of 302 redirect. Server requires additional fields for that mode. Fix: always send `searchType=both`, filter client-side.
- **tncamp sessions are NOT interchangeable across form paths.** A session from `cpsearch.htm` does NOT work for `cesearch.htm`. Each form path needs its own session. Session caching broke expenditure search — reverted to per-form-path sessions.
- **tncamp `reportSelection` is multi-select.** Must send all 16 values (1-16) to get all report types. Sending only `reportSelection=1` limits to 1st Quarter reports.
- **tncamp `yearSelection` is REQUIRED** for contribution/expenditure search. Without it the form returns itself (200) instead of redirecting (302).
- **tncamp `candName` must be last name only** for expenditure search. "Powers" works, "Powers, Bill" does NOT.
- **Multi-word name search fails on tncamp** — "Bill Lee" returns nothing because the form searches "Last, First" format. Fixed with auto-fallback: retry with last word, filter by first name.
- **AbortController on Gemini fetch caused silent abort.** Removed AbortController from Gemini API call — the PDF download + API response takes 10-30s which was hitting the timeout. Gemini calls don't need AbortController since they're already bounded by the API.
- **Sumner County PDFs are scanned images.** `pdftotext` returns empty (7 bytes from 7-page PDF). Must use Gemini Vision or image-based fallback, not text extraction.

## Open Gaps / Feature Ideas

- **tncamp office-by-district search requires `searchType=candidate`.** RESOLVED in v0.5.0. `searchType=both` with empty name returns "No results matched." Must use `searchType=candidate` — this works even though the napkin previously said `searchType=candidate` always causes 200. The difference: office+district+year params satisfy the "additional required fields." The `searchCandidates()` function now conditionally uses `searchType=candidate` when `officeId` is set and `name` is empty.
- **Judicial races (circuit court, DA, judges) aren't in SOS xlsx files.** SOS only publishes Governor, US Senate/House, TN Senate/House, and party exec committees. Judges file through tncamp — now discoverable via office-by-district search (v0.5.0).
- **No centralized county candidate filing list for TN.** Each of 95 county election commissions handles its own qualifying. For the 14 EasyVote counties, petition documents are the best proxy for "officially filed." For the other 81 counties, no programmatic source exists.
- **EasyVote "Petition" document type = official ballot filing.** Candidates with a petition have officially filed to run. Candidates with only "Appointment of Political Treasurer" are fundraising but may never file. Could add a tool or flag to distinguish these.
- **Glenn Jacobs term limit inference.** Incumbent + no petition filed + past filing deadline = not running. But we can't determine *why* (term limit vs. choice) without election history or county charter data. TN SOS publishes historical election results that could be scraped.

## What Works

- EasyVote tenant IDs are stable and public — hardcoding them is fine
- Cookie path for tncamp is `/tncamp` — works across both `/tncamp/public/` and `/tncamp/search/pub/`
- Gemini 2.5 Flash handles inline PDFs natively (application/pdf MIME type) — no image conversion needed
- `node-html-parser` handles all three HTML scraping targets (tncamp, Sumner, EasyVote response sanitization)
- `xlsx` package compiles cleanly under `moduleResolution: NodeNext` — both `import * as XLSX from 'xlsx'` and named imports work
- SOS xlsx files have header variations ("Party Name" vs "Party", "Filed" vs "Filing Date") and state-level files use year-less dates ("4/4" not "4/4/2026") — parser normalizes both
- SOS data cached 15 minutes, ~100KB total across 7 xlsx files — safe to `Promise.all` download
- tncamp districts endpoint (`/districts.htm?officeId=X`) returns JSON (`{"districts":[{id, name, office_id, nameWithoutSeat}]}`), NOT HTML `<option>` tags. No session cookie required. Governor returns `{"districts":[]}`.
- tncamp form options (offices, years, parties) are in `<option>` tags on the cpsearch.htm page — they ARE server-rendered HTML despite districts being loaded via JS/AJAX
- tncamp `_continue=Search` and `_continue=Continue` both work for form submission
