import { describe, expect, test, vi } from 'vitest';
import type { Book } from '@/types/book';
import type { FileSystem } from '@/types/system';
import { getCloudBooksSubdir, uploadBook, uploadBookCover } from '@/services/cloudService';
import { toFileKey } from '@/libs/storage';

const USER = '11111111-2222-4333-8444-555555555555';
const book = (extra: Partial<Book> = {}) =>
  ({ hash: 'h', title: 'T', author: '', format: 'EPUB', ...extra }) as Book;

describe('public books in cloud storage', () => {
  test('a public book is read from the shared copy, a private one from your own', () => {
    expect(getCloudBooksSubdir(book({ shelf: 'public' }))).toBe('shared/Kalponik/Books');
    expect(getCloudBooksSubdir(book())).toBe('Kalponik/Books');
    expect(toFileKey(USER, 'shared/Kalponik/Books/h/h.epub')).toBe(
      'shared/Kalponik/Books/h/h.epub',
    );
    expect(toFileKey(USER, 'Kalponik/Books/h/h.epub')).toBe(`${USER}/Kalponik/Books/h/h.epub`);
  });

  test('a public book is never uploaded from a device', async () => {
    const fs = { exists: vi.fn() } as unknown as FileSystem;
    const resolve = vi.fn();
    await uploadBook(fs, resolve, book({ shelf: 'public' }));
    await uploadBookCover(fs, resolve, book({ shelf: 'public' }));
    expect(fs.exists).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });
});
