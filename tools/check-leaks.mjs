#!/usr/bin/env node
/**
 * Blocks secrets and identifying terms from entering the repository.
 *
 *   node tools/check-leaks.mjs --staged          staged files (pre-commit hook)
 *   node tools/check-leaks.mjs --all             every tracked and untracked, non-ignored file
 *   node tools/check-leaks.mjs --message <file>  a commit message (commit-msg hook)
 *
 * Built-in rules catch private keys and hard-coded keys, tokens and passwords.
 * A private config outside the repository adds blocked terms (player names,
 * IDs) and files whose secret values must never appear. Its path comes from
 * LEAKCHECK_CONFIG, else `git config leakcheck.config`, else
 * ../warera-private/leak-check.json next to the repository:
 *
 *   { "terms": ["..."], "secretFiles": [{ "file": "../x/config.json", "field": "apiKey" }] }
 *
 * Paths in it are relative to the config file. Findings name the file, line
 * and rule, never the matched secret.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const root = git('rev-parse', '--show-toplevel').trim();

const RULES = [
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'hard-coded key, token or password', re: /\b(?:api[_-]?key|secret|token|password|passwd|x-api-key)\b["']?\s*[:=]\s*["'`][^"'`\s]{12,}["'`]/i },
  { name: 'bearer token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/ },
];

function loadPrivateConfig() {
  let file = process.env.LEAKCHECK_CONFIG;
  if (!file) {
    try { file = git('config', '--get', 'leakcheck.config').trim(); } catch {}
  }
  file ||= path.join(root, '..', 'warera-private', 'leak-check.json');
  if (!fs.existsSync(file)) return { found: false, terms: [], secrets: [] };
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const secrets = [];
  for (const { file: secretFile, field } of config.secretFiles ?? []) {
    try {
      const value = JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), secretFile), 'utf8'))[field];
      if (typeof value === 'string' && value.length >= 8) secrets.push({ name: `secret from ${path.basename(secretFile)}`, value });
    } catch {}
  }
  const terms = (config.terms ?? []).filter(Boolean).map((term) => ({
    name: 'blocked term',
    // Whole words for names, so "skane" doesn't match inside unrelated words.
    re: new RegExp(`(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'i'),
  }));
  return { found: true, terms, secrets };
}

function filesToCheck(mode) {
  if (mode === '--staged') {
    return git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean)
      .map((name) => ({ name, read: () => execFileSync('git', ['show', `:${name}`], { maxBuffer: 64 * 1024 * 1024 }) }));
  }
  if (mode === '--all') {
    return git('ls-files', '-co', '--exclude-standard', '-z').split('\0').filter(Boolean)
      .map((name) => ({ name, read: () => fs.readFileSync(path.join(root, name)) }));
  }
  if (mode === '--message') {
    const file = process.argv[3];
    return [{ name: 'commit message', read: () => fs.readFileSync(file) }];
  }
  console.error('Usage: check-leaks.mjs --staged | --all | --message <file>');
  process.exit(2);
}

const mode = process.argv[2];
const { found, terms, secrets } = loadPrivateConfig();
const findings = [];
for (const { name, read } of filesToCheck(mode)) {
  // The checker itself names its rules; skip it.
  if (name === 'tools/check-leaks.mjs') continue;
  const buffer = read();
  if (buffer.includes(0)) continue;
  const lines = buffer.toString('utf8').split(/\r?\n/);
  if (mode === '--message') {
    // Comment lines from git's template aren't part of the message.
    for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('#')) lines[i] = '';
  }
  lines.forEach((line, i) => {
    for (const rule of [...RULES, ...terms]) if (rule.re.test(line)) findings.push(`${name}:${i + 1}  ${rule.name}`);
    for (const secret of secrets) if (line.includes(secret.value)) findings.push(`${name}:${i + 1}  ${secret.name}`);
  });
}

if (!found) console.warn('leak check: no private term list found, so only built-in rules ran (see tools/check-leaks.mjs).');
if (findings.length) {
  console.error(`leak check: ${findings.length} finding(s), nothing committed:\n  ${findings.join('\n  ')}`);
  process.exit(1);
}
console.log('leak check: clean');
