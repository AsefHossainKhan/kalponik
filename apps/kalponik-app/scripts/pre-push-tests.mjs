#!/usr/bin/env node
// Runs the unit tests that match the files being pushed, so a push stays
// well under 30 seconds. Called by .husky/pre-push, which passes git's
// pre-push stdin through ("<local ref> <local sha> <remote ref> <remote sha>"
// per line).
//
// Why not `vitest related`: it walks the import graph of every test file
// first (about 23 s on its own), and a change to a widely imported file pulls
// in most of the suite (src/utils/misc.ts: 785 files, 7.7 min). So tests are
// picked by name instead:
//   1. test files changed in the push;
//   2. tests named after a changed source file (signInGate.ts matches
//      sign-in-gate.test.ts and signInGate-offline.test.ts); generic names
//      such as index.ts or route.ts use their folder's name instead.
// At most MAX_FILES test files run, changed test files first. Anything a
// change breaks indirectly is caught by the full suite: `pnpm test` from
// apps/kalponik-app, or `KALPONIK_FULL_TESTS=1 git push`.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MAX_FILES = 20;
const APP = 'apps/kalponik-app/';
const ZERO = /^0+$/;
const GENERIC = new Set(['index', 'route', 'page', 'layout', 'types', 'utils', 'constants', 'helpers']);
const TEST_RE = /\.test\.tsx?$/;
// Same lanes vitest.config.mts leaves out of the unit run.
const OTHER_LANE = /(\/e2e\/|\.(browser|tauri|android)\.test\.tsx?$)/;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const norm = (s) => s.toLowerCase().replace(/[-_.]/g, '');
const fullSuite = process.env.KALPONIK_FULL_TESTS === '1';

const repoRoot = git('rev-parse', '--show-toplevel');
const appDir = path.join(repoRoot, APP);

function runVitest(files) {
  const args = ['exec', 'dotenv', '-e', '.env', '-e', '.env.test.local', '--', 'vitest', '--run'];
  if (files) args.push('--passWithNoTests', ...files);
  const r = spawnSync('pnpm', args, { cwd: appDir, stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(r.status ?? 1);
}

if (fullSuite) {
  console.log('pre-push: KALPONIK_FULL_TESTS=1, running the full suite.');
  runVitest(null);
}

// Files changed by the push.
let stdin = '';
try {
  stdin = readFileSync(0, 'utf8');
} catch {}
const changed = new Set();
for (const line of stdin.split('\n')) {
  const [, localSha, , remoteSha] = line.trim().split(/\s+/);
  if (!localSha || ZERO.test(localSha)) continue; // deleting a ref
  let base = remoteSha;
  if (!base || ZERO.test(base)) {
    // New branch on the remote: compare with origin/main.
    try {
      base = git('merge-base', localSha, 'origin/main');
    } catch {
      continue;
    }
  }
  try {
    git('cat-file', '-e', `${base}^{commit}`);
  } catch {
    // Remote commit not here (someone else pushed): compare with the merge base.
    try {
      base = git('merge-base', localSha, 'origin/main');
    } catch {
      continue;
    }
  }
  const out = git('diff', '--name-only', '--diff-filter=ACMR', `${base}..${localSha}`);
  for (const f of out.split('\n')) if (f) changed.add(f);
}

const appChanged = [...changed].filter((f) => f.startsWith(APP)).map((f) => f.slice(APP.length));
const allTests = git('-C', appDir, 'ls-files', 'src')
  .split('\n')
  .filter((f) => TEST_RE.test(f) && !OTHER_LANE.test(f));

const picked = [];
const add = (f) => {
  if (!picked.includes(f)) picked.push(f);
};

// 1. Changed test files.
for (const f of appChanged) if (TEST_RE.test(f) && allTests.includes(f)) add(f);

// 2. Tests named after changed source files.
const testStems = allTests.map((f) => [f, norm(path.basename(f).replace(TEST_RE, ''))]);
const sources = appChanged.filter((f) => /^src\/.*\.(tsx?|jsx?)$/.test(f) && !TEST_RE.test(f) && !f.endsWith('.d.ts'));
for (const f of sources) {
  let stem = path.basename(f).replace(/\.[jt]sx?$/, '');
  if (GENERIC.has(stem)) stem = path.basename(path.dirname(f));
  const key = norm(stem);
  if (key.length < 3) continue;
  for (const [t, ts] of testStems) if (ts === key || ts.startsWith(key)) add(t);
}

const configChanged = appChanged.some((f) =>
  /^(package\.json|vitest\.(config\.mts|setup\.ts)|tsconfig\.json|\.env(\.test)?)$/.test(f),
);

if (picked.length === 0) {
  console.log('pre-push: no matching unit tests for this push.');
} else {
  const run = picked.slice(0, MAX_FILES);
  console.log(`pre-push: running ${run.length} matching test file(s).`);
  if (picked.length > MAX_FILES) {
    console.log(`pre-push: ${picked.length - MAX_FILES} more matched but were skipped to keep the push fast:`);
    for (const f of picked.slice(MAX_FILES)) console.log(`  ${f}`);
  }
}
if (configChanged) {
  console.log('pre-push: test config or dependencies changed; run the full suite (pnpm test) before a release.');
}
if (picked.length === 0) process.exit(0);
runVitest(picked.slice(0, MAX_FILES));
