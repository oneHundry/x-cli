export type ProviderErrorKind =
  | 'invalid_request'
  | 'not_found'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'upstream_http_error'
  | 'timeout'
  | 'network_failure'
  | 'invalid_json_or_response'
  | 'unsupported';

export class ProviderError extends Error {
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
  }) {
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
  readonly providers: Record<string, string>;

  constructor(providers: Record<string, string>) {
    super(
      `X search currently unavailable: ${Object.entries(providers)
        .map(([provider, reason]) => `${provider}: ${reason}`)
        .join('; ')}`
    );
    this.name = 'SearchUnavailableError';
    this.providers = providers;
  }
}

export function errorSummary(error: unknown): string {
  if (error instanceof ProviderError) {
    return error.status ? `HTTP ${error.status} (${error.kind})` : `${error.kind}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
