export declare const MAX_COUNT = 100;
export declare const MAX_TRENDS_COUNT = 50;
export declare function cleanHandle(handle: unknown): string;
export declare function cleanStatusId(id: unknown): string;
export declare function cleanQuery(query: unknown, maxLength?: number): string;
export declare function cleanLang(lang: string | undefined): string | undefined;
export declare function cleanLimit(value: unknown, fallback?: number, max?: number): number;
export declare function optionalParam(params: URLSearchParams, key: string, value: string | undefined): void;
export declare function isInputError(error: unknown): error is Error & {
    kind: 'invalid_request';
};
