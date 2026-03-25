#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerEasyVoteTools } from './tools/easyvote.js'

// Phase 2: State campaign finance (tncamp)
import { registerTncampTools } from './tools/tncamp.js'

// Sumner County campaign finance (PDF-based)
import { registerSumnerTools } from './tools/sumner.js'

const server = new McpServer({
  name: 'tn-elections-mcp',
  version: '0.3.0',
})

// County campaign finance (EasyVote — 14 counties)
registerEasyVoteTools(server)

// Phase 2: State campaign finance (tncamp)
registerTncampTools(server)

// Sumner County campaign finance (PDF-based)
registerSumnerTools(server)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
