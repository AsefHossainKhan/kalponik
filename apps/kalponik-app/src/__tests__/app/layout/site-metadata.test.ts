// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ViewTransitions', () => ({ ViewTransitions: () => null }));
vi.mock('@/context/EnvContext', () => ({ EnvProvider: () => null }));
vi.mock('@/components/Providers', () => ({ default: () => null }));
vi.mock('../../../styles/globals.css', () => ({}));

import { metadata } from '@/app/layout';

/**
 * Link previews and the page's site metadata must point at Kalponik, not at
 * Readest's hosts (web.readest.com, cdn.readest.com).
 */
describe('root layout metadata', () => {
  it('never points at a readest.com host', () => {
    expect(JSON.stringify(metadata)).not.toMatch(/readest\.com/);
  });

  it("serves the preview image from Kalponik's own public folder", () => {
    expect(metadata.openGraph?.images).toEqual(['/images/og-preview.png']);
    expect(metadata.twitter?.images).toEqual(['/images/og-preview.png']);
    expect(String(metadata.metadataBase)).toBe('https://asroy.duckdns.org/');
  });
});

describe('root layout metadata under the /kalponik base path', () => {
  // Next.js joins a relative image path onto metadataBase's path, which
  // already ends in /kalponik/. A base-path-prefixed image path would give
  // /kalponik/kalponik/images/og-preview.png, a 404 (seen live 2026-11-14).
  it('adds the base path once, through metadataBase only', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/kalponik');
    const { metadata: prefixed } = await import('@/app/layout');
    vi.unstubAllEnvs();

    expect(String(prefixed.metadataBase)).toBe('https://asroy.duckdns.org/kalponik/');
    expect(prefixed.openGraph?.images).toEqual(['/images/og-preview.png']);
    expect(prefixed.twitter?.images).toEqual(['/images/og-preview.png']);
  });
});
