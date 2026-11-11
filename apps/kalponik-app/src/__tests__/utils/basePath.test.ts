import { afterEach, describe, expect, it, vi } from 'vitest';

// BASE_PATH is read at import time, so each case imports a fresh module.
const load = async (basePath: string) => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_BASE_PATH', basePath);
  return import('@/utils/basePath');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('stripBasePath (Kalponik /kalponik base path)', () => {
  it('removes the base path from browser paths', async () => {
    const { stripBasePath } = await load('/kalponik');
    expect(stripBasePath('/kalponik/library')).toBe('/library');
    expect(stripBasePath('/kalponik/reader/abc')).toBe('/reader/abc');
    expect(stripBasePath('/kalponik')).toBe('/');
    expect(stripBasePath('/kalponik/')).toBe('/');
  });

  it('leaves app paths and look-alike prefixes alone', async () => {
    const { stripBasePath } = await load('/kalponik');
    expect(stripBasePath('/library')).toBe('/library');
    expect(stripBasePath('/kalponik-books/x')).toBe('/kalponik-books/x');
  });

  it('round-trips with withBasePath', async () => {
    const { stripBasePath, withBasePath } = await load('/kalponik');
    expect(stripBasePath(withBasePath('/reader?ids=1'))).toBe('/reader?ids=1');
  });

  it('is a no-op without a base path', async () => {
    const { stripBasePath } = await load('');
    expect(stripBasePath('/kalponik/library')).toBe('/kalponik/library');
  });
});
