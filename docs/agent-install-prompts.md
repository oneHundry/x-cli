# x CLI agent prompts / AIエージェント導入プロンプト

## Japanese / 日本語

```text
同梱されている skills/x-mcp/SKILL.md を読み込み、公開 X/Twitter 情報の取得にはローカル x CLI を使ってください。通常は MCP server を起動しません。

検索:
x search "MCP" --limit 20 --json

アカウントの最近の投稿:
x timeline OpenAI --limit 20 --json

既知の投稿 ID:
x post <ID> --json

この CLI は public / read-only / no credentials です。password、Cookie、API key、access token、社内秘密を query に入れないでください。重要な主張は GitHub、公式ブログ、公式ドキュメント、arXiv などで確認してください。
```

## English

```text
Load the bundled skills/x-mcp/SKILL.md and use the local x CLI for public X/Twitter retrieval. Do not start the MCP server for normal requests.

Search:
x search "MCP" --limit 20 --json

Recent account posts:
x timeline OpenAI --limit 20 --json

Known post ID:
x post <ID> --json

This CLI is public, read-only, and credential-free. Never put passwords, cookies, API keys, access tokens, or private company information in queries. Cross-check important claims with GitHub, official blogs, official documentation, or arXiv.
```
