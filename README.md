# tn-elections-mcp

MCP server for Tennessee elections: county campaign finance (EasyVote), state campaign finance (tncamp), and Sumner County PDF-based disclosures.

## Data Sources

### EasyVote Campaign Finance (14 counties)
JSON API at `ecf-api.easyvoteapp.com`. Covers county-level races (mayor, county commission, school board, municipal offices) in: Anderson, Davidson, Greene, Hamblen, Hamilton, Knox, Madison, Marion, Maury, Rutherford, Shelby, Sullivan, Washington, Williamson.

### tncamp (State-level)
HTML scraping of `apps.tn.gov/tncamp`. Covers Governor, state Senate, state House, judges, DAs, and statewide PACs across all Tennessee counties.

### Sumner County
HTML scraping of `votesumnertn.org` for candidate metadata + Gemini Flash for PDF financial data extraction.

## Tools (17)

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
| `search_state_candidates` | tncamp | Search state candidates/PACs |
| `get_candidate_reports` | tncamp | Get filed report list |
| `get_report_detail` | tncamp | Full financial breakdown |
| `search_state_contributions` | tncamp | Cross-candidate contribution search |
| `search_state_expenditures` | tncamp | Cross-candidate expenditure search |
| `get_candidate_financials` | tncamp | Quick candidate financial summary |
| `list_sumner_election_cycles` | Sumner | List election cycles |
| `search_sumner_candidates` | Sumner | Search candidates + PDF links |
| `get_sumner_report` | Sumner | Extract financials from PDF via Gemini |

## Setup

```bash
npm install
npm run build
```

### As MCP server

```bash
claude mcp add tn-elections -- node /path/to/tn-elections-mcp/dist/index.js
```

For Sumner County PDF extraction, add the Gemini API key:
```json
{
  "tn-elections": {
    "command": "node",
    "args": ["/path/to/tn-elections-mcp/dist/index.js"],
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
