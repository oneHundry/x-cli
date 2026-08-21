import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const configHome = resolve('.wrangler-config');
mkdirSync(configHome, { recursive: true });

const executable = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
const result = spawnSync(executable, ['types', 'worker-configuration.d.ts', '--config', 'wrangler.example.jsonc'], {
  env: { ...process.env, XDG_CONFIG_HOME: configHome },
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

process.exit(result.status ?? 1);
