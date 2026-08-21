import type { NormalizedPost, RawUpstreamResult, SearchOptions, SearchOutput, TimelineOptions } from '../core/types.js';
import { FxTwitterProvider } from '../providers/fxtwitter.js';
import { NitterProvider } from '../providers/nitter.js';
export type SearchExecution = {
    output: SearchOutput;
    raw?: RawUpstreamResult;
};
export declare function normalizeFxPost(value: unknown): NormalizedPost | null;
export declare function normalizeFxResults(data: Record<string, unknown>): NormalizedPost[];
export declare class XService {
    readonly fxTwitter: FxTwitterProvider;
    readonly nitter: NitterProvider;
    constructor(fxTwitter: FxTwitterProvider, nitter: NitterProvider);
    searchPosts(options: SearchOptions): Promise<SearchExecution>;
    getPost(id: string, lang?: string): Promise<RawUpstreamResult>;
    getProfile(handle: string): Promise<RawUpstreamResult>;
    getProfileStatuses(options: TimelineOptions): Promise<RawUpstreamResult>;
    getProfileMedia(options: TimelineOptions): Promise<RawUpstreamResult>;
    getTrends(limit?: number): Promise<RawUpstreamResult>;
    typeahead(query: string, limit?: number): Promise<RawUpstreamResult>;
    getOpenApi(): Promise<RawUpstreamResult>;
}
