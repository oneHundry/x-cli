import { ProviderError, SearchUnavailableError, errorSummary } from '../core/errors.js';
import type {
  NormalizedPost,
  RawUpstreamResult,
  SearchOptions,
  SearchOutput,
  TimelineOptions
} from '../core/types.js';
import { cleanLimit, cleanQuery } from '../core/validation.js';
import { FxTwitterProvider } from '../providers/fxtwitter.js';
import { NitterProvider } from '../providers/nitter.js';

export type SearchExecution = {
  output: SearchOutput;
  raw?: RawUpstreamResult;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function metric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(text(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : text(value);
}

export function normalizeFxPost(value: unknown): NormalizedPost | null {
  const post = record(value);
  const id = text(post.id);
  const author = record(post.author);
  const handle = text(author.screen_name || author.username || author.handle).replace(/^@/, '');
  if (!id || !handle) return null;
  return {
    id,
    author: text(author.name || author.display_name || handle),
    handle,
    text: text(post.text),
    created_at: isoDate(post.created_at),
    url: `https://x.com/${handle}/status/${id}`,
    metrics: {
      likes: metric(post.likes),
      reposts: metric(post.reposts ?? post.retweets),
      replies: metric(post.replies),
      views: metric(post.views)
    }
  };
}

export function normalizeFxResults(data: Record<string, unknown>): NormalizedPost[] {
  const results = Array.isArray(data.results) ? data.results : [];
  return results.map(normalizeFxPost).filter((post): post is NormalizedPost => post !== null);
}

function shouldFallback(error: unknown): boolean {
  if (!(error instanceof ProviderError) || error.provider !== 'fxtwitter') return false;
  return [
    'not_found',
    'rate_limited',
    'upstream_unavailable',
    'timeout',
    'network_failure',
    'invalid_json_or_response'
  ].includes(error.kind);
}

export class XService {
  constructor(
    readonly fxTwitter: FxTwitterProvider,
    readonly nitter: NitterProvider
  ) {}

  async searchPosts(options: SearchOptions): Promise<SearchExecution> {
    const query = cleanQuery(options.query);
    const limit = cleanLimit(options.limit);
    const provider = options.provider ?? 'auto';

    if (provider === 'nitter') {
      const result = await this.nitter.search({ ...options, query, limit });
      return {
        output: {
          ok: true,
          platform: 'x',
          provider: 'nitter',
          fallback_used: false,
          query,
          count: result.posts.length,
          results: result.posts,
          freshness: result.freshness
        }
      };
    }

    try {
      const raw = await this.fxTwitter.search({ ...options, query, limit });
      const results = normalizeFxResults(raw.data);
      return {
        raw,
        output: {
          ok: true,
          platform: 'x',
          provider: 'fxtwitter',
          fallback_used: false,
          query,
          count: results.length,
          results
        }
      };
    } catch (fxError) {
      if (provider === 'fxtwitter' || !shouldFallback(fxError)) throw fxError;
      try {
        const result = await this.nitter.search({ ...options, query, limit });
        return {
          output: {
            ok: true,
            platform: 'x',
            provider: 'nitter',
            fallback_used: true,
            query,
            count: result.posts.length,
            results: result.posts,
            freshness: result.freshness
          }
        };
      } catch (nitterError) {
        throw new SearchUnavailableError({
          fxtwitter: errorSummary(fxError),
          nitter: errorSummary(nitterError)
        });
      }
    }
  }

  getPost(id: string, lang?: string): Promise<RawUpstreamResult> {
    return this.fxTwitter.getPost(id, lang);
  }

  getProfile(handle: string): Promise<RawUpstreamResult> {
    return this.fxTwitter.getProfile(handle);
  }

  getProfileStatuses(options: TimelineOptions): Promise<RawUpstreamResult> {
    return this.fxTwitter.getProfileStatuses(options);
  }

  getProfileMedia(options: TimelineOptions): Promise<RawUpstreamResult> {
    return this.fxTwitter.getProfileMedia(options);
  }

  getTrends(limit?: number): Promise<RawUpstreamResult> {
    return this.fxTwitter.getTrends(limit);
  }

  typeahead(query: string, limit?: number): Promise<RawUpstreamResult> {
    return this.fxTwitter.typeahead(query, limit);
  }

  getOpenApi(): Promise<RawUpstreamResult> {
    return this.fxTwitter.getOpenApi();
  }
}
