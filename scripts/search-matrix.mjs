import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { windowsCompatibleFetch } from '../dist/cli/windows-fetch.js';
import { FxTwitterProvider } from '../dist/providers/fxtwitter.js';
import { NitterProvider, parseNitterInstances } from '../dist/providers/nitter.js';
import { XService } from '../dist/services/x.js';

if (process.env.http_proxy || process.env.https_proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const queries = process.argv.slice(2);
if (!queries.length) throw new Error('provide one or more search queries');

const service = new XService(
  new FxTwitterProvider({ baseUrl: process.env.FXTWITTER_BASE_URL }),
  new NitterProvider({
    instances: parseNitterInstances(process.env.NITTER_INSTANCES),
    fetch: windowsCompatibleFetch()
  })
);

const rows = [];
for (const query of queries) {
  const started = Date.now();
  try {
    const { output } = await service.searchPosts({ query, limit: 5, provider: 'auto' });
    rows.push({
      query,
      ok: true,
      provider: output.provider,
      fallback_used: output.fallback_used,
      count: output.count,
      newest_result_age_minutes: output.freshness?.newest_result_age_minutes ?? null,
      source_instance: output.freshness?.source_instance ?? null,
      elapsed_ms: Date.now() - started
    });
  } catch (error) {
    rows.push({
      query,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: Date.now() - started
    });
  }
}

console.log(JSON.stringify(rows, null, 2));
if (rows.some((row) => !row.ok)) process.exitCode = 1;
