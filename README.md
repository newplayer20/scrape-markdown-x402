# scrape-markdown-x402

An anti-bot web scraper designed specifically for AI agents, returning clean, token-optimized Markdown. Powered by Cloudflare Workers and monetized via the **x402 protocol** on Base mainnet ($0.002 USDC per request).

## Features
- **Anti-Bypassing:** Bypasses standard web blocks to fetch clean content.
- **Token Optimization:** Strips out bloated HTML boilerplate, navigation menus, and scripts, returning dense Markdown optimized for LLM context windows.
- **Micro-Transactions:** Fully integrated with the x402 payment protocol on Base mainnet.

## MCP Protocol Support
This server implements the official **Model Context Protocol (MCP)** using Streamable HTTP transport, allowing autonomous agents to discover and execute scraping tasks instantly.

### Discovery Endpoints
- **Server Card:** `/.well-known/mcp/server-card.json`
- **OpenAPI Schema:** `/openapi.json`
- **LLMs Summary:** `/llms.txt`

## Usage Example (Client Config)
```json
{
  "mcpServers": {
    "scrape-markdown-x402": {
      "command": "npx",
      "args": ["mcp-remote", "[https://scrape-markdown-x402.rishiramdani.workers.dev](https://scrape-markdown-x402.rishiramdani.workers.dev)"]
    }
  }
}
