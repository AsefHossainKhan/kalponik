import { describe, test, expect, beforeEach, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchPublicShelf: vi.fn(),
  sharePublicBook: vi.fn(),
  unsharePublicBook: vi.fn(),
}));
vi.mock('@/services/publicShelfClient', () => api);

import { addPublicBookToLibrary, usePublicShelfStore } from '@/store/publicShelfStore';
import { useLibraryStore } from '@/store/libraryStore';
import { bindLibraryAccount, resetLibraryAccountCache } from '@/services/libraryAccount';
import type { PublicBook } from '@/services/publicShelfClient';
import type { Book } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import type { AppService } from '@/types/system';

const ALICE = '11111111-2222-4333-8444-555555555555';
const BOB = '99999999-8888-4777-8666-555555555555';

const pub = (hash: string): PublicBook => ({
  hash,
  title: 'The Odyssey',
  author: 'Homer',
  format: 'EPUB',
  size: 1,
  metadata: null,
  sharedAt: '2026-11-14T10:00:00.000Z',
  sharedBy: 'Rafi',
  sharedByMe: false,
  canRemove: false,
  readers: 0,
  coverUrl: null,
});

const envConfig: EnvConfigType = {
  getAppService: vi.fn().mockResolvedValue({
    saveLibraryBooks: vi.fn().mockResolvedValue(undefined),
    loadLibraryBooks: vi.fn().mockResolvedValue([]),
  } as unknown as AppService),
};

beforeEach(() => {
  localStorage.clear();
  resetLibraryAccountCache();
  vi.clearAllMocks();
  usePublicShelfStore.setState({ account: null, books: [], loaded: false, isAdmin: false });
  useLibraryStore.getState().clearLibrary();
  useLibraryStore.getState().setLibrary([]);
});

describe('public shelf list', () => {
  test('is cached per account, so it still shows offline', async () => {
    bindLibraryAccount(ALICE);
    api.fetchPublicShelf.mockResolvedValueOnce({ books: [pub('p1')], isAdmin: false });
    await usePublicShelfStore.getState().refresh();
    expect(usePublicShelfStore.getState().books.map((b) => b.hash)).toEqual(['p1']);

    usePublicShelfStore.setState({ account: null, books: [], loaded: false });
    api.fetchPublicShelf.mockRejectedValueOnce(new Error('offline'));
    await expect(usePublicShelfStore.getState().refresh()).rejects.toThrow('offline');
    expect(usePublicShelfStore.getState().books.map((b) => b.hash)).toEqual(['p1']);
    expect(usePublicShelfStore.getState().loaded).toBe(true);
  });

  test("another account doesn't see the first account's cached list", async () => {
    bindLibraryAccount(ALICE);
    api.fetchPublicShelf.mockResolvedValueOnce({ books: [pub('p1')], isAdmin: true });
    await usePublicShelfStore.getState().refresh();
    bindLibraryAccount(BOB);
    usePublicShelfStore.getState().hydrate();
    expect(usePublicShelfStore.getState().books).toEqual([]);
    expect(usePublicShelfStore.getState().isAdmin).toBe(false);
  });

  test('an answer that arrives after switching account is dropped', async () => {
    bindLibraryAccount(ALICE);
    let answer!: (shelf: unknown) => void;
    api.fetchPublicShelf.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const pending = usePublicShelfStore.getState().refresh();
    bindLibraryAccount(BOB);
    answer({ books: [pub('p1')], isAdmin: false });
    await pending;
    expect(usePublicShelfStore.getState().books).toEqual([]);
  });
});

describe('opening a public book', () => {
  test('adds it to your library once, marked public and dated now', async () => {
    const stub = { hash: 'p1', title: 'The Odyssey', shelf: 'public', format: 'EPUB' } as Book;
    const added = await addPublicBookToLibrary(envConfig, stub, 5000);
    expect(added).toMatchObject({ hash: 'p1', shelf: 'public', createdAt: 5000, updatedAt: 5000 });
    expect(useLibraryStore.getState().getBookByHash('p1')).toBe(added);

    const again = await addPublicBookToLibrary(envConfig, stub, 9000);
    expect(again).toBe(added);
    expect(useLibraryStore.getState().library).toHaveLength(1);
  });

  test('a private book is left alone', async () => {
    const own = { hash: 'mine', title: 'Mine', format: 'EPUB' } as Book;
    expect(await addPublicBookToLibrary(envConfig, own)).toBe(own);
    expect(useLibraryStore.getState().library).toHaveLength(0);
  });
});
