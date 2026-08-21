import { spawn } from 'node:child_process';
import type { FetchLike } from '../core/types.js';

const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$headers = @{
  'User-Agent' = 'Mozilla/5.0 (compatible; Miniflux/2.1.3; +https://miniflux.app)'
  'Accept' = 'application/rss+xml, application/xml;q=0.9, */*;q=0.8'
}
$response = Invoke-WebRequest -Uri $env:X_CLI_FETCH_URL -Headers $headers -Method Get -TimeoutSec 30 -SkipHttpErrorCheck
$meta = [pscustomobject]@{
  status = [int]$response.StatusCode
  contentType = [string]$response.Headers.'Content-Type'
}
[Console]::Out.WriteLine(($meta | ConvertTo-Json -Compress))
$bytes = [Text.Encoding]::UTF8.GetBytes([string]$response.Content)
[Console]::Out.Write([Convert]::ToBase64String($bytes))
`;

const ENCODED_SCRIPT = Buffer.from(SCRIPT, 'utf16le').toString('base64');

function requestWithPowerShell(url: string, signal?: AbortSignal | null): Promise<Response> {
  return new Promise((resolve, reject) => {
    const child = spawn('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', ENCODED_SCRIPT], {
      windowsHide: true,
      env: { ...process.env, X_CLI_FETCH_URL: url },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', reject);
    child.once('close', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `pwsh exited with code ${code}`));
        return;
      }
      try {
        const output = Buffer.concat(stdout).toString('utf8');
        const newline = output.indexOf('\n');
        if (newline < 0) throw new Error('PowerShell HTTP adapter returned no metadata');
        const meta = JSON.parse(output.slice(0, newline).trim()) as { status: number; contentType?: string };
        const body = Buffer.from(output.slice(newline).trim(), 'base64');
        resolve(new Response(body, {
          status: meta.status,
          headers: meta.contentType ? { 'Content-Type': meta.contentType } : undefined
        }));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function windowsCompatibleFetch(fallback: FetchLike = fetch): FetchLike {
  if (process.platform !== 'win32' || process.env.X_CLI_NITTER_HTTP === 'fetch') return fallback;
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    try {
      return await requestWithPowerShell(url, init?.signal);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return fallback(input, init);
      throw error;
    }
  };
}
