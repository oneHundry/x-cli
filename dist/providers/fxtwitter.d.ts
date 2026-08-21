import type { FetchLike, RawUpstreamResult, SearchOptions, TimelineOptions } from '../core/types.js';
export declare const DEFAULT_FXTWITTER_BASE_URL = "https://api.fxtwitter.com";
export type FxTwitterProviderOptions = {
    baseUrl?: string;
    timeoutMs?: number;
    fetch?: FetchLike;
};
export declare class FxTwitterProvider {
    readonly baseUrl: string;
    private readonly timeoutMs;
    private readonly fetchImpl;
    constructor(options?: FxTwitterProviderOptions);
    request(pathname: string, params?: URLSearchParams, requireApiCode?: boolean): Promise<RawUpstreamResult>;
    search(options: SearchOptions): Promise<RawUpstreamResult>;
    getPost(id: string, lang?: string): Promise<RawUpstreamResult>;
    getProfile(handle: string): Promise<RawUpstreamResult>;
    getProfileStatuses(options: TimelineOptions): Promise<RawUpstreamResult>;
    getProfileMedia(options: TimelineOptions): Promise<RawUpstreamResult>;
    getTrends(limit?: number): Promise<RawUpstreamResult>;
    typeahead(query: string, limit?: number): Promise<RawUpstreamResult>;
    getOpenApi(): Promise<RawUpstreamResult>;
}
