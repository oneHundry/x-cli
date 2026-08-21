import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderError } from '../dist/core/errors.js';
import { NitterProvider, parseNitterRss } from '../dist/providers/nitter.js';
import { XService } from '../dist/services/x.js';

const NOW = new Date('2026-08-21T04:00:00Z');

function rss({ id = '1234567890123456789', handle = 'OpenAI', text = 'hello', minutesAgo = 1 } = {}) {
  const date = new Date(NOW.getTime() - minutesAgo * 60_000).toUTCString();
  return `<?xml version="1.0"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Search</title><item><title><![CDATA[${text}]]></title><dc:creator>@${handle}</dc:creator><pubDate>${date}</pubDate><guid>${id}</guid><link>https://mirror.test/${handle}/status/${id}</link></item></channel></rss>`;
}

test('parseNitterRss creates canonical x.com posts with unknown metrics as null', () => {
  const parsed = parseNitterRss(rss(), 'https://mirror.test', NOW);
  assert.equal(parsed.posts.length, 1);
  assert.equal(parsed.posts[0].url, 'https://x.com/OpenAI/status/1234567890123456789');
  assert.deepEqual(parsed.posts[0].metrics, { likes: null, reposts: null, replies: null, views: null });
  assert.equal(Math.round(parsed.newestAgeMinutes), 1);
});

test('NitterProvider excludes a stale HTTP 200 instance and uses the fresh one', async () => {
  const fetch = async (input) => {
    const url = new URL(input);
    const isCanary = url.searchParams.get('q') === 'news';
    const minutesAgo = url.hostname === 'stale.test' ? 1000 : isCanary ? 2 : 3;
    return new Response(rss({ minutesAgo }), { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
  };
  const provider = new NitterProvider({
    instances: ['https://stale.test', 'https://fresh.test'], fetch, now: () => NOW,
    maxCanaryAgeMinutes: 180, maxCanaryLagMinutes: 90
  });
  const result = await provider.search({ query: 'MCP', limit: 1 });
  assert.equal(result.instance, 'https://fresh.test');
  assert.equal(result.freshness.fresh, true);
  assert.equal(result.posts.length, 1);
});

test('XService falls back on FxTwitter 404 and marks fallback_used', async () => {
  const fx = {
    search: async () => { throw new ProviderError({ provider: 'fxtwitter', kind: 'not_found', status: 404, message: 'HTTP 404' }); }
  };
  const nitter = {
    search: async () => ({
      posts: parseNitterRss(rss(), 'https://fresh.test', NOW).posts,
      instance: 'https://fresh.test',
      freshness: {
        checked_at: NOW.toISOString(), canary: 'news', canary_age_minutes: 1,
        newest_result_age_minutes: 1, fresh: true, source_instance: 'https://fresh.test'
      }
    })
  };
  const service = new XService(fx, nitter);
  const result = await service.searchPosts({ query: 'MCP', limit: 1 });
  assert.equal(result.output.provider, 'nitter');
  assert.equal(result.output.fallback_used, true);
});

test('XService does not hide FxTwitter invalid requests with fallback', async () => {
  let nitterCalled = false;
  const fx = {
    search: async () => { throw new ProviderError({ provider: 'fxtwitter', kind: 'invalid_request', status: 400, message: 'HTTP 400' }); }
  };
  const nitter = { search: async () => { nitterCalled = true; throw new Error('should not run'); } };
  const service = new XService(fx, nitter);
  await assert.rejects(() => service.searchPosts({ query: 'MCP' }), /HTTP 400/);
  assert.equal(nitterCalled, false);
});
