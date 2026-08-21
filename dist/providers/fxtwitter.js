import { ProviderError } from '../core/errors.js';
import { MAX_TRENDS_COUNT, cleanHandle, cleanLang, cleanLimit, cleanQuery, cleanStatusId, optionalParam } from '../core/validation.js';
export const DEFAULT_FXTWITTER_BASE_URL = 'https://api.fxtwitter.com';
const DEFAULT_TIMEOUT_MS = 12_000;
function validatedOrigin(value) {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('FXTWITTER_BASE_URL must be an HTTP(S) origin without credentials, query, or fragment');
    }
    if (url.pathname !== '/' && url.pathname !== '') {
        throw new Error('FXTWITTER_BASE_URL must not include a path');
    }
    return url.origin;
}
function classifyStatus(status) {
    if (status === 400)
        return { kind: 'invalid_request', retryable: false };
    if (status === 404)
        return { kind: 'not_found', retryable: false };
    if (status === 429)
        return { kind: 'rate_limited', retryable: true };
    if (status >= 500)
        return { kind: 'upstream_unavailable', retryable: true };
    return { kind: 'upstream_http_error', retryable: false };
}
function limitResults(result, count) {
    const results = result.data.results;
    if (!Array.isArray(results))
        return result;
    return { ...result, data: { ...result.data, results: results.slice(0, count) } };
}
export class FxTwitterProvider {
    baseUrl;
    timeoutMs;
    fetchImpl;
    constructor(options = {}) {
        this.baseUrl = validatedOrigin(options.baseUrl || DEFAULT_FXTWITTER_BASE_URL);
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    }
    async request(pathname, params = new URLSearchParams(), requireApiCode = true) {
        const url = new URL(pathname, `${this.baseUrl}/`);
        url.search = params.toString();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let response;
        try {
            try {
                response = await this.fetchImpl(url, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: { Accept: 'application/json', 'User-Agent': 'x-cli/0.2' }
                });
            }
            catch (error) {
                if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
                    throw new ProviderError({
                        provider: 'fxtwitter',
                        kind: 'timeout',
                        message: `FxTwitter request timed out after ${this.timeoutMs}ms`,
                        retryable: true
                    });
                }
                throw new ProviderError({
                    provider: 'fxtwitter',
                    kind: 'network_failure',
                    message: 'Could not reach FxTwitter (DNS or network failure)',
                    retryable: true,
                    details: error instanceof Error ? error.message : String(error)
                });
            }
        }
        finally {
            clearTimeout(timer);
        }
        const contentType = response.headers.get('Content-Type') || '';
        if (!/application\/(?:[\w.+-]*\+)?json/i.test(contentType)) {
            const text = (await response.text()).slice(0, 500);
            if (!response.ok) {
                const classification = classifyStatus(response.status);
                throw new ProviderError({
                    provider: 'fxtwitter',
                    ...classification,
                    status: response.status,
                    message: `FxTwitter returned HTTP ${response.status}`,
                    details: text
                });
            }
            throw new ProviderError({
                provider: 'fxtwitter',
                kind: 'invalid_json_or_response',
                message: 'FxTwitter returned a non-JSON success response',
                retryable: true
            });
        }
        let body;
        try {
            body = await response.json();
        }
        catch {
            throw new ProviderError({
                provider: 'fxtwitter',
                kind: 'invalid_json_or_response',
                message: 'FxTwitter returned invalid JSON',
                retryable: true
            });
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new ProviderError({
                provider: 'fxtwitter',
                kind: 'invalid_json_or_response',
                message: 'FxTwitter returned an unexpected JSON root',
                retryable: true
            });
        }
        const data = body;
        if (!response.ok) {
            const classification = classifyStatus(response.status);
            throw new ProviderError({
                provider: 'fxtwitter',
                ...classification,
                status: response.status,
                message: `FxTwitter returned HTTP ${response.status}`,
                details: data
            });
        }
        if (requireApiCode && typeof data.code !== 'number') {
            throw new ProviderError({
                provider: 'fxtwitter',
                kind: 'invalid_json_or_response',
                message: 'FxTwitter response is missing numeric code',
                retryable: true
            });
        }
        if (requireApiCode && typeof data.code === 'number' && data.code >= 400) {
            const classification = classifyStatus(data.code);
            throw new ProviderError({
                provider: 'fxtwitter',
                ...classification,
                status: data.code,
                message: `FxTwitter returned API code ${data.code}`,
                details: data
            });
        }
        return { upstreamUrl: url.toString(), status: response.status, data };
    }
    async search(options) {
        const limit = cleanLimit(options.limit);
        const params = new URLSearchParams({
            q: cleanQuery(options.query),
            feed: options.feed ?? 'latest',
            count: String(limit)
        });
        optionalParam(params, 'cursor', options.cursor);
        optionalParam(params, 'lang', cleanLang(options.lang));
        return limitResults(await this.request('/2/search', params), limit);
    }
    getPost(id, lang) {
        const params = new URLSearchParams();
        optionalParam(params, 'lang', cleanLang(lang));
        return this.request(`/2/status/${cleanStatusId(id)}`, params);
    }
    getProfile(handle) {
        return this.request(`/2/profile/${cleanHandle(handle)}`);
    }
    async getProfileStatuses(options) {
        const limit = cleanLimit(options.limit);
        const params = new URLSearchParams({ count: String(limit) });
        optionalParam(params, 'cursor', options.cursor);
        optionalParam(params, 'lang', cleanLang(options.lang));
        return limitResults(await this.request(`/2/profile/${cleanHandle(options.handle)}/statuses`, params), limit);
    }
    async getProfileMedia(options) {
        const limit = cleanLimit(options.limit);
        const params = new URLSearchParams({ count: String(limit) });
        optionalParam(params, 'cursor', options.cursor);
        optionalParam(params, 'lang', cleanLang(options.lang));
        return limitResults(await this.request(`/2/profile/${cleanHandle(options.handle)}/media`, params), limit);
    }
    getTrends(limit = 10) {
        const count = cleanLimit(limit, 10, MAX_TRENDS_COUNT);
        return this.request('/2/trends', new URLSearchParams({ count: String(count) }));
    }
    async typeahead(query, limit = 10) {
        const count = cleanLimit(limit);
        const result = await this.request('/2/typeahead', new URLSearchParams({ q: cleanQuery(query, 200) }));
        const data = { ...result.data };
        let remaining = count;
        for (const key of ['users', 'topics', 'events']) {
            const values = data[key];
            if (Array.isArray(values)) {
                data[key] = values.slice(0, remaining);
                remaining -= data[key].length;
            }
        }
        data.num_results = count - remaining;
        return { ...result, data };
    }
    getOpenApi() {
        return this.request('/2/openapi.json', new URLSearchParams(), false);
    }
}
//# sourceMappingURL=fxtwitter.js.map