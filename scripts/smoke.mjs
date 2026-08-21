import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.X_MCP_URL || 'http://localhost:8787/mcp';
const client = new Client({ name: 'x-mcp-smoke', version: '0.1.0' });
const failures = [];

function parseResult(result) {
  const text = result.content?.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('Tool returned no text content');
  const payload = JSON.parse(text);
  if (result.isError) throw new Error(`${payload.error || 'tool error'}: ${JSON.stringify(payload)}`);
  return payload;
}

function summarize(name, payload) {
  const data = payload.data || {};
  const count = Array.isArray(payload.results)
    ? payload.results.length
    : Array.isArray(data.results)
    ? data.results.length
    : Array.isArray(data.trends)
      ? data.trends.length
      : typeof data.num_results === 'number'
        ? data.num_results
        : undefined;
  console.log(JSON.stringify({
    tool: name,
    provider: payload.provider,
    fallback_used: payload.fallback_used,
    status: payload.status,
    code: data.code,
    count,
    upstreamUrl: payload.upstreamUrl
  }));
}

async function call(name, args = {}) {
  try {
    const payload = parseResult(await client.callTool({ name, arguments: args }));
    summarize(name, payload);
    return payload;
  } catch (error) {
    failures.push({ tool: name, args, error: error instanceof Error ? error.message : String(error) });
    console.log(JSON.stringify(failures.at(-1)));
    return undefined;
  }
}

try {
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  const listed = await client.listTools();
  console.log(JSON.stringify({ tools: listed.tools.map((tool) => tool.name) }));

  let firstPostId;
  for (const q of ['OpenAI', 'from:OpenAI', 'from:AnthropicAI', '"AI agent"', 'MCP']) {
    const result = await call('search_posts', { q, feed: 'latest', count: 2 });
    firstPostId ||= result?.results?.[0]?.id || result?.data?.results?.[0]?.id;
  }

  await call('get_profile', { handle: 'OpenAI' });
  const statuses = await call('get_profile_statuses', { handle: 'OpenAI', count: 2 });
  firstPostId ||= statuses?.data?.results?.[0]?.id;
  await call('get_profile_media', { handle: 'OpenAI', count: 2 });
  if (firstPostId) {
    await call('get_post', { id: String(firstPostId) });
  } else {
    failures.push({ tool: 'get_post', error: 'No real post ID was returned by search or profile statuses' });
    console.log(JSON.stringify(failures.at(-1)));
  }
  await call('get_trends', { count: 2 });
  await call('typeahead', { q: 'openai', count: 2 });

  const openapi = await call('get_openapi');
  if (openapi && (openapi.data?.openapi !== '3.0.0' || !openapi.data?.paths?.['/2/search'])) {
    failures.push({ tool: 'get_openapi', error: 'OpenAPI response did not contain the expected v2 search path' });
  }
  if (failures.length) {
    throw new Error(`Smoke test completed with ${failures.length} upstream/tool failure(s)`);
  }
} finally {
  await client.close();
}
