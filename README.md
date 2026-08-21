# x-cli

Local, public, read-only X/Twitter retrieval. The local `x` CLI is the primary interface; the retained MCP uses the same provider/service layer.

```text
Codex / shell
→ x CLI
→ XService
   ├─ FxTwitterProvider
   └─ NitterProvider (search fallback only)

x-mcp
→ the same XService and providers
```

FxTwitter and Nitter are third-party services, not the official X API. No X login, Cookie, API key, OAuth token, account credentials, or write operation is supported.

## Quick install

### Windows / PowerShell

Requirements: Node.js/npm and Git.

```powershell
git clone https://github.com/oneHundry/x-cli.git
cd x-cli
npm install -g .
x --help
x search "OpenAI" --limit 5 --json
```

`npm install -g .` runs the project's `prepare` script and builds the CLI automatically, so a separate `npm install` is not required for a normal global install.

Update later with:

```powershell
cd x-cli
git pull
npm install -g .
```

Uninstall:

```powershell
npm uninstall -g x-cli
```

## CLI commands

```bash
x --help
x search "AI agent" --limit 20 --feed latest --json
x profile OpenAI --json
x timeline OpenAI --limit 20 --json
x media OpenAI --limit 20 --json
x post 1234567890123456789 --json
x trends --limit 20 --json
x typeahead openai --limit 10 --json
x openapi --json
```

Search diagnostics:

```bash
x search "MCP" --provider auto --json
x search "MCP" --provider fxtwitter --json
x search "MCP" --provider nitter --json
```

`auto` always tries FxTwitter first. Search HTTP 404, 429, 5xx, timeout, DNS/network failure, invalid JSON, or an unexpected response triggers Nitter. Invalid CLI arguments and HTTP 400 do not trigger fallback. Nitter supports only `feed=latest`; `top` remains FxTwitter-only.

If both providers fail, the CLI exits non-zero and returns `x_search_unavailable`; it never reports a misleading successful empty result.

## Codex Integration

The repository includes a CLI-first Skill at:

```text
skills/x-mcp/SKILL.md
```

For normal Codex use, the Skill calls the local `x` command directly. You do **not** need to start the MCP server.

### Install the Skill on Windows

If your Codex Skill root is the common default:

```text
%USERPROFILE%\.codex\skills
```

run this from the repository root:

```powershell
$target = "$env:USERPROFILE\.codex\skills\x-cli"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item ".\skills\x-mcp\SKILL.md" "$target\SKILL.md" -Force
```

The result should be:

```text
%USERPROFILE%\.codex\skills\x-cli\SKILL.md
```

If your Codex installation uses a different Skill root, copy the same `SKILL.md` into an independent `x-cli` directory under that root.

After installing or updating the Skill, start a new Codex session so it can rediscover the Skill.

### Verify the CLI

```powershell
Get-Command x
x --help
x search "OpenAI" --limit 5 --json
```

### Verify the Skill in Codex

Ask Codex:

```text
搜索 X 上最近关于 MCP 的公开讨论，返回原帖链接和发布时间。
```

Expected underlying command:

```bash
x search "MCP" --limit 20 --json
```

Then try:

```text
看看 OpenAI 最近在 X 上发了什么。
```

Expected command:

```bash
x timeline OpenAI --limit 20 --json
```

If the CLI works but Codex does not use the Skill, check:

1. `SKILL.md` is inside the Skill root Codex actually uses.
2. The Skill is in its own folder, e.g. `x-cli/SKILL.md`.
3. A new Codex session was opened after installation.
4. `Get-Command x` works inside the Codex terminal.

## Search output

A successful search has a stable JSON shape similar to:

```json
{
  "ok": true,
  "platform": "x",
  "provider": "nitter",
  "fallback_used": true,
  "query": "MCP",
  "count": 1,
  "results": [
    {
      "id": "123",
      "author": "Example",
      "handle": "example",
      "text": "post content",
      "created_at": "2026-08-21T00:00:00.000Z",
      "url": "https://x.com/example/status/123",
      "metrics": {
        "likes": null,
        "reposts": null,
        "replies": null,
        "views": null
      }
    }
  ]
}
```

Nitter RSS does not provide reliable engagement metrics, so unavailable values remain `null`. Mirror URLs are rewritten to canonical `https://x.com/...` URLs.

## Configuration

All values are optional:

```text
FXTWITTER_BASE_URL=https://api.fxtwitter.com
FXTWITTER_TIMEOUT_MS=12000
NITTER_INSTANCES=https://nitter.perennialte.ch,https://nitter.privacyredirect.com
NITTER_TIMEOUT_MS=8000
NITTER_TOTAL_TIMEOUT_MS=20000
NITTER_MAX_CANARY_AGE_MIN=180
NITTER_MAX_CANARY_LAG_MIN=90
```

CLI/MCP callers cannot choose arbitrary upstream URLs. Only the local operator can configure trusted instance origins.

## Nitter health and freshness

Before CLI search falls back to Nitter, candidate instances are checked for freshness. An instance is excluded when it times out, fails DNS/network/TLS, returns malformed/stale data, or lags the healthiest instance too far.

Public Nitter instances are volunteer-operated and may rate-limit, become stale, or disappear. Do not treat one instance as permanently reliable.

## Windows notes

Before installing, you can check for a command-name conflict:

```powershell
where.exe x
```

The implementation is `dist\cli.js`. npm creates the Windows command shim in the global npm binary directory, normally `%APPDATA%\npm\x.cmd`. Run `npm prefix -g` to inspect your configured prefix.

PowerShell 7 (`pwsh.exe`) is recommended on Windows. The CLI can use the Windows networking stack for Nitter compatibility; set this to force native Node fetch:

```powershell
$env:X_CLI_NITTER_HTTP="fetch"
```

## Development and verification

```powershell
npm install
npm run check
npm test
npm run build:cli
node dist/cli.js --help
```

The MCP remains available for other agents and shares the same Service/Provider layer:

```powershell
Copy-Item wrangler.example.jsonc wrangler.jsonc
npx wrangler dev --config wrangler.jsonc
```

No deployment is required for CLI use.

## Security and information quality

- Public, unauthenticated, read-only data only.
- Never put secrets or private company information in queries.
- No posting, liking, reposting, following, DMs, private accounts, or access-control bypasses.
- Treat X posts as unverified claims; cross-check important facts with official blogs, GitHub, official documentation, arXiv, or primary papers.

## global-content-search integration

This CLI can be used as the X/Twitter backend for a larger cross-platform search Skill:

```text
global-content-search
├─ xhs search ...
├─ zhihu search ...
└─ x search ... --json
```

The upper layer only needs to parse the stable JSON response; it does not need to know whether FxTwitter or Nitter served the search.
