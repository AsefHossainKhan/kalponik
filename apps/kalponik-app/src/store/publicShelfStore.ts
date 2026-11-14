import { create } from 'zustand';
import type { Book } from '@/types/book';
import type { EnvConfigType } from '@/services/environment';
import { useLibraryStore } from '@/store/libraryStore';
import { getLibraryAccount } from '@/services/libraryAccount';
import {
  fetchPublicShelf,
  sharePublicBook,
  unsharePublicBook,
  type PublicBook,
} from '@/services/publicShelfClient';

// Kalponik: the public shelf as this account last saw it. The list is kept
// per account in localStorage so the Public books section still shows (and
// books already downloaded still open) offline.

const cacheKey = (account: string) => `kalponik.publicShelf.${account}`;

interface CachedShelf {
  books: PublicBook[];
  isAdmin: boolean;
  fetchedAt: number;
}

const readCache = (account: string | null): CachedShelf | null => {
  if (!account) return null;
  try {
    const json = localStorage.getItem(cacheKey(account));
    const parsed = json ? (JSON.parse(json) as CachedShelf) : null;
    return parsed && Array.isArray(parsed.books) ? parsed : null;
  } catch {
    return null;
  }
};

const writeCache = (account: string | null, shelf: CachedShelf) => {
  if (!account) return;
  try {
    localStorage.setItem(cacheKey(account), JSON.stringify(shelf));
  } catch {
    // Storage full or blocked: the in-memory list still holds for this run.
  }
};

interface PublicShelfState {
  account: string | null;
  books: PublicBook[];
  isAdmin: boolean;
  /** True once the list came from the server or the cache. */
  loaded: boolean;
  loading: boolean;
  fetchedAt: number;
  /** Shows the cached list for the current account, if any. */
  hydrate: () => void;
  refresh: () => Promise<void>;
  share: (hash: string) => Promise<{ alreadyPublic: boolean }>;
  unshare: (hash: string) => Promise<{ returnedToSharer: boolean }>;
  isPublic: (hash: string) => boolean;
}

export const usePublicShelfStore = create<PublicShelfState>((set, get) => ({
  account: null,
  books: [],
  isAdmin: false,
  loaded: false,
  loading: false,
  fetchedAt: 0,

  hydrate: () => {
    const account = getLibraryAccount();
    if (account === get().account && get().loaded) return;
    const cached = readCache(account);
    set({
      account,
      books: cached?.books ?? [],
      isAdmin: cached?.isAdmin ?? false,
      fetchedAt: cached?.fetchedAt ?? 0,
      loaded: !!cached,
    });
  },

  refresh: async () => {
    get().hydrate();
    const account = getLibraryAccount();
    set({ loading: true });
    try {
      const shelf = await fetchPublicShelf();
      // A sign-in as someone else while this was in flight: drop the answer.
      if (getLibraryAccount() !== account) return;
      const cached = { books: shelf.books, isAdmin: shelf.isAdmin, fetchedAt: Date.now() };
      writeCache(account, cached);
      set({ ...cached, account, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  share: async (hash) => {
    const result = await sharePublicBook(hash);
    await get()
      .refresh()
      .catch(() => {});
    return { alreadyPublic: result.alreadyPublic };
  },

  unshare: async (hash) => {
    const result = await unsharePublicBook(hash);
    set({ books: get().books.filter((b) => b.hash !== hash) });
    await get()
      .refresh()
      .catch(() => {});
    return { returnedToSharer: result.returnedToSharer };
  },

  isPublic: (hash) => get().books.some((b) => b.hash === hash),
}));

/**
 * A public book from the shelf joins your library the first time you open or
 * download it: a normal library entry (marked public) whose progress, status
 * and notes are yours, pushed with your next sync. Returns the library entry.
 */
export const addPublicBookToLibrary = async (
  envConfig: EnvConfigType,
  book: Book,
  now = Date.now(),
): Promise<Book> => {
  if (book.shelf !== 'public') return book;
  const existing = useLibraryStore.getState().getBookByHash(book.hash);
  if (existing && !existing.deletedAt) return existing;
  const added: Book = {
    ...existing,
    ...book,
    coverImageUrl: book.coverImageUrl ?? existing?.coverImageUrl,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await useLibraryStore.getState().updateBooks(envConfig, [added]);
  return added;
};
