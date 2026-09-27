#!/usr/bin/env node
// Checks that everything Stockroom needs is installed and reachable, with fixes for each problem.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const ok = (s) => console.log(`\x1b[32m  ✔\x1b[0m ${s}`);
const warn = (s) => console.log(`\x1b[33m  !\x1b[0m ${s}`);
const fail = (s) => console.log(`\x1b[31m  ✖\x1b[0m ${s}`);
const hint = (s) => console.log(`      ${s}`);
let failures = 0;

console.log('\nStockroom preflight\n');

// Node.js
const [major] = process.versions.node.split('.').map(Number);
if (major >= 24) ok(`Node.js ${process.versions.node}`);
else {
  failures++;
  fail(`Node.js ${process.versions.node} — version 24 LTS or newer is required`);
  hint('Install it from https://nodejs.org or run: winget install OpenJS.NodeJS.LTS');
}

// pnpm
try {
  ok(`pnpm ${execSync('pnpm --version', { encoding: 'utf8' }).trim()}`);
} catch {
  failures++;
  fail('pnpm is not installed');
  hint('Run: npm install -g pnpm');
}

// .env
const envPath = resolve(root, '.env');
if (!existsSync(envPath)) {
  failures++;
  fail('.env is missing');
  hint('Run: pnpm bootstrap');
} else {
  process.loadEnvFile(envPath);
  ok('.env found');
}

// PostgreSQL
const dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  let url;
  try {
    url = new URL(dbUrl);
  } catch {
    failures++;
    fail('DATABASE_URL is not a valid URL');
  }
  if (url) {
    const host = url.hostname;
    const port = Number(url.port || 5432);
    const reachable = await new Promise((done) => {
      const socket = connect({ host, port, timeout: 3000 });
      socket.once('connect', () => (socket.destroy(), done(true)));
      socket.once('error', () => done(false));
      socket.once('timeout', () => (socket.destroy(), done(false)));
    });
    if (!reachable) {
      failures++;
      fail(`PostgreSQL is not reachable at ${host}:${port}`);
      hint('Is the service running? PowerShell (admin): Start-Service postgresql-x64-18');
    } else if (dbUrl.includes('CHANGE_ME')) {
      failures++;
      warn(`PostgreSQL is listening on ${host}:${port}, but DATABASE_URL still contains CHANGE_ME`);
      hint('Put the stockroom password into .env (or run pnpm bootstrap again).');
    } else {
      // Use the server package's pg driver if dependencies are installed.
      try {
        const require = createRequire(resolve(root, 'apps/server/package.json'));
        const { Client } = require('pg');
        const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 4000 });
        await client.connect();
        const { rows } = await client.query('select version()');
        await client.end();
        ok(
          `PostgreSQL ${String(rows[0].version).split(' ')[1]} at ${host}:${port} (database "${url.pathname.slice(1)}")`,
        );
      } catch (error) {
        if (error?.code === 'MODULE_NOT_FOUND') {
          ok(`PostgreSQL is listening on ${host}:${port} (run pnpm install to test the login)`);
        } else {
          failures++;
          fail(`PostgreSQL login failed: ${error.message}`);
          if (error.code === '28P01') hint('Wrong password for the role in DATABASE_URL.');
          if (error.code === '3D000')
            hint(`Create it: CREATE DATABASE ${url.pathname.slice(1)} OWNER ${url.username};`);
        }
      }
    }
  }
}

// Ollama (optional)
const ollama = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
try {
  const version = await fetch(`${ollama}/api/version`, { signal: AbortSignal.timeout(3000) }).then((r) =>
    r.json(),
  );
  const tags = await fetch(`${ollama}/api/tags`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json());
  const names = (tags.models ?? []).map((m) => m.name);
  ok(
    `Ollama ${version.version} at ${ollama} — ${names.length} model(s)${names.length ? `: ${names.join(', ')}` : ''}`,
  );
  if (!names.length) hint('Pull a model with tool support, e.g.: ollama pull qwen3:8b');
} catch {
  warn(`Ollama is not running at ${ollama} (optional — cloud providers or rule-based mode still work)`);
  hint('Start the Ollama app, then: ollama pull qwen3:8b');
}

console.log(failures ? `\n${failures} problem(s) to fix.\n` : '\nAll set.\n');
process.exit(failures ? 1 : 0);
