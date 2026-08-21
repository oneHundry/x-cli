import { ProviderError, SearchUnavailableError, errorSummary } from '../core/errors.js';
import { cleanLimit, cleanQuery } from '../core/validation.js';
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function text(value) {
    return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}
function metric(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
        return Number(value);
    return null;
}
function isoDate(value) {
    if (!value)
        return null;
    const date = new Date(text(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : text(value);
}
export function normalizeFxPost(value) {
    const post = record(value);
    const id = text(post.id);
    const author = record(post.author);
    const handle = text(author.screen_name || author.username || author.handle).replace(/^@/, '');
    if (!id || !handle)
        return null;
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
export function normalizeFxResults(data) {
    const results = Array.isArray(data.results) ? data.results : [];
    return results.map(normalizeFxPost).filter((post) => post !== null);
}
function shouldFallback(error) {
    if (!(error instanceof ProviderError) || error.provider !== 'fxtwitter')
        return false;
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
    fxTwitter;
    nitter;
    constructor(fxTwitter, nitter) {
        this.fxTwitter = fxTwitter;
        this.nitter = nitter;
    }
    async searchPosts(options) {
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
        }
        catch (fxError) {
            if (provider === 'fxtwitter' || !shouldFallback(fxError))
                throw fxError;
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
            }
            catch (nitterError) {
                throw new SearchUnavailableError({
                    fxtwitter: errorSummary(fxError),
                    nitter: errorSummary(nitterError)
                });
            }
        }
    }
    getPost(id, lang) {
        return this.fxTwitter.getPost(id, lang);
    }
    getProfile(handle) {
        return this.fxTwitter.getProfile(handle);
    }
    getProfileStatuses(options) {
        return this.fxTwitter.getProfileStatuses(options);
    }
    getProfileMedia(options) {
        return this.fxTwitter.getProfileMedia(options);
    }
    getTrends(limit) {
        return this.fxTwitter.getTrends(limit);
    }
    typeahead(query, limit) {
        return this.fxTwitter.typeahead(query, limit);
    }
    getOpenApi() {
        return this.fxTwitter.getOpenApi();
    }
}
//# sourceMappingURL=x.js.map