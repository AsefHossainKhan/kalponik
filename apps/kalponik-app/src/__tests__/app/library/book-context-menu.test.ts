// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { getBookContextMenuItemIds } from '@/app/library/utils/libraryUtils';
import { buildFeedBookUrl } from '@/services/rss/feedBookUrl';
import { Book } from '@/types/book';

const createBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'hash-1',
  format: 'EPUB',
  title: 'Test Book',
  author: 'Test Author',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('getBookContextMenuItemIds', () => {
  it('returns a deterministic order for a local downloaded book', () => {
    const book = createBook({ downloadedAt: 1 });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'upload',
      'share',
      'delete',
    ]);
  });

  it('offers an offline download for Audiobookshelf audiobooks and ebooks (#6256)', () => {
    const audiobook = createBook({ format: 'ABS', filePath: 'abs://srv/item' });
    const ebook = createBook({
      format: 'ABS',
      filePath: 'abs://srv/item',
      metadata: { absMediaType: 'ebook' } as never,
    });
    expect(getBookContextMenuItemIds(audiobook, { absOffline: true })).toContain('offlineDownload');
    expect(getBookContextMenuItemIds(ebook, { absOffline: true })).toContain('offlineDownload');
    // Web builds have nowhere to keep the files.
    expect(getBookContextMenuItemIds(audiobook)).not.toContain('offlineDownload');

    const downloaded = { ...audiobook, absDownloadedAt: 1 };
    const ids = getBookContextMenuItemIds(downloaded, { absOffline: true });
    expect(ids).toContain('offlineRemove');
    expect(ids).not.toContain('offlineDownload');
  });

  it('never offers an offline download for podcasts or regular books', () => {
    const podcast = createBook({
      format: 'ABS',
      filePath: 'abs://srv/item',
      metadata: { absMediaType: 'podcast' } as never,
    });
    const podcastWithoutMirror = createBook({
      format: 'ABS',
      filePath: 'abs://srv/item',
      absMediaType: 'podcast',
    });
    const offlineIds = ['offlineDownload', 'offlineRemove'];
    for (const book of [podcast, podcastWithoutMirror, createBook({ downloadedAt: 1 })]) {
      const ids = getBookContextMenuItemIds(book, { absOffline: true });
      expect(ids.filter((id) => offlineIds.includes(id))).toEqual([]);
    }
  });

  it('offers sendNearby for a local book only when LocalSend is enabled', () => {
    const local = createBook({ downloadedAt: 1 });
    expect(getBookContextMenuItemIds(local, { localSend: true })).toContain('sendNearby');
    expect(getBookContextMenuItemIds(local)).not.toContain('sendNearby');
    // Cloud-only books have no local file to send.
    const cloudOnly = createBook({ uploadedAt: 1 });
    expect(getBookContextMenuItemIds(cloudOnly, { localSend: true })).not.toContain('sendNearby');
  });

  it('shows markUnread + markAbandoned + clearStatus for a finished book', () => {
    const book = createBook({ downloadedAt: 1, readingStatus: 'finished' });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markUnread',
      'markAbandoned',
      'clearStatus',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'upload',
      'share',
      'delete',
    ]);
  });

  it('shows "Mark as Finished" + "Clear Status" for an unread book', () => {
    const book = createBook({ downloadedAt: 1, readingStatus: 'unread' });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markFinished',
      'markAbandoned',
      'clearStatus',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'upload',
      'share',
      'delete',
    ]);
  });

  it('hides markAbandoned but offers markFinished + clearStatus for an abandoned book', () => {
    const book = createBook({ downloadedAt: 1, readingStatus: 'abandoned' });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markFinished',
      'clearStatus',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'upload',
      'share',
      'delete',
    ]);
  });

  it('offers Download (not Upload) for a cloud-only book', () => {
    const book = createBook({ uploadedAt: 1 });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'download',
      'share',
      'delete',
    ]);
  });

  it('omits download/upload/share for a book that is neither downloaded nor uploaded', () => {
    const book = createBook({ filePath: '/some/external/file.epub' });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'delete',
    ]);
  });

  // Issue #5307 — a feed subscription has no file anywhere: the cloud has
  // nothing to upload it to and nothing to hand a share link. Offering those
  // actions only produces a failed transfer.
  it('omits download/upload/share for a feed book (issue #5307)', () => {
    const book = createBook({
      downloadedAt: 1,
      url: buildFeedBookUrl('https://www.saastr.com/feed/'),
    });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'delete',
    ]);
  });

  it('produces the same order on repeated calls and never duplicates an item (issue #4389)', () => {
    const book = createBook({ downloadedAt: 1, uploadedAt: 1, readingStatus: 'finished' });
    const first = getBookContextMenuItemIds(book);
    const second = getBookContextMenuItemIds(book);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe('Kalponik public shelf menu items', () => {
  const signedIn = (inLibrary = true, canRemove = false) => ({
    publicShelf: { inLibrary, canRemove },
  });

  it('offers sharing on the public shelf for your own uploaded book, when signed in', () => {
    const book = createBook({ downloadedAt: 1, uploadedAt: 1 });
    expect(getBookContextMenuItemIds(book, signedIn())).toContain('sharePublic');
    expect(getBookContextMenuItemIds(book)).not.toContain('sharePublic');
  });

  it('a public book you started has no upload or share link, and only its sharer or an admin can take it off', () => {
    const book = createBook({ shelf: 'public', downloadedAt: 1, uploadedAt: 1 });
    const reader = getBookContextMenuItemIds(book, signedIn(true, false));
    expect(reader).not.toContain('share');
    expect(reader).not.toContain('sharePublic');
    expect(reader).not.toContain('upload');
    expect(reader).not.toContain('unsharePublic');
    expect(reader.at(-1)).toBe('delete');
    expect(getBookContextMenuItemIds(book, signedIn(true, true))).toContain('unsharePublic');
  });

  it("a public book you haven't opened offers only its details, plus take off for its sharer", () => {
    const book = createBook({ shelf: 'public', uploadedAt: 1 });
    expect(getBookContextMenuItemIds(book, signedIn(false, false))).toEqual(['showDetails']);
    expect(getBookContextMenuItemIds(book, signedIn(false, true))).toEqual([
      'showDetails',
      'unsharePublic',
    ]);
  });
});
