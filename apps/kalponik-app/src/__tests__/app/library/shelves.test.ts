import { describe, expect, test } from 'vitest';
import type { Book } from '@/types/book';
import type { PublicBook } from '@/services/publicShelfClient';
import {
  applyFinishedFilter,
  mergePublicShelf,
  publicBookStub,
  splitSearchResults,
} from '@/app/library/utils/shelves';

const book = (hash: string, extra: Partial<Book> = {}): Book =>
  ({ hash, title: hash, author: '', format: 'EPUB', createdAt: 1, updatedAt: 1, ...extra }) as Book;

const pub = (hash: string, extra: Partial<PublicBook> = {}): PublicBook => ({
  hash,
  title: `Public ${hash}`,
  author: 'Homer',
  format: 'EPUB',
  size: 100,
  metadata: null,
  sharedAt: '2026-11-14T10:00:00.000Z',
  sharedBy: 'Rafi',
  sharedByMe: false,
  canRemove: false,
  readers: 0,
  coverUrl: 'https://example.com/cover.png',
  ...extra,
});

describe('finished filter', () => {
  const books = [
    book('a', { readingStatus: 'finished' }),
    book('b', { readingStatus: 'reading' }),
    book('c'),
  ];
  test('all, hide finished, finished only', () => {
    expect(applyFinishedFilter(books, 'all')).toHaveLength(3);
    expect(applyFinishedFilter(books, undefined)).toHaveLength(3);
    expect(applyFinishedFilter(books, 'hide').map((b) => b.hash)).toEqual(['b', 'c']);
    expect(applyFinishedFilter(books, 'only').map((b) => b.hash)).toEqual(['a']);
  });
});

describe('public books in the library', () => {
  test("public books you haven't opened are added as public, not-downloaded entries", () => {
    const merged = mergePublicShelf([book('mine')], [pub('p1')], true);
    expect(merged.map((b) => b.hash)).toEqual(['mine', 'p1']);
    expect(merged[1]).toMatchObject({
      shelf: 'public',
      title: 'Public p1',
      author: 'Homer',
      coverImageUrl: 'https://example.com/cover.png',
      downloadedAt: null,
      createdAt: Date.parse('2026-11-14T10:00:00.000Z'),
    });
  });

  test('a public book you started is listed once, with your own progress', () => {
    const started = book('p1', { shelf: 'public', progress: [5, 100] });
    const merged = mergePublicShelf([started], [pub('p1')], true);
    expect(merged).toEqual([started]);
  });

  test('your private copy of the same book wins over the public entry', () => {
    const merged = mergePublicShelf([book('p1')], [pub('p1')], true);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.shelf).toBeUndefined();
  });

  test('a public book taken off the shelf leaves the library, but only once the list loaded', () => {
    const started = book('gone', { shelf: 'public' });
    expect(mergePublicShelf([started], [], true)).toEqual([]);
    expect(mergePublicShelf([started], [], false)).toEqual([started]);
  });

  test('a deleted library entry does not hide the public one', () => {
    const merged = mergePublicShelf(
      [book('p1', { deletedAt: 5, shelf: 'public' })],
      [pub('p1')],
      true,
    );
    expect(merged.filter((b) => !b.deletedAt).map((b) => b.hash)).toEqual(['p1']);
  });

  test('a stub carries no null metadata', () => {
    expect(publicBookStub(pub('x')).metadata).toBeUndefined();
  });
});

describe('search keeps the sections', () => {
  test('your own matches, then public ones', () => {
    const split = splitSearchResults([book('a'), book('b', { shelf: 'public' })]);
    expect(split.mine.map((b) => b.hash)).toEqual(['a']);
    expect(split.publicBooks.map((b) => b.hash)).toEqual(['b']);
  });
});
