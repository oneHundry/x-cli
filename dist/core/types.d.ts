export type ProviderName = 'fxtwitter' | 'nitter';
export type SearchProvider = 'auto' | ProviderName;
export type PostMetrics = {
    likes: number | null;
    reposts: number | null;
    replies: number | null;
    views: number | null;
};
export type NormalizedPost = {
    id: string;
    author: string;
    handle: string;
    text: string;
    created_at: string | null;
    url: string;
    metrics: PostMetrics;
};
export type SearchFreshness = {
    checked_at: string;
    canary: string;
    canary_age_minutes: number;
    newest_result_age_minutes: number | null;
    fresh: boolean;
    source_instance?: string;
};
export type SearchOutput = {
    ok: true;
    platform: 'x';
    provider: ProviderName;
    fallback_used: boolean;
    query: string;
    count: number;
    results: NormalizedPost[];
    freshness?: SearchFreshness;
};
export type RawUpstreamResult = {
    upstreamUrl: string;
    status: number;
    data: Record<string, unknown>;
};
export type SearchOptions = {
    query: string;
    limit?: number;
    feed?: 'latest' | 'top' | 'media';
    cursor?: string;
    lang?: string;
    provider?: SearchProvider;
};
export type TimelineOptions = {
    handle: string;
    limit?: number;
    cursor?: string;
    lang?: string;
};
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
