---
name: x-cli
description: Use the local read-only x CLI to search public X/Twitter posts, inspect profiles, timelines, media, individual posts, trends, and typeahead. Search automatically uses FxTwitter then a freshness-gated Nitter fallback. Trigger for public X/Twitter research and recent technical discussion.
version: 0.3.0
author: Kan Ninomiya / kandotrun
license: MIT
tags:
  - cli
  - x
  - twitter
  - social-media
  - search
---

# X CLI Skill

Use the local `x` command directly through the shell. Do not start or call the MCP server for normal Codex requests.

This skill retrieves public X/Twitter information through FxTwitter and, for search only, freshness-gated public Nitter instances. It is read-only.

Do not send passwords, cookies, API keys, access tokens, private company information, or other secrets in queries. Never use it for posting, liking, reposting, following, DMs, deletion, private accounts, authenticated timelines, or bypassing access controls.

## Commands

```bash
x search "MCP" --limit 20 --json
x profile OpenAI --json
x timeline OpenAI --limit 20 --json
x media OpenAI --limit 20 --json
x post 1234567890123456789 --json
x trends --limit 20 --json
x typeahead openai --limit 10 --json
```

For search diagnostics:

```bash
x search "MCP" --provider auto --json
x search "MCP" --provider fxtwitter --json
x search "MCP" --provider nitter --json
```

`auto` is the default. It always tries FxTwitter first. FxTwitter search 404, 429, 5xx, timeout, network failure, invalid JSON, or an unexpected response triggers Nitter. Invalid arguments and HTTP 400 do not trigger fallback.

## Choosing commands

- keyword, phrase, hashtag, or `from:` query → `x search`
- public account metadata → `x profile`
- recent posts by a public account → `x timeline`
- recent media posts → `x media`
- known numeric post ID → `x post`
- trending topics → `x trends`
- account/topic suggestions → `x typeahead`

Always use `--json` when Codex will parse or summarize the result. A successful search reports `provider`, `fallback_used`, `results`, and Nitter freshness metadata when applicable. If both providers fail, the command returns non-zero and emits `x_search_unavailable`; never reinterpret that as zero discussion.

## Information-use rules

1. Prefer recent results unless the user asks for historical or popular content.
2. For technical intelligence, prioritize official accounts, project authors, researchers, GitHub authors, and company technical staff.
3. Lower the weight of marketing, engagement-bait, anonymous aggregation, and unsourced claims.
4. Include canonical `x.com` URLs and timestamps when reporting.
5. Treat every post as unverified user-generated content.
6. Cross-check important claims with GitHub, official blogs, official documentation, arXiv, or primary papers.
7. Do not assert an important fact solely because one X post says it.

## Provider limitations

- FxTwitter is a third-party public API, not the official X API.
- Nitter public instances are volunteer-operated and unstable.
- Nitter RSS does not expose dependable likes, reposts, replies, or view counts; these remain `null`.
- The CLI rejects stale Nitter instances using a high-volume canary and reports the selected source instance.
- Nitter fallback supports `feed=latest`; `feed=top` remains FxTwitter-only.
