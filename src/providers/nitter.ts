import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ProviderError } from '../core/errors.js';
import type { FetchLike, NormalizedPost, SearchFreshness, SearchOptions } from '../core/types.js';
import { cleanLang, cleanLimit, cleanQuery } from '../core/validation.js';

// Verified with /search/rss on 2026-08-21. The first was fresh; the second was
// reachable but stale and is retained so it can re-enter automatically after recovery.
export const DEFAULT_NITTER_INSTANCES = [
  'https://nitter.perennialte.ch',
  'https://nitter.privacyredirect.com'
] as const;

const RSS_USER_AGENT = 'Mozilla/5.0 (compatible; Miniflux/2.1.3; +https://miniflux.app)';
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_CANARY_AGE_MIN = 180;
const DEFAULT_MAX_CANARY_LAG_MIN = 90;
const DEFAULT_HEALTH_INTERVAL_MS = 10 * 60_000;
const CANARY_QUERY = 'news';

type ParsedFeed = {
  posts: NormalizedPost[];
  newestAgeMinutes: number | null;
};

type ProbeResult = {
  instance: string;
  ageMinutes: number;
};

export type NitterSearchResult = {
  posts: NormalizedPost[];
  instance: string;
  freshness: SearchFreshness;
};

export type NitterProviderOptions = {
  instances?: string[];
  fetch?: FetchLike;
  timeoutMs?: number;
  totalTimeoutMs?: number;
  maxCanaryAgeMinutes?: number;
  maxCanaryLagMinutes?: number;
  now?: () => Date;
  healthIntervalMs?: number;
};

export function parseNitterInstances(value: string | undefined): string[] | undefined {
  if (!value?.trim()) return undefined;
  const values = value.split(',').map((item) => item.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function validateInstances(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('NITTER_INSTANCES entries must be HTTP(S) origins without credentials, query, or fragment');
    }
    const base = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    seen.add(base);
  }
  if (!seen.size) throw new Error('NITTER_INSTANCES must contain at least one instance');
  return [...seen];
}

function scalar(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object' && !Array.isArray(value)) {
    const text = (value as Record<string, unknown>)['#text'];
    return text === undefined ? '' : String(text).trim();
  }
  return '';
}

function numericMetric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function canonicalUrl(handle: string, id: string): string {
  return `https://x.com/${handle || 'i'}/status/${id}`;
}

export function parseNitterRss(xml: string, instance: string, now = new Date()): ParsedFeed {
  if (!xml.trim() || !/<rss[\s>]/i.test(xml.slice(0, 500))) {
    throw new ProviderError({
      provider: 'nitter',
      kind: 'invalid_json_or_response',
      message: 'Nitter returned HTML, an empty body, or a bot challenge',
      retryable: true
    });
  }
  const validity = XMLValidator.validate(xml);
  if (validity !== true) {
    throw new ProviderError({
      provider: 'nitter',
      kind: 'invalid_json_or_response',
      message: `Nitter returned malformed RSS: ${validity.err.msg}`,
      retryable: true
    });
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
    processEntities: true
  });
  const document = parser.parse(xml) as Record<string, unknown>;
  const rss = document.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  if (!channel) {
    throw new ProviderError({
      provider: 'nitter',
      kind: 'invalid_json_or_response',
      message: 'Nitter RSS is missing a channel',
      retryable: true
    });
  }
  if (scalar(channel.title).toLowerCase().includes('not yet whitelist')) {
    throw new ProviderError({
      provider: 'nitter',
      kind: 'upstream_unavailable',
      message: 'Nitter instance requires RSS reader whitelisting',
      retryable: true
    });
  }

  const rawItems = channel.item === undefined ? [] : Array.isArray(channel.item) ? channel.item : [channel.item];
  const posts: NormalizedPost[] = [];

  for (const itemValue of rawItems) {
    if (!itemValue || typeof itemValue !== 'object' || Array.isArray(itemValue)) continue;
    const item = itemValue as Record<string, unknown>;
    const created = new Date(scalar(item.pubDate));
    if (!Number.isFinite(created.getTime())) continue;
    const creator = scalar(item['dc:creator']).replace(/^@/, '');
    const link = scalar(item.link);
    const guid = scalar(item.guid);
    const id = (/^\d+$/.test(guid) ? guid : /\/status\/(\d+)/.exec(`${guid} ${link}`)?.[1]) || '';
    const handle = creator || /^\/?([^/]+)\/status\//.exec(new URL(link, instance).pathname)?.[1] || '';
    if (!id || !handle) continue;
    let text = scalar(item.title);
    text = text.replace(/^(?:RT by|R to) @[A-Za-z0-9_]{1,30}:\s*/, '').trim();
    posts.push({
      id,
      author: handle,
      handle,
      text,
      created_at: created.toISOString(),
      url: canonicalUrl(handle, id),
      metrics: {
        likes: numericMetric(item.likes),
        reposts: numericMetric(item.reposts),
        replies: numericMetric(item.replies),
        views: numericMetric(item.views)
      }
    });
  }

  posts.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  const newest = posts[0]?.created_at ? new Date(posts[0].created_at) : undefined;
  const newestAgeMinutes = newest ? Math.max(0, (now.getTime() - newest.getTime()) / 60_000) : null;
  return { posts, newestAgeMinutes };
}

export class NitterProvider {
  readonly instances: string[];
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly totalTimeoutMs: number;
  private readonly maxCanaryAgeMinutes: number;
  private readonly maxCanaryLagMinutes: number;
  private readonly now: () => Date;
  private readonly healthIntervalMs: number;
  private healthCache?: {
    expiresAt: number;
    value: { healthy: ProbeResult[]; errors: Record<string, string> };
  };

  constructor(options: NitterProviderOptions = {}) {
    this.instances = validateInstances(options.instances || DEFAULT_NITTER_INSTANCES);
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
    this.maxCanaryAgeMinutes = options.maxCanaryAgeMinutes ?? DEFAULT_MAX_CANARY_AGE_MIN;
    this.maxCanaryLagMinutes = options.maxCanaryLagMinutes ?? DEFAULT_MAX_CANARY_LAG_MIN;
    this.now = options.now ?? (() => new Date());
    this.healthIntervalMs = options.healthIntervalMs ?? DEFAULT_HEALTH_INTERVAL_MS;
  }

  private async fetchFeed(instance: string, query: string, deadline: number): Promise<ParsedFeed> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new ProviderError({ provider: 'nitter', kind: 'timeout', message: 'Nitter total timeout exceeded', retryable: true });
    }
    const timeout = Math.min(this.timeoutMs, remaining);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const url = new URL('search/rss', `${instance}/`);
    url.search = new URLSearchParams({ f: 'tweets', q: query }).toString();
    let response: Response;
    try {
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
            'User-Agent': RSS_USER_AGENT
          }
        });
      } catch (error) {
        const timedOut = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
        throw new ProviderError({
          provider: 'nitter',
          kind: timedOut ? 'timeout' : 'network_failure',
          message: timedOut ? `Nitter request timed out after ${timeout}ms` : 'Could not reach Nitter instance',
          retryable: true,
          details: { instance }
        });
      }
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new ProviderError({ provider: 'nitter', kind: 'rate_limited', status: 429, message: 'Nitter instance rate limited the request', retryable: true, details: { instance } });
    }
    if (!response.ok) {
      throw new ProviderError({
        provider: 'nitter',
        kind: response.status >= 500 ? 'upstream_unavailable' : 'upstream_http_error',
        status: response.status,
        message: `Nitter instance returned HTTP ${response.status}`,
        retryable: true,
        details: { instance }
      });
    }
    return parseNitterRss(await response.text(), instance, this.now());
  }

  private async healthyInstances(deadline: number): Promise<{ healthy: ProbeResult[]; errors: Record<string, string> }> {
    if (this.healthCache && this.healthCache.expiresAt > Date.now()) return this.healthCache.value;
    const probes: Array<ProbeResult | { instance: string; error: string }> = await Promise.all(
      this.instances.map(async (instance): Promise<ProbeResult | { instance: string; error: string }> => {
        try {
          const feed = await this.fetchFeed(instance, CANARY_QUERY, deadline);
          if (feed.newestAgeMinutes === null || !feed.posts.length) throw new Error('canary returned no dated posts');
          return { instance, ageMinutes: feed.newestAgeMinutes } satisfies ProbeResult;
        } catch (error) {
          return { instance, error: error instanceof Error ? error.message : String(error) };
        }
      })
    );
    const successful = probes.filter((probe): probe is ProbeResult => 'ageMinutes' in probe);
    const best = successful.length ? Math.min(...successful.map((probe) => probe.ageMinutes)) : Number.POSITIVE_INFINITY;
    const healthy = successful
      .filter((probe) => probe.ageMinutes <= this.maxCanaryAgeMinutes && probe.ageMinutes - best <= this.maxCanaryLagMinutes)
      .sort((a, b) => a.ageMinutes - b.ageMinutes);
    const errors: Record<string, string> = {};
    for (const probe of probes) {
      if ('error' in probe) errors[probe.instance] = probe.error;
      else if (!healthy.includes(probe)) errors[probe.instance] = `stale canary (${probe.ageMinutes.toFixed(1)} minutes old; best ${best.toFixed(1)})`;
    }
    const value = { healthy, errors };
    this.healthCache = { expiresAt: Date.now() + this.healthIntervalMs, value };
    return value;
  }

  async search(options: SearchOptions): Promise<NitterSearchResult> {
    if (options.cursor) {
      throw new ProviderError({
        provider: 'nitter',
        kind: 'unsupported',
        message: 'Nitter RSS fallback cannot continue an FxTwitter cursor',
        retryable: false
      });
    }
    if ((options.feed ?? 'latest') !== 'latest') {
      throw new ProviderError({
        provider: 'nitter',
        kind: 'unsupported',
        message: 'Nitter RSS fallback supports only feed=latest',
        retryable: false
      });
    }
    const limit = cleanLimit(options.limit);
    let query = cleanQuery(options.query);
    const lang = cleanLang(options.lang);
    if (lang) query = `${query} lang:${lang}`;
    const deadline = Date.now() + this.totalTimeoutMs;
    const { healthy, errors } = await this.healthyInstances(deadline);

    if (!healthy.length) {
      throw new ProviderError({
        provider: 'nitter',
        kind: 'upstream_unavailable',
        message: 'No healthy and fresh Nitter search instances',
        retryable: true,
        details: errors
      });
    }

    for (const candidate of healthy) {
      try {
        const feed = await this.fetchFeed(candidate.instance, query, deadline);
        if (!feed.posts.length) {
          errors[candidate.instance] = 'valid RSS but no dated search results';
          continue;
        }
        return {
          posts: feed.posts.slice(0, limit),
          instance: candidate.instance,
          freshness: {
            checked_at: this.now().toISOString(),
            canary: CANARY_QUERY,
            canary_age_minutes: Number(candidate.ageMinutes.toFixed(1)),
            newest_result_age_minutes: feed.newestAgeMinutes === null ? null : Number(feed.newestAgeMinutes.toFixed(1)),
            fresh: true,
            source_instance: candidate.instance
          }
        };
      } catch (error) {
        errors[candidate.instance] = error instanceof Error ? error.message : String(error);
      }
    }

    throw new ProviderError({
      provider: 'nitter',
      kind: 'upstream_unavailable',
      message: 'All healthy Nitter instances failed the requested search',
      retryable: true,
      details: errors
    });
  }
}
