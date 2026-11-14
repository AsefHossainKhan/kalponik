import { getAPIBaseUrl } from '@/services/environment';
import { fetchWithAuth } from '@/utils/fetch';
import type { Book, BookFormat } from '@/types/book';

// Kalponik: the app's side of the public shelf API (src/pages/api/shelf).

const SHELF_API = getAPIBaseUrl() + '/shelf';
const jsonHeaders = { 'Content-Type': 'application/json' };

export interface PublicBook {
  hash: string;
  title: string;
  author: string | null;
  format: string;
  size: number;
  metadata: Record<string, unknown> | null;
  sharedAt: string;
  /** The sharer's first name, when their account has one. */
  sharedBy: string | null;
  sharedByMe: boolean;
  canRemove: boolean;
  /** How many accounts have started it (have it in their library). */
  readers: number;
  /** A signed cover URL, valid for some hours, or null. */
  coverUrl: string | null;
}

export interface PublicShelf {
  books: PublicBook[];
  isAdmin: boolean;
}

export type ShelfErrorCode =
  | 'invalid_hash'
  | 'not_found'
  | 'not_uploaded'
  | 'too_large'
  | 'shelf_full'
  | 'forbidden'
  | 'server_error';

export const fetchPublicShelf = async (): Promise<PublicShelf> => {
  const response = await fetchWithAuth(`${SHELF_API}/public`, { method: 'GET', cache: 'no-store' });
  return (await response.json()) as PublicShelf;
};

const post = async <T>(path: string, bookHash: string): Promise<T> => {
  const response = await fetchWithAuth(`${SHELF_API}/${path}`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ bookHash }),
  });
  return (await response.json()) as T;
};

/** Puts one of your uploaded books on the public shelf. Throws Error(code) on refusal. */
export const sharePublicBook = (bookHash: string) =>
  post<{ ok: true; alreadyPublic: boolean }>('share', bookHash);

/** Takes a book off the public shelf (the sharer or an admin). Throws Error(code) on refusal. */
export const unsharePublicBook = (bookHash: string) =>
  post<{ ok: true; returnedToSharer: boolean }>('unshare', bookHash);

/**
 * The library entry for a public book the reader opens: a cloud book not yet
 * downloaded, marked public so its file comes from the shared copy and is
 * never uploaded. Its progress and status are the reader's own.
 */
export const publicBookToLibraryBook = (book: PublicBook, now = Date.now()): Book => ({
  hash: book.hash,
  format: book.format as BookFormat,
  title: book.title,
  author: book.author ?? '',
  metadata: (book.metadata ?? undefined) as Book['metadata'],
  shelf: 'public',
  createdAt: now,
  updatedAt: now,
  uploadedAt: now,
  downloadedAt: null,
  coverDownloadedAt: null,
});
