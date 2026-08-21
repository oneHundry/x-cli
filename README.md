# x CLI + x-mcp

Local, public, read-only X/Twitter retrieval. The local `x` CLI is the primary interface; the retained Streamable HTTP MCP uses the same provider/service layer.

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
```

Search diagnostics:

```bash
x search "MCP" --provider auto --json
x search "MCP" --provider fxtwitter --json
x search "MCP" --provider nitter --json
```

`auto` always tries FxTwitter first. Search HTTP 404, 429, 5xx, timeout, DNS/network failure, invalid JSON, or an unexpected response triggers Nitter. Invalid CLI arguments and HTTP 400 do not trigger fallback. Nitter supports only `feed=latest`; `top` remains FxTwitter-only.

A successful search has a stable shape:

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
      "metrics": { "likes": null, "reposts": null, "replies": null, "views": null }
    }
  ],
  "freshness": {
    "checked_at": "2026-08-21T00:00:10.000Z",
    "canary": "news",
    "canary_age_minutes": 2,
    "newest_result_age_minutes": 1,
    "fresh": true,
    "source_instance": "https://nitter.example"
  }
}
```

If both providers fail, the CLI exits non-zero and returns `x_search_unavailable`; it never reports a misleading successful empty result.

## Windows install

Check for a command conflict first:

```powershell
where.exe x
```

From this project directory:

```powershell
npm install
npm test
npm install -g .
where.exe x
x --help
```

The implementation is `dist\cli.js`. npm creates the Windows command shim in the global npm binary directory, normally `%APPDATA%\npm\x.cmd`. Run `npm prefix -g` to inspect the configured prefix. npm normally adds its global binary directory to `PATH`; if `where.exe x` still finds nothing, add that directory to the user `PATH` and open a new terminal.

Uninstall:

```powershell
npm uninstall -g x-mcp
```

For active development, `npm link` may be used instead of `npm install -g .`; undo it with `npm unlink -g x-mcp`.

PowerShell 7 (`pwsh.exe`) is recommended on Windows. The CLI uses it for Nitter HTTP when available because it follows the Windows networking stack; set `X_CLI_NITTER_HTTP=fetch` to force native Node fetch.

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

MCP callers and CLI arguments cannot choose arbitrary upstream URLs. Only the local operator can configure trusted instance origins.

## Nitter health and freshness

Before every CLI search fallback, candidate instances are probed in parallel with a high-volume search canary. An instance is excluded when:

- it times out, fails DNS/network/TLS, returns non-200/429/5xx, or returns HTML/bot-wall content;
- RSS is malformed, empty, or lacks dated posts;
- its newest canary is older than 180 minutes;
- it lags the best current instance by more than 90 minutes.

The two default candidates were directly verified on 2026-08-21. At verification time `nitter.perennialte.ch` was fresh while `nitter.privacyredirect.com` returned valid but stale data and was rejected. The pool reevaluates both every run, so recovered instances can re-enter automatically.

Nitter RSS does not provide reliable engagement metrics, so unavailable values remain `null`. All mirror post URLs are rewritten to canonical `https://x.com/...` URLs.

## Development and verification

```powershell
npm install
npm run check
npm test
npm run build:cli
node dist/cli.js --help
```

The MCP remains available for other agents:

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

---

# 日本語

`x` は公開 X/Twitter 情報を取得するローカル read-only CLI です。通常の Codex 利用では MCP を起動せず、CLI を直接使います。

```powershell
npm install
npm test
npm install -g .
x --help
x search "MCP" --limit 20 --json
```

検索は FxTwitter を最初に試し、404・429・5xx・timeout・network failure・不正レスポンス時だけ freshness 検査済み Nitter に切り替えます。両方失敗した場合は非ゼロ終了し、空の成功結果を偽装しません。

アンインストール:

```powershell
npm uninstall -g x-mcp
```

Nitter の public instance は不安定で、RSS には信頼できる like/repost/view 数がありません。重要な事実は必ず公式ブログ、GitHub、公式ドキュメント、arXiv などで確認してください。
