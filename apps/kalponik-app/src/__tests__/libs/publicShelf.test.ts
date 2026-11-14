import { describe, test, expect, beforeEach } from 'vitest';
import {
  getShelfLimits,
  isReadableSharedKey,
  listPublicBooks,
  shareBook,
  sharedCoverKey,
  sharedFileKey,
  unshareBook,
  type OwnBook,
  type PublicBookRow,
  type ShelfDeps,
  type ShelfStore,
  type StoredFile,
} from '@/libs/publicShelf';

const AMINA = 'aaaaaaaa-0000-4000-8000-000000000001';
const RAFI = 'bbbbbbbb-0000-4000-8000-000000000002';
const ADMIN = 'cccccccc-0000-4000-8000-000000000003';
const HASH = '0123456789abcdef0123456789abcdef';
const MB = 1024 * 1024;

interface World {
  shelf: Map<string, PublicBookRow>;
  books: Map<string, OwnBook & { shelf: 'public' | null }>;
  files: Map<string, StoredFile & { user: string; hash: string }>;
  objects: Map<string, string>;
}

const key = (user: string, hash: string) => `${user}/${hash}`;
let nextId = 1;

function makeWorld(): World {
  return { shelf: new Map(), books: new Map(), files: new Map(), objects: new Map() };
}

function addPrivateBook(w: World, user: string, hash: string, size = 2 * MB, cover = true) {
  w.books.set(key(user, hash), {
    title: 'Moby-Dick',
    author: 'Herman Melville',
    format: 'EPUB',
    metadata: null,
    shelf: null,
  });
  const fileKey = `${user}/Kalponik/Books/${hash}/${hash}.epub`;
  w.files.set(fileKey, { id: String(nextId++), file_key: fileKey, file_size: size, user, hash });
  w.objects.set(fileKey, 'book-bytes');
  if (cover) {
    const coverKey = `${user}/Kalponik/Books/${hash}/cover.png`;
    w.files.set(coverKey, { id: String(nextId++), file_key: coverKey, file_size: 10, user, hash });
    w.objects.set(coverKey, 'cover-bytes');
  }
}

function makeDeps(w: World, limits = { totalBytes: 50 * 1024 * MB, bookBytes: 300 * MB }) {
  const store: ShelfStore = {
    async get(hash) {
      return w.shelf.get(hash) ?? null;
    },
    async listActive() {
      return [...w.shelf.values()].filter((r) => !r.removed_at);
    },
    async activeBytes() {
      return [...w.shelf.values()]
        .filter((r) => !r.removed_at)
        .reduce((s, r) => s + r.file_size, 0);
    },
    async save(row) {
      w.shelf.set(row.book_hash, { ...row });
    },
    async ownBook(user, hash) {
      const b = w.books.get(key(user, hash));
      return b
        ? { title: b.title, author: b.author, format: b.format, metadata: b.metadata }
        : null;
    },
    async setShelf(user, hash, shelf) {
      const b = w.books.get(key(user, hash));
      if (b) b.shelf = shelf;
    },
    async ownFiles(user, hash) {
      return [...w.files.values()].filter((f) => f.user === user && f.hash === hash);
    },
    async addFile(user, hash, fileKey, fileSize) {
      w.files.set(fileKey, {
        id: String(nextId++),
        file_key: fileKey,
        file_size: fileSize,
        user,
        hash,
      });
    },
    async removeFiles(ids) {
      for (const [k, f] of w.files) if (ids.includes(f.id)) w.files.delete(k);
    },
    async readerCount(hash) {
      return [...w.books.entries()].filter(([k, b]) => k.endsWith(hash) && b.shelf === 'public')
        .length;
    },
  };
  const deps: ShelfDeps = {
    store,
    objects: {
      async copy(from, to) {
        const bytes = w.objects.get(from);
        if (bytes === undefined) throw new Error(`no object ${from}`);
        w.objects.set(to, bytes);
      },
      async remove(k) {
        w.objects.delete(k);
      },
    },
    limits,
    isAdmin: async (id) => id === ADMIN,
    now: () => new Date('2026-11-14T10:00:00Z'),
  };
  return deps;
}

describe('sharing a book on the public shelf', () => {
  let w: World;
  beforeEach(() => {
    w = makeWorld();
  });

  test('moves the file and cover to the shared folder and out of private storage', async () => {
    addPrivateBook(w, AMINA, HASH);
    const result = await shareBook(makeDeps(w), AMINA, HASH);
    expect(result).toEqual({ ok: true, alreadyPublic: false });

    expect(w.objects.get(sharedFileKey(HASH, 'epub'))).toBe('book-bytes');
    expect(w.objects.get(sharedCoverKey(HASH))).toBe('cover-bytes');
    expect([...w.objects.keys()].some((k) => k.startsWith(AMINA))).toBe(false);
    expect([...w.files.values()].some((f) => f.user === AMINA)).toBe(false);
    expect(w.books.get(key(AMINA, HASH))!.shelf).toBe('public');
    expect(w.shelf.get(HASH)).toMatchObject({
      title: 'Moby-Dick',
      shared_by: AMINA,
      file_size: 2 * MB,
      removed_at: null,
    });
  });

  test("a book that isn't uploaded, or isn't yours, can't be shared", async () => {
    w.books.set(key(AMINA, HASH), {
      title: 'Local only',
      author: null,
      format: 'EPUB',
      metadata: null,
      shelf: null,
    });
    expect(await shareBook(makeDeps(w), AMINA, HASH)).toEqual({
      ok: false,
      error: 'not_uploaded',
    });
    expect(await shareBook(makeDeps(w), RAFI, HASH)).toEqual({ ok: false, error: 'not_found' });
    expect(await shareBook(makeDeps(w), AMINA, '../x')).toEqual({
      ok: false,
      error: 'invalid_hash',
    });
  });

  test('the per-book limit and the shelf cap are enforced', async () => {
    addPrivateBook(w, AMINA, HASH, 400 * MB);
    expect(await shareBook(makeDeps(w), AMINA, HASH)).toEqual({ ok: false, error: 'too_large' });

    const other = 'ffffffffffffffffffffffffffffffff';
    addPrivateBook(w, RAFI, other, 20 * MB);
    const tight = makeDeps(w, { totalBytes: 10 * MB, bookBytes: 300 * MB });
    expect(await shareBook(tight, RAFI, other)).toEqual({ ok: false, error: 'shelf_full' });
    expect(w.shelf.size).toBe(0);
  });

  test('sharing a book that is already public just drops your private copy', async () => {
    addPrivateBook(w, AMINA, HASH);
    await shareBook(makeDeps(w), AMINA, HASH);
    addPrivateBook(w, RAFI, HASH);
    expect(await shareBook(makeDeps(w), RAFI, HASH)).toEqual({ ok: true, alreadyPublic: true });
    expect([...w.files.values()].some((f) => f.user === RAFI)).toBe(false);
    expect(w.shelf.get(HASH)!.shared_by).toBe(AMINA);
  });
});

describe('taking a book off the public shelf', () => {
  let w: World;
  beforeEach(async () => {
    w = makeWorld();
    addPrivateBook(w, AMINA, HASH);
    await shareBook(makeDeps(w), AMINA, HASH);
  });

  test('only the sharer or an admin may take it off', async () => {
    expect(await unshareBook(makeDeps(w), RAFI, HASH)).toEqual({ ok: false, error: 'forbidden' });
    expect(await unshareBook(makeDeps(w), ADMIN, HASH)).toEqual({
      ok: true,
      returnedToSharer: true,
    });
  });

  test('the file goes back to the sharer, and the shared copy is deleted', async () => {
    await unshareBook(makeDeps(w), AMINA, HASH);
    expect(w.objects.get(`${AMINA}/Kalponik/Books/${HASH}/${HASH}.epub`)).toBe('book-bytes');
    expect(w.objects.get(`${AMINA}/Kalponik/Books/${HASH}/cover.png`)).toBe('cover-bytes');
    expect(w.objects.has(sharedFileKey(HASH, 'epub'))).toBe(false);
    expect(w.books.get(key(AMINA, HASH))!.shelf).toBeNull();
    expect(w.shelf.get(HASH)!.removed_at).toBe('2026-11-14T10:00:00.000Z');
    expect(await isReadableSharedKey(makeDeps(w).store, sharedFileKey(HASH, 'epub'))).toBe(false);
  });

  test("when the sharer's account or copy is gone, the file is deleted", async () => {
    w.shelf.get(HASH)!.shared_by = null; // account deleted: ON DELETE SET NULL
    expect(await unshareBook(makeDeps(w), ADMIN, HASH)).toEqual({
      ok: true,
      returnedToSharer: false,
    });
    expect([...w.objects.keys()]).toEqual([]);
  });

  test('a book taken off can be shared again', async () => {
    await unshareBook(makeDeps(w), AMINA, HASH);
    expect(await shareBook(makeDeps(w), AMINA, HASH)).toEqual({ ok: true, alreadyPublic: false });
    expect(w.shelf.get(HASH)!.removed_at).toBeNull();
  });
});

describe('reading the public shelf', () => {
  test('lists books newest first with what the caller may do', async () => {
    const w = makeWorld();
    addPrivateBook(w, AMINA, HASH);
    await shareBook(makeDeps(w), AMINA, HASH);
    w.books.set(key(RAFI, HASH), {
      title: 'Moby-Dick',
      author: null,
      format: 'EPUB',
      metadata: null,
      shelf: 'public',
    });

    const names = async (id: string) => (id === AMINA ? 'Amina' : null);
    const forRafi = await listPublicBooks(makeDeps(w), RAFI, names);
    expect(forRafi.isAdmin).toBe(false);
    expect(forRafi.books).toEqual([
      expect.objectContaining({
        hash: HASH,
        sharedBy: 'Amina',
        sharedByMe: false,
        canRemove: false,
        readers: 2,
        hasCover: true,
      }),
    ]);
    const forAdmin = await listPublicBooks(makeDeps(w), ADMIN, names);
    expect(forAdmin.books[0]!.canRemove).toBe(true);
  });

  test("only a public book's own file and cover are readable by others", async () => {
    const w = makeWorld();
    addPrivateBook(w, AMINA, HASH);
    const deps = makeDeps(w);
    expect(await isReadableSharedKey(deps.store, sharedFileKey(HASH, 'epub'))).toBe(false);
    await shareBook(deps, AMINA, HASH);
    expect(await isReadableSharedKey(deps.store, sharedFileKey(HASH, 'epub'))).toBe(true);
    expect(await isReadableSharedKey(deps.store, sharedCoverKey(HASH))).toBe(true);
    expect(await isReadableSharedKey(deps.store, `shared/Kalponik/Books/${HASH}/other.pdf`)).toBe(
      false,
    );
    expect(await isReadableSharedKey(deps.store, `${AMINA}/Kalponik/Books/${HASH}/x.epub`)).toBe(
      false,
    );
  });
});

describe('shelf limits', () => {
  test('default to 50 GB in total and 300 MB per book', () => {
    expect(getShelfLimits({})).toEqual({ totalBytes: 50 * 1024 ** 3, bookBytes: 300 * MB });
    expect(
      getShelfLimits({ KALPONIK_PUBLIC_SHELF_QUOTA_GB: '5', KALPONIK_PUBLIC_BOOK_MAX_MB: 'x' }),
    ).toEqual({ totalBytes: 5 * 1024 ** 3, bookBytes: 300 * MB });
  });
});
