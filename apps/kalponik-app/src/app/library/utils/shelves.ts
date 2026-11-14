import type { Book } from '@/types/book';
import type { PublicBook } from '@/services/publicShelfClient';

// Kalponik: the library's three sections are Currently reading, My books and
// Public books (built-in shelves `recent`, `default` and `public`). This file
// holds the rules that feed them, kept free of React so they can be tested.

/** The filter chips under the library header. */
export type FinishedFilter = 'all' | 'hide' | 'only';
export const FINISHED_FILTERS: FinishedFilter[] = ['all', 'hide', 'only'];

export const isFinishedFilter = (value: unknown): value is FinishedFilter =>
  FINISHED_FILTERS.includes(value as FinishedFilter);

export const applyFinishedFilter = (books: Book[], filter: FinishedFilter | undefined): Book[] => {
  if (filter === 'hide') return books.filter((b) => b.readingStatus !== 'finished');
  if (filter === 'only') return books.filter((b) => b.readingStatus === 'finished');
  return books;
};

/** A public book not yet in your library: shown on the Public books shelf. */
export const publicBookStub = (book: PublicBook): Book => {
  const sharedAt = Date.parse(book.sharedAt) || 0;
  return {
    hash: book.hash,
    format: book.format as Book['format'],
    title: book.title,
    author: book.author ?? '',
    metadata: (book.metadata ?? undefined) as Book['metadata'],
    shelf: 'public',
    coverImageUrl: book.coverUrl,
    createdAt: sharedAt,
    updatedAt: sharedAt,
    uploadedAt: sharedAt,
    downloadedAt: null,
    coverDownloadedAt: null,
  };
};

/**
 * The books the library page shows: your library, with public books you
 * haven't opened yet added from the public list. A public book in your
 * library that is no longer on the shelf (taken off) is hidden; your progress
 * and notes stay, and it comes back if someone shares it again. Until the
 * list has loaded once (never online), nothing is hidden.
 */
export const mergePublicShelf = (
  library: Book[],
  publicBooks: PublicBook[],
  publicLoaded: boolean,
): Book[] => {
  const onShelf = new Set(publicBooks.map((b) => b.hash));
  const inLibrary = new Set<string>();
  const books: Book[] = [];
  for (const book of library) {
    if (!book.deletedAt) inLibrary.add(book.hash);
    if (book.shelf === 'public' && publicLoaded && !onShelf.has(book.hash)) continue;
    books.push(book);
  }
  for (const book of publicBooks) {
    if (!inLibrary.has(book.hash)) books.push(publicBookStub(book));
  }
  return books;
};

/** Search keeps the sections: your own matches first, then public ones. */
export const splitSearchResults = (books: Book[]) => ({
  mine: books.filter((b) => b.shelf !== 'public'),
  publicBooks: books.filter((b) => b.shelf === 'public'),
});
