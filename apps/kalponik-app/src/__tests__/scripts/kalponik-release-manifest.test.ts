// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  buildReleaseNotes,
  buildUpdateManifest,
  parseReleaseList,
  releaseBodyToNotes,
  versionFromTag,
} from '../../../scripts/kalponik-release-manifest.mjs';

const REPO = 'https://github.com/AsefHossainKhan/kalponik';
const apkUrl = (v: string) => `${REPO}/releases/download/kalponik-v${v}/Kalponik_${v}_arm64.apk`;

describe('versionFromTag', () => {
  it('reads X.Y.Z from kalponik-vX.Y.Z tags only', () => {
    expect(versionFromTag('kalponik-v0.12.25')).toBe('0.12.25');
    expect(versionFromTag('v0.12.25')).toBeNull();
    expect(versionFromTag('kalponik-v0.12')).toBeNull();
    expect(versionFromTag(undefined)).toBeNull();
  });
});

describe('releaseBodyToNotes', () => {
  it('turns a Markdown release body into plain notes', () => {
    const body = [
      '## What changed',
      '',
      '- Updates now come from our own releases',
      '* Fixed a crash',
      '1. Numbered item',
      '**Full Changelog**: https://github.com/x/y/compare/a...b',
    ].join('\r\n');
    expect(releaseBodyToNotes(body)).toEqual([
      'Updates now come from our own releases',
      'Fixed a crash',
      'Numbered item',
    ]);
    expect(releaseBodyToNotes(null)).toEqual([]);
  });
});

describe('buildUpdateManifest', () => {
  it("writes the latest.json shape Readest's Android updater reads", () => {
    const manifest = buildUpdateManifest({
      version: '0.12.25',
      apkUrl: apkUrl('0.12.25'),
      pubDate: '2026-11-14T10:00:00Z',
      notes: 'One\nTwo',
    });
    expect(manifest).toEqual({
      version: '0.12.25',
      notes: 'One\nTwo',
      pub_date: '2026-11-14T10:00:00Z',
      platforms: { 'android-arm64': { url: apkUrl('0.12.25') } },
    });
  });

  it('refuses a bad version or a non-https APK URL', () => {
    expect(() => buildUpdateManifest({ version: '0.12', apkUrl: apkUrl('1.0.0') })).toThrow();
    expect(() => buildUpdateManifest({ version: '1.0.0', apkUrl: 'http://x/a.apk' })).toThrow();
  });
});

describe('buildReleaseNotes', () => {
  it('keeps published kalponik-v releases, newest first, with their dates', () => {
    const notes = buildReleaseNotes([
      { tag_name: 'kalponik-v0.12.21', published_at: '2026-11-11T08:00:00Z', body: '- First' },
      { tag_name: 'kalponik-v0.12.24', published_at: '2026-11-13T08:00:00Z', body: '- Latest' },
      { tag_name: 'kalponik-v0.12.30', draft: true, body: '- Draft' },
      { tag_name: 'kalponik-v0.12.29', prerelease: true, body: '- Pre' },
      { tag_name: 'v9.9.9', published_at: '2026-01-01T00:00:00Z', body: '- Other' },
    ]);
    expect(Object.keys(notes.releases)).toEqual(['0.12.24', '0.12.21']);
    expect(notes.releases['0.12.24']).toEqual({ date: '2026-11-13', notes: ['Latest'] });
  });
});

describe('parseReleaseList', () => {
  it('reads a JSON array or one object per line', () => {
    expect(parseReleaseList('[{"tag_name":"a"}]')).toEqual([{ tag_name: 'a' }]);
    expect(parseReleaseList('{"tag_name":"a"}\n{"tag_name":"b"}\n')).toEqual([
      { tag_name: 'a' },
      { tag_name: 'b' },
    ]);
    expect(parseReleaseList('  ')).toEqual([]);
  });
});

describe('CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kalponik-manifest-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('writes latest.json and release-notes.json', () => {
    const releasesFile = join(dir, 'releases.ndjson');
    writeFileSync(
      releasesFile,
      [
        JSON.stringify({
          tag_name: 'kalponik-v0.12.25',
          published_at: '2026-11-14T09:00:00Z',
          body: '- In-app updates',
        }),
        JSON.stringify({ tag_name: 'kalponik-v0.12.24', published_at: '2026-11-13T09:00:00Z' }),
      ].join('\n'),
    );
    const outDir = join(dir, 'out');
    const script = join(__dirname, '../../../scripts/kalponik-release-manifest.mjs');
    execFileSync(process.execPath, [
      script,
      '--version',
      '0.12.25',
      '--apk-url',
      apkUrl('0.12.25'),
      '--releases',
      releasesFile,
      '--out-dir',
      outDir,
      '--pub-date',
      '2026-11-14T09:30:00Z',
    ]);
    const latest = JSON.parse(readFileSync(join(outDir, 'latest.json'), 'utf8'));
    expect(latest).toEqual({
      version: '0.12.25',
      notes: 'In-app updates',
      pub_date: '2026-11-14T09:30:00Z',
      platforms: { 'android-arm64': { url: apkUrl('0.12.25') } },
    });
    const notes = JSON.parse(readFileSync(join(outDir, 'release-notes.json'), 'utf8'));
    expect(Object.keys(notes.releases)).toEqual(['0.12.25', '0.12.24']);
  });
});
