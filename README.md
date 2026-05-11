# tn-elections-mcp

MCP server for Tennessee elections: county campaign finance (EasyVote), state campaign finance (tncamp), Sumner County PDF-based disclosures, and Secretary of State candidate filings.

## Data Sources

### EasyVote Campaign Finance (14 counties)
JSON API at `ecf-api.easyvoteapp.com`. Covers county-level races (mayor, county commission, school board, municipal offices) in: Anderson, Davidson, Greene, Hamblen, Hamilton, Knox, Madison, Marion, Maury, Rutherford, Shelby, Sullivan, Washington, Williamson.

### tncamp (State-level)
HTML scraping of `apps.tn.gov/tncamp`. Covers Governor, state Senate, state House, judges, DAs, and statewide PACs across all Tennessee counties.

### Sumner County
HTML scraping of `votesumnertn.org` for candidate metadata + Gemini Flash for PDF financial data extraction.

### TN Secretary of State (Candidate Filings)
Excel files from `sos.tn.gov/elections`. Official candidate filing lists for state and federal races: Governor, US Senate, US House, TN Senate, TN House, and party executive committees. This is the authoritative "who has filed to run" source, distinct from campaign finance data.

## Tools (22)

| Tool | Source | Description |
|------|--------|-------------|
| `list_easyvote_counties` | EasyVote | List 14 counties with portals |
| `search_county_filers` | EasyVote | Search candidates/PACs in a county |
| `list_county_offices` | EasyVote | List offices in a county |
| `search_county_contributions` | EasyVote | Search contributions by donor/recipient |
| `search_county_expenditures` | EasyVote | Search expenditures by vendor/candidate |
| `get_county_election_documents` | EasyVote | Get election documents |
| `search_all_counties_contributions` | EasyVote | Cross-county donor search |
| `search_all_counties_expenditures` | EasyVote | Cross-county vendor search |
| `search_state_candidates` | tncamp | Search by name or by office/district |
| `list_tncamp_offices` | tncamp | List available offices (courts, DA, etc.) |
| `list_tncamp_districts` | tncamp | List districts for an office |
| `get_candidate_reports` | tncamp | Get filed report list |
| `get_report_detail` | tncamp | Full financial breakdown |
| `search_state_contributions` | tncamp | Cross-candidate contribution search |
| `search_state_expenditures` | tncamp | Cross-candidate expenditure search |
| `get_candidate_financials` | tncamp | Quick candidate financial summary |
| `list_sumner_election_cycles` | Sumner | List election cycles |
| `search_sumner_candidates` | Sumner | Search candidates + PDF links |
| `get_sumner_report` | Sumner | Extract financials from PDF via Gemini |
| `search_filed_candidates` | TN SOS | Search officially filed candidates |
| `list_filed_offices` | TN SOS | List office categories with candidate counts |
| `get_filing_summary` | TN SOS | Aggregated filing stats by office/party |

## Installation

```bash
npm install -g tn-elections-mcp
```

Or use with Claude Code:
```bash
claude mcp add tn-elections -- npx tn-elections-mcp
```

For Sumner County PDF extraction, add the Gemini API key:
```bash
claude mcp add tn-elections --env GEMINI_API_KEY=your_key -- npx tn-elections-mcp
```

Or in `.claude.json`:
```json
{
  "tn-elections": {
    "command": "npx",
    "args": ["tn-elections-mcp"],
    "env": {
      "GEMINI_API_KEY": "your-key-here"
    }
  }
}
```

Without the Gemini key, `get_sumner_report` falls back to returning PDF page images for Claude to read directly.

## Development

```bash
npm run dev    # Hot-reload via tsx
npm test       # Run tests
npm run build  # Compile TypeScript
```

## License

MIT
