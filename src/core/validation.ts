export const MAX_COUNT = 100;
export const MAX_TRENDS_COUNT = 50;

export function cleanHandle(handle: unknown): string {
  const value = String(handle ?? '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,30}$/.test(value)) {
    throw new ProviderErrorForInput('handle must be a valid public X/Twitter handle without spaces');
  }
  return value;
}

export function cleanStatusId(id: unknown): string {
  const value = String(id ?? '').trim();
  if (!/^[0-9]{2,20}$/.test(value)) {
    throw new ProviderErrorForInput('id must be a numeric X/Twitter status id');
  }
  return value;
}

export function cleanQuery(query: unknown, maxLength = 500): string {
  const value = String(query ?? '').trim();
  if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ProviderErrorForInput(`query must contain 1-${maxLength} printable characters`);
  }
  return value;
}

export function cleanLang(lang: string | undefined): string | undefined {
  if (lang === undefined) return undefined;
  const value = lang.trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(value)) {
    throw new ProviderErrorForInput('lang must be a language code such as en, es, or zh-cn');
  }
  return value;
}

export function cleanLimit(value: unknown, fallback = 10, max = MAX_COUNT): number {
  if (value === undefined || value === null || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new ProviderErrorForInput(`limit must be an integer between 1 and ${max}`);
  }
  return number;
}

export function optionalParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value) params.set(key, value);
}

class ProviderErrorForInput extends Error {
  readonly kind = 'invalid_request';

  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

export function isInputError(error: unknown): error is Error & { kind: 'invalid_request' } {
  return error instanceof Error && 'kind' in error && error.kind === 'invalid_request';
}
