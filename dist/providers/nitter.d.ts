import type { FetchLike, NormalizedPost, SearchFreshness, SearchOptions } from '../core/types.js';
export declare const DEFAULT_NITTER_INSTANCES: readonly ["https://nitter.perennialte.ch", "https://nitter.privacyredirect.com"];
type ParsedFeed = {
    posts: NormalizedPost[];
    newestAgeMinutes: number | null;
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
export declare function parseNitterInstances(value: string | undefined): string[] | undefined;
export declare function parseNitterRss(xml: string, instance: string, now?: Date): ParsedFeed;
export declare class NitterProvider {
    readonly instances: string[];
    private readonly fetchImpl;
    private readonly timeoutMs;
    private readonly totalTimeoutMs;
    private readonly maxCanaryAgeMinutes;
    private readonly maxCanaryLagMinutes;
    private readonly now;
    private readonly healthIntervalMs;
    private healthCache?;
    constructor(options?: NitterProviderOptions);
    private fetchFeed;
    private healthyInstances;
    search(options: SearchOptions): Promise<NitterSearchResult>;
}
export {};
