export type ProviderErrorKind = 'invalid_request' | 'not_found' | 'rate_limited' | 'upstream_unavailable' | 'upstream_http_error' | 'timeout' | 'network_failure' | 'invalid_json_or_response' | 'unsupported';
export declare class ProviderError extends Error {
    readonly provider: 'fxtwitter' | 'nitter';
    readonly kind: ProviderErrorKind;
    readonly status?: number;
    readonly retryable: boolean;
    readonly details?: unknown;
    constructor(options: {
        provider: 'fxtwitter' | 'nitter';
        kind: ProviderErrorKind;
        message: string;
        status?: number;
        retryable?: boolean;
        details?: unknown;
    });
}
export declare class SearchUnavailableError extends Error {
    readonly providers: Record<string, string>;
    constructor(providers: Record<string, string>);
}
export declare function errorSummary(error: unknown): string;
