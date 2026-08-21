#!/usr/bin/env node
import { ProviderError, SearchUnavailableError } from './core/errors.js';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { MAX_TRENDS_COUNT, cleanLimit } from './core/validation.js';
import { FxTwitterProvider } from './providers/fxtwitter.js';
import { NitterProvider, parseNitterInstances } from './providers/nitter.js';
import { XService, normalizeFxPost, normalizeFxResults } from './services/x.js';
import { windowsCompatibleFetch } from './cli/windows-fetch.js';
const HELP = `x — public, read-only X/Twitter CLI

Usage:
  x search <query> [--limit N] [--feed latest|top] [--lang CODE] [--provider auto|fxtwitter|nitter] [--json]
  x profile <handle> [--json]
  x timeline <handle> [--limit N] [--json]
  x media <handle> [--limit N] [--json]
  x post <post-id> [--json]
  x trends [--limit N] [--json]
  x typeahead <query> [--limit N] [--json]
  x openapi [--json]

Search uses FxTwitter first and falls back to a freshness-gated Nitter instance pool.
No login, Cookie, API key, OAuth token, or write operation is supported.`;
if (process.env.http_proxy || process.env.https_proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
    setGlobalDispatcher(new EnvHttpProxyAgent());
}
function parseArgs(argv) {
    const result = { command: argv.shift(), positionals: [], options: {} };
    const valueOptions = new Set(['limit', 'feed', 'lang', 'provider']);
    while (argv.length) {
        const token = argv.shift();
        if (!token.startsWith('--')) {
            result.positionals.push(token);
            continue;
        }
        const [rawName, inlineValue] = token.slice(2).split('=', 2);
        if (rawName === 'json' || rawName === 'help') {
            result.options[rawName] = true;
            continue;
        }
        if (!valueOptions.has(rawName))
            throw new Error(`unknown option --${rawName}`);
        const value = inlineValue ?? argv.shift();
        if (!value || value.startsWith('--'))
            throw new Error(`--${rawName} requires a value`);
        result.options[rawName] = value;
    }
    return result;
}
function optionString(args, name) {
    const value = args.options[name];
    return typeof value === 'string' ? value : undefined;
}
function optionLimit(args, fallback = 10, max = 100) {
    return cleanLimit(optionString(args, 'limit'), fallback, max);
}
function requireText(args, label, join = false) {
    const value = join ? args.positionals.join(' ') : args.positionals[0];
    if (!value)
        throw new Error(`${label} is required`);
    if (!join && args.positionals.length > 1)
        throw new Error(`unexpected argument: ${args.positionals.slice(1).join(' ')}`);
    return value;
}
function numberFromEnv(name, fallback) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
function createService() {
    return new XService(new FxTwitterProvider({
        baseUrl: process.env.FXTWITTER_BASE_URL,
        timeoutMs: numberFromEnv('FXTWITTER_TIMEOUT_MS', 12_000)
    }), new NitterProvider({
        instances: parseNitterInstances(process.env.NITTER_INSTANCES),
        fetch: windowsCompatibleFetch(),
        timeoutMs: numberFromEnv('NITTER_TIMEOUT_MS', 8_000),
        totalTimeoutMs: numberFromEnv('NITTER_TOTAL_TIMEOUT_MS', 20_000),
        maxCanaryAgeMinutes: numberFromEnv('NITTER_MAX_CANARY_AGE_MIN', 180),
        maxCanaryLagMinutes: numberFromEnv('NITTER_MAX_CANARY_LAG_MIN', 90)
    }));
}
function printPost(post) {
    console.log(`${post.author} (@${post.handle}) · ${post.created_at || 'unknown time'}`);
    console.log(post.text);
    console.log(post.url);
    const metrics = Object.entries(post.metrics)
        .filter(([, value]) => value !== null)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
    if (metrics)
        console.log(metrics);
    console.log('');
}
function printHuman(command, output) {
    if (command === 'search' || command === 'timeline' || command === 'media') {
        console.log(`provider: ${output.provider}${output.fallback_used ? ' (fallback)' : ''}`);
        if (output.freshness)
            console.log(`freshness: ${JSON.stringify(output.freshness)}`);
        for (const post of (output.results || []))
            printPost(post);
        return;
    }
    if (command === 'post' && output.post) {
        printPost(output.post);
        return;
    }
    if (command === 'trends') {
        for (const trend of (output.trends || []))
            console.log(`- ${trend.name || JSON.stringify(trend)}`);
        return;
    }
    console.log(JSON.stringify(output, null, 2));
}
async function execute(args) {
    const service = createService();
    const command = args.command;
    if (command === 'search') {
        const feed = optionString(args, 'feed') ?? 'latest';
        if (!['latest', 'top'].includes(feed))
            throw new Error('feed must be latest or top');
        const provider = optionString(args, 'provider') ?? 'auto';
        if (!['auto', 'fxtwitter', 'nitter'].includes(provider))
            throw new Error('provider must be auto, fxtwitter, or nitter');
        return (await service.searchPosts({
            query: requireText(args, 'query', true),
            limit: optionLimit(args),
            feed: feed,
            lang: optionString(args, 'lang'),
            provider: provider
        })).output;
    }
    if (command === 'profile') {
        const raw = await service.getProfile(requireText(args, 'handle'));
        return { ok: true, platform: 'x', provider: 'fxtwitter', data: raw.data };
    }
    if (command === 'timeline' || command === 'media') {
        const limit = optionLimit(args);
        const handle = requireText(args, 'handle');
        const raw = command === 'timeline'
            ? await service.getProfileStatuses({ handle, limit })
            : await service.getProfileMedia({ handle, limit });
        const results = normalizeFxResults(raw.data);
        return { ok: true, platform: 'x', provider: 'fxtwitter', count: results.length, results, cursor: raw.data.cursor ?? null };
    }
    if (command === 'post') {
        const raw = await service.getPost(requireText(args, 'post id'));
        return { ok: true, platform: 'x', provider: 'fxtwitter', post: normalizeFxPost(raw.data.status), data: raw.data };
    }
    if (command === 'trends') {
        if (args.positionals.length)
            throw new Error(`unexpected argument: ${args.positionals.join(' ')}`);
        const raw = await service.getTrends(optionLimit(args, 10, MAX_TRENDS_COUNT));
        const trends = Array.isArray(raw.data.trends) ? raw.data.trends : [];
        return { ok: true, platform: 'x', provider: 'fxtwitter', count: trends.length, trends, cursor: raw.data.cursor ?? null };
    }
    if (command === 'typeahead') {
        const raw = await service.typeahead(requireText(args, 'query', true), optionLimit(args));
        return { ok: true, platform: 'x', provider: 'fxtwitter', data: raw.data };
    }
    if (command === 'openapi') {
        if (args.positionals.length)
            throw new Error(`unexpected argument: ${args.positionals.join(' ')}`);
        const raw = await service.getOpenApi();
        return { ok: true, platform: 'x', provider: 'fxtwitter', data: raw.data };
    }
    throw new Error(`unknown command: ${command}`);
}
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.command || args.command === 'help' || args.command === '--help' || args.options.help) {
        console.log(HELP);
        return;
    }
    const json = args.options.json === true;
    try {
        const output = await execute(args);
        if (json)
            console.log(JSON.stringify(output, null, 2));
        else
            printHuman(args.command, output);
    }
    catch (error) {
        const payload = error instanceof SearchUnavailableError
            ? { ok: false, error: 'x_search_unavailable', message: error.message, providers: error.providers }
            : error instanceof ProviderError
                ? { ok: false, error: error.kind, provider: error.provider, status: error.status ?? null, message: error.message, details: error.details ?? null }
                : { ok: false, error: 'invalid_cli_arguments_or_runtime_error', message: error instanceof Error ? error.message : String(error) };
        if (json)
            console.log(JSON.stringify(payload, null, 2));
        else
            console.error(payload.message);
        process.exitCode = 1;
    }
}
await main();
//# sourceMappingURL=cli.js.map