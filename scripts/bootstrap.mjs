#!/usr/bin/env node
// Creates .env from .env.example (or fills in missing keys), generates secrets,
// and optionally asks for the PostgreSQL password. Safe to run repeatedly.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { parseEnv } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const examplePath = resolve(root, '.env.example');
const envPath = resolve(root, '.env');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

const generators = {
  COOKIE_SECRET: () => randomBytes(48).toString('base64url'),
  APP_ENCRYPTION_KEY: () => randomBytes(32).toString('base64'),
};

function setValue(text, key, value) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  return line.test(text) ? text.replace(line, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}

async function askHidden(question) {
  if (!stdin.isTTY) return '';
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  let value = '';
  return new Promise((done) => {
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stdout.write('\n');
        done(value);
      } else if (ch === '\u0003') {
        stdout.write('\n');
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const example = readFileSync(examplePath, 'utf8');
const created = !existsSync(envPath);
let text = created ? example : readFileSync(envPath, 'utf8');

// Add any keys that exist in the example but not yet in .env (e.g. after pulling new code).
const current = parseEnv(text);
const added = [];
for (const [key, value] of Object.entries(parseEnv(example))) {
  if (!(key in current)) {
    text = `${text.trimEnd()}\n${key}=${value}\n`;
    added.push(key);
  }
}

const generated = [];
for (const [key, make] of Object.entries(generators)) {
  if (!parseEnv(text)[key]) {
    text = setValue(text, key, make());
    generated.push(key);
  }
}

const dbUrl = parseEnv(text).DATABASE_URL ?? '';
if (dbUrl.includes('CHANGE_ME')) {
  const password = await askHidden(
    `PostgreSQL password for the ${bold('stockroom')} role (Enter to skip and edit .env later): `,
  );
  if (password) {
    const encoded = encodeURIComponent(password);
    for (const key of ['DATABASE_URL', 'TEST_DATABASE_URL']) {
      const url = parseEnv(text)[key];
      if (url) text = setValue(text, key, url.replace('CHANGE_ME', encoded));
    }
  }
}

writeFileSync(envPath, text.endsWith('\n') ? text : `${text}\n`);

console.log(green(created ? '✔ Created .env from .env.example' : '✔ .env already exists; kept your values'));
if (added.length) console.log(green(`✔ Added new keys: ${added.join(', ')}`));
if (generated.length) console.log(green(`✔ Generated: ${generated.join(', ')}`));
if ((parseEnv(text).DATABASE_URL ?? '').includes('CHANGE_ME')) {
  console.log(yellow('! DATABASE_URL still contains CHANGE_ME. Put the stockroom password into .env.'));
}
console.log(`\nNext: ${bold('pnpm preflight')} → ${bold('pnpm db:setup')} → ${bold('pnpm dev')}`);
