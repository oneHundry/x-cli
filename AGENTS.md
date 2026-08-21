# AGENTS.md

This repo contains the local `x` CLI and retained `x-mcp` Streamable HTTP server for public read-only X/Twitter retrieval. CLI and MCP share TypeScript providers and services. FxTwitter is primary; only search may fall back to freshness-gated Nitter RSS.

## Operating rules

- Keep both CLI and MCP read-only. Do not add post, like, repost, follow, DM, notifications, authenticated timelines, credentials, or private access.
- The local Worker endpoint is `http://localhost:8787/mcp`.
- The default upstream base is `https://api.fxtwitter.com`; operators may override the origin with `FXTWITTER_BASE_URL` for a trusted self-hosted FxTwitter instance.
- Do not commit `wrangler.jsonc`, `.dev.vars`, `.env*`, Cloudflare account secrets, OAuth tokens, or API keys.
- Keep `wrangler.example.jsonc` safe and placeholder-based except public route/vars.
- Keep README and `docs/agent-install-prompts.md` bilingual when changing user-facing onboarding.
- Keep `skills/x-mcp/SKILL.md` focused on direct CLI use by Codex; MCP is secondary.
- Never serve Nitter results from an instance that fails canary freshness gating.

## Verification before commit

Run:

```bash
npm run check
npm test
npm run build:cli
node dist/cli.js --help
```

For optional MCP smoke testing:

```bash
curl -sS http://localhost:8787/health
curl -sS http://localhost:8787/.well-known/mcp.json
```

Then verify CLI search fallback and the non-search FxTwitter commands. Do not deploy unless explicitly requested.
