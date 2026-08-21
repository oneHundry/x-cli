export class ProviderError extends Error {
    provider;
    kind;
    status;
    retryable;
    details;
    constructor(options) {
        super(options.message);
        this.name = 'ProviderError';
        this.provider = options.provider;
        this.kind = options.kind;
        this.status = options.status;
        this.retryable = options.retryable ?? false;
        this.details = options.details;
    }
}
export class SearchUnavailableError extends Error {
    providers;
    constructor(providers) {
        super(`X search currently unavailable: ${Object.entries(providers)
            .map(([provider, reason]) => `${provider}: ${reason}`)
            .join('; ')}`);
        this.name = 'SearchUnavailableError';
        this.providers = providers;
    }
}
export function errorSummary(error) {
    if (error instanceof ProviderError) {
        return error.status ? `HTTP ${error.status} (${error.kind})` : `${error.kind}: ${error.message}`;
    }
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=errors.js.map