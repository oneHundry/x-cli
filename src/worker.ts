import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Hono } from 'hono';
import * as z from 'zod/v4';
import { ProviderError, SearchUnavailableError } from './core/errors.js';
import { MAX_COUNT, MAX_TRENDS_COUNT } from './core/validation.js';
import { FxTwitterProvider } from './providers/fxtwitter.js';
import { NitterProvider, parseNitterInstances } from './providers/nitter.js';
import { XService } from './services/x.js';

const TOOL_NAMES = [
  'search_posts', 'get_post', 'get_profile', 'get_profile_statuses',
  'get_profile_media', 'get_trends', 'typeahead', 'get_openapi'
] as const;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, mcp-session-id, Last-Event-ID, mcp-protocol-version',
  'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
  'Access-Control-Max-Age': '86400'
} satisfies Record<string, string>;

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  ...corsHeaders
} satisfies Record<string, string>;

type RuntimeEnv = Env & {
  NITTER_INSTANCES?: string;
  NITTER_MAX_CANARY_AGE_MIN?: string;
  NITTER_MAX_CANARY_LAG_MIN?: string;
};

type HonoBindings = { Bindings: RuntimeEnv };

function numberOr(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function createXService(env: RuntimeEnv): XService {
  return new XService(
    new FxTwitterProvider({ baseUrl: env.FXTWITTER_BASE_URL }),
    new NitterProvider({
      instances: parseNitterInstances(env.NITTER_INSTANCES),
      maxCanaryAgeMinutes: numberOr(env.NITTER_MAX_CANARY_AGE_MIN, 180),
      maxCanaryLagMinutes: numberOr(env.NITTER_MAX_CANARY_LAG_MIN, 90)
    })
  );
}

function jsonResponse(payload: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...jsonHeaders, ...Object.fromEntries(new Headers(extraHeaders)) }
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders }
  });
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function toolJson(result: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

function toolError(error: unknown): CallToolResult {
  const payload: Record<string, unknown> = {
    error: error instanceof Error ? error.message : String(error)
  };
  if (error instanceof ProviderError) {
    payload.provider = error.provider;
    payload.kind = error.kind;
    payload.status = error.status;
    payload.retryable = error.retryable;
    payload.details = error.details;
  } else if (error instanceof SearchUnavailableError) {
    payload.kind = 'x_search_unavailable';
    payload.providers = error.providers;
  }
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return toolJson(await fn());
  } catch (error) {
    return toolError(error);
  }
}

function createServer(env: RuntimeEnv): McpServer {
  const service = createXService(env);
  const server = new McpServer(
    { name: 'x-mcp', version: '0.2.0' },
    {
      instructions: 'Public read-only X/Twitter retrieval. Search uses FxTwitter first and freshness-gated Nitter fallback. Never send credentials or secrets. Cross-check important claims with official sources.'
    }
  );
  const readOnlyAnnotations = {
    readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true
  } as const;

  server.registerTool('search_posts', {
    title: 'Search X posts',
    description: 'Search public X posts through FxTwitter with Nitter fallback.',
    annotations: readOnlyAnnotations,
    inputSchema: {
      q: z.string().min(1).max(500),
      feed: z.enum(['latest', 'top', 'media']).default('latest'),
      count: z.number().int().min(1).max(MAX_COUNT).default(10),
      cursor: z.string().max(500).optional(),
      lang: z.string().min(2).max(20).optional()
    }
  }, async ({ q, feed = 'latest', count = 10, cursor, lang }) => runTool(async () => {
    const execution = await service.searchPosts({ query: q, feed, limit: count, cursor, lang });
    return execution.raw ?? execution.output;
  }));

  server.registerTool('get_post', {
    title: 'Get X post by status id', description: 'Get a public X post through FxTwitter.', annotations: readOnlyAnnotations,
    inputSchema: { id: z.string().regex(/^[0-9]{2,20}$/), lang: z.string().min(2).max(20).optional() }
  }, async ({ id, lang }) => runTool(() => service.getPost(id, lang)));

  server.registerTool('get_profile', {
    title: 'Get X profile', description: 'Get public X profile metadata through FxTwitter.', annotations: readOnlyAnnotations,
    inputSchema: { handle: z.string().min(1).max(31) }
  }, async ({ handle }) => runTool(() => service.getProfile(handle)));

  server.registerTool('get_profile_statuses', {
    title: 'Get profile posts', description: 'Get recent public profile posts through FxTwitter.', annotations: readOnlyAnnotations,
    inputSchema: {
      handle: z.string().min(1).max(31), count: z.number().int().min(1).max(MAX_COUNT).default(10),
      cursor: z.string().max(500).optional(), lang: z.string().min(2).max(20).optional()
    }
  }, async ({ handle, count = 10, cursor, lang }) => runTool(() => service.getProfileStatuses({ handle, limit: count, cursor, lang })));

  server.registerTool('get_profile_media', {
    title: 'Get profile media posts', description: 'Get recent public profile media through FxTwitter.', annotations: readOnlyAnnotations,
    inputSchema: {
      handle: z.string().min(1).max(31), count: z.number().int().min(1).max(MAX_COUNT).default(10),
      cursor: z.string().max(500).optional(), lang: z.string().min(2).max(20).optional()
    }
  }, async ({ handle, count = 10, cursor, lang }) => runTool(() => service.getProfileMedia({ handle, limit: count, cursor, lang })));

  server.registerTool('get_trends', {
    title: 'Get X trends', description: 'Get public X trends through FxTwitter.', annotations: readOnlyAnnotations,
    inputSchema: { count: z.number().int().min(1).max(MAX_TRENDS_COUNT).default(10) }
  }, async ({ count = 10 }) => runTool(() => service.getTrends(count)));

  server.registerTool('typeahead', {
    title: 'X typeahead', description: 'Get public X suggestions through FxTwitter.', annotations: readOnlyAnnotations,
    inputSchema: { q: z.string().min(1).max(200), count: z.number().int().min(1).max(MAX_COUNT).default(10) }
  }, async ({ q, count = 10 }) => runTool(() => service.typeahead(q, count)));

  server.registerTool('get_openapi', {
    title: 'Get upstream OpenAPI document', description: "Get FxTwitter's OpenAPI document.", annotations: readOnlyAnnotations,
    inputSchema: {}
  }, async () => runTool(() => service.getOpenApi()));

  return server;
}

async function handleMcp(request: Request, env: RuntimeEnv): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = createServer(env);
  await server.connect(transport);
  return withCors(await transport.handleRequest(request));
}

function wellKnown(request: Request): Response {
  const origin = new URL(request.url).origin;
  return jsonResponse({
    name: 'x-mcp', description: 'Read-only X/Twitter MCP sharing providers with the local x CLI.',
    transport: 'streamable-http', endpoint: `${origin}/mcp`, mcpServers: { x: { url: `${origin}/mcp` } }, tools: TOOL_NAMES
  });
}

const app = new Hono<HonoBindings>();
app.options('*', () => new Response(null, { status: 204, headers: corsHeaders }));
app.get('/health', (c) => jsonResponse({ ok: true, service: 'x-mcp', fxTwitterBaseUrl: c.env.FXTWITTER_BASE_URL }));
app.get('/.well-known/mcp.json', (c) => wellKnown(c.req.raw));
app.get('/', (c) => textResponse(`x-mcp\n\nShared provider/service layer with the local x CLI.\nMCP: ${new URL(c.req.url).origin}/mcp\n`));
app.get('/index.txt', (c) => textResponse(`x-mcp\nMCP: ${new URL(c.req.url).origin}/mcp\n`));
app.all('/mcp', async (c) => {
  if (c.req.method !== 'POST') {
    return jsonResponse({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }, 405, { Allow: 'POST, OPTIONS' });
  }
  return handleMcp(c.req.raw, c.env);
});
app.notFound((c) => jsonResponse({ error: 'not found', mcpEndpoint: `${new URL(c.req.url).origin}/mcp` }, 404));

export default app;
