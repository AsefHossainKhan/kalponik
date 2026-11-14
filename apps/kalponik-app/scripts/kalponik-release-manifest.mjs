#!/usr/bin/env node
// Writes the two files the Android in-app updater reads from Kalponik's
// GitHub releases (see KALPONIK_UPDATER_FILE / KALPONIK_CHANGELOG_FILE in
// src/services/constants.ts):
//
//   latest.json         { version, notes, pub_date, platforms: { 'android-arm64': { url } } }
//   release-notes.json  { releases: { 'X.Y.Z': { date, notes: [...] } } }
//
// Both use the format Readest's updater already reads. The release workflow
// (.github/workflows/kalponik-android.yml) runs this after the APK is attached
// and uploads both files to the release, so
// https://github.com/<repo>/releases/latest/download/latest.json always
// describes the newest release.
//
// Usage:
//   node scripts/kalponik-release-manifest.mjs --version 0.12.25 \
//     --apk-url https://github.com/<repo>/releases/download/kalponik-v0.12.25/Kalponik_0.12.25_arm64.apk \
//     --releases releases.ndjson --out-dir out [--pub-date 2026-11-14T00:00:00Z]
//
// `--releases` is the GitHub releases list, as a JSON array or one JSON object
// per line (what `gh api --paginate .../releases --jq '.[]'` prints).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAG_PREFIX = 'kalponik-v';
export const ANDROID_PLATFORM_KEY = 'android-arm64';
const VERSION_RE = /^\d+\.\d+\.\d+$/;

export const versionFromTag = (tag) => {
  if (typeof tag !== 'string' || !tag.startsWith(TAG_PREFIX)) return null;
  const version = tag.slice(TAG_PREFIX.length);
  return VERSION_RE.test(version) ? version : null;
};

const compareVersions = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
};

// A release body (Markdown) as a list of short notes: one per non-empty line,
// without list markers or headings, and without GitHub's "Full Changelog" link.
export const releaseBodyToNotes = (body) => {
  if (!body) return [];
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !/^\*\*Full Changelog\*\*/i.test(line))
    .map((line) => line.replace(/^(?:[-*+]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
};

export const parseReleaseList = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed);
  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
};

export const buildReleaseNotes = (releases) => {
  const entries = releases
    .filter((r) => r && !r.draft && !r.prerelease)
    .map((r) => ({ version: versionFromTag(r.tag_name), release: r }))
    .filter((e) => e.version)
    .sort((a, b) => compareVersions(b.version, a.version));
  /** @type {Record<string, { date: string, notes: string[] }>} */
  const out = {};
  for (const { version, release } of entries) {
    if (out[version]) continue;
    out[version] = {
      date: (release.published_at || release.created_at || '').slice(0, 10),
      notes: releaseBodyToNotes(release.body),
    };
  }
  return { releases: out };
};

const nowRfc3339 = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export const buildUpdateManifest = ({ version, apkUrl, pubDate = nowRfc3339(), notes = '' }) => {
  if (!VERSION_RE.test(version || '')) throw new Error(`Bad version: ${version}`);
  if (!/^https:\/\//.test(apkUrl || '')) throw new Error(`Bad APK URL: ${apkUrl}`);
  return {
    version,
    notes,
    pub_date: pubDate,
    platforms: {
      [ANDROID_PLATFORM_KEY]: { url: apkUrl },
    },
  };
};

const parseArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const { version, 'apk-url': apkUrl, releases: releasesFile, 'out-dir': outDir } = args;
  if (!version || !apkUrl || !releasesFile || !outDir) {
    throw new Error('Needs --version, --apk-url, --releases and --out-dir');
  }
  const releases = parseReleaseList(readFileSync(releasesFile, 'utf8'));
  const releaseNotes = buildReleaseNotes(releases);
  const current = releases.find((r) => versionFromTag(r?.tag_name) === version);
  const manifest = buildUpdateManifest({
    version,
    apkUrl,
    pubDate: args['pub-date'] || nowRfc3339(),
    notes: releaseBodyToNotes(current?.body).join('\n'),
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(outDir, 'release-notes.json'), JSON.stringify(releaseNotes, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
