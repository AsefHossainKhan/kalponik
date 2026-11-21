// Kalponik: the public shelf (server side).
//
// A book is private unless it is on the public shelf. A public book is stored
// once, under `shared/Kalponik/Books/<hash>/`, and every signed-in account can
// read it. Sharing moves the sharer's own copy there (their quota goes down);
// taking it off moves it back to the sharer, or deletes it when the sharer's
// account or their copy of the book is gone.
//
// Readers keep their own `books` row (shelf = 'public') with their progress,
// status and notes; nothing here touches those.
//
// Members may share; the sharer or any admin may take a book off. The shelf
// has a total size cap and a per-book limit (server settings, below).

export const SHARED_BOOKS_PREFIX = 'shared/Kalponik/Books';
export const DEFAULT_SHELF_QUOTA_GB = 50;
export const DEFAULT_BOOK_MAX_MB = 300;

const BOOK_HASH_RE = /^[0-9a-f]{32}$/;
export const isValidBookHash = (hash: unknown): hash is string =>
  typeof hash === 'string' && BOOK_HASH_RE.test(hash);

export interface PublicBookRow {
  book_hash: string;
  title: string;
  author: string | null;
  format: string;
  file_key: string;
  cover_key: string | null;
  file_size: number;
  metadata: Record<string, unknown> | null;
  shared_by: string | null;
  shared_at: string;
  removed_at: string | null;
  removed_by: string | null;
  updated_at: string;
}

/** A `files` row: one stored object of a user's. */
export interface StoredFile {
  id: string;
  file_key: string;
  file_size: number;
}

/** The parts of a user's `books` row the shelf needs. */
export interface OwnBook {
  title: string | null;
  author: string | null;
  format: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ShelfStore {
  /** The shelf row for a hash, taken off or not. */
  get(hash: string): Promise<PublicBookRow | null>;
  listActive(): Promise<PublicBookRow[]>;
  activeBytes(): Promise<number>;
  save(row: PublicBookRow): Promise<void>;
  /** The user's live `books` row for the hash, or null. */
  ownBook(userId: string, hash: string): Promise<OwnBook | null>;
  setShelf(userId: string, hash: string, shelf: 'public' | null): Promise<void>;
  /** The user's stored objects for the book (file and cover). */
  ownFiles(userId: string, hash: string): Promise<StoredFile[]>;
  addFile(userId: string, hash: string, fileKey: string, fileSize: number): Promise<void>;
  removeFiles(ids: string[]): Promise<void>;
  /** How many accounts have the book in their library as a public book. */
  readerCount(hash: string): Promise<number>;
}

export interface ObjectStore {
  copy(from: string, to: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ShelfLimits {
  totalBytes: number;
  bookBytes: number;
}

export interface ShelfDeps {
  store: ShelfStore;
  objects: ObjectStore;
  limits: ShelfLimits;
  isAdmin(userId: string): Promise<boolean>;
  now(): Date;
}

export type ShelfError =
  | 'invalid_hash'
  | 'not_found'
  | 'not_uploaded'
  | 'too_large'
  | 'shelf_full'
  | 'forbidden';

export type ShelfResult<T = object> = ({ ok: true } & T) | { ok: false; error: ShelfError };

const parseSize = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Limits from the server settings, in GB and MB, with the defaults above. */
export const getShelfLimits = (env: Record<string, string | undefined>): ShelfLimits => ({
  totalBytes: parseSize(env['KALPONIK_PUBLIC_SHELF_QUOTA_GB'], DEFAULT_SHELF_QUOTA_GB) * 1024 ** 3,
  bookBytes: parseSize(env['KALPONIK_PUBLIC_BOOK_MAX_MB'], DEFAULT_BOOK_MAX_MB) * 1024 ** 2,
});

const privateBookDir = (userId: string, hash: string) => `${userId}/Kalponik/Books/${hash}/`;
const isCover = (key: string) => key.endsWith('/cover.png');
const extensionOf = (key: string) => {
  const name = key.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export const sharedFileKey = (hash: string, ext: string) =>
  `${SHARED_BOOKS_PREFIX}/${hash}/${hash}.${ext}`;
export const sharedCoverKey = (hash: string) => `${SHARED_BOOKS_PREFIX}/${hash}/cover.png`;

/** Splits a user's stored objects for a book into the book file and its cover. */
const pickOwnFiles = (userId: string, hash: string, files: StoredFile[]) => {
  const inDir = files.filter((f) => f.file_key.startsWith(privateBookDir(userId, hash)));
  return {
    book: inDir.find((f) => !isCover(f.file_key) && extensionOf(f.file_key)) ?? null,
    cover: inDir.find((f) => isCover(f.file_key)) ?? null,
    all: inDir,
  };
};

/** Drops the user's private copy of a book whose public copy already exists. */
async function dropPrivateCopy(deps: ShelfDeps, files: StoredFile[]) {
  for (const file of files) await deps.objects.remove(file.file_key);
  if (files.length) await deps.store.removeFiles(files.map((f) => f.id));
}

/**
 * Puts the caller's book on the public shelf. The book must be in their
 * library with its file uploaded. If it is already public, their private
 * copy is dropped instead and their row joins the public book.
 */
export async function shareBook(
  deps: ShelfDeps,
  userId: string,
  hash: string,
): Promise<ShelfResult<{ alreadyPublic: boolean }>> {
  if (!isValidBookHash(hash)) return { ok: false, error: 'invalid_hash' };
  const { store, objects, limits } = deps;

  const own = await store.ownBook(userId, hash);
  if (!own) return { ok: false, error: 'not_found' };
  const files = pickOwnFiles(userId, hash, await store.ownFiles(userId, hash));

  const existing = await store.get(hash);
  if (existing && !existing.removed_at) {
    await store.setShelf(userId, hash, 'public');
    await dropPrivateCopy(deps, files.all);
    return { ok: true, alreadyPublic: true };
  }

  if (!files.book) return { ok: false, error: 'not_uploaded' };
  if (files.book.file_size > limits.bookBytes) return { ok: false, error: 'too_large' };
  if ((await store.activeBytes()) + files.book.file_size > limits.totalBytes) {
    return { ok: false, error: 'shelf_full' };
  }

  const fileKey = sharedFileKey(hash, extensionOf(files.book.file_key));
  const coverKey = files.cover ? sharedCoverKey(hash) : null;
  // Copy first: if a copy fails, nothing has changed for anyone.
  await objects.copy(files.book.file_key, fileKey);
  if (files.cover && coverKey) await objects.copy(files.cover.file_key, coverKey);

  const now = deps.now().toISOString();
  await store.save({
    book_hash: hash,
    title: own.title?.trim() || 'Untitled',
    author: own.author?.trim() || null,
    format: own.format ?? extensionOf(fileKey).toUpperCase(),
    file_key: fileKey,
    cover_key: coverKey,
    file_size: files.book.file_size,
    metadata: own.metadata,
    shared_by: userId,
    shared_at: now,
    removed_at: null,
    removed_by: null,
    updated_at: now,
  });
  await store.setShelf(userId, hash, 'public');
  await dropPrivateCopy(deps, files.all);
  return { ok: true, alreadyPublic: false };
}

/**
 * Takes a book off the public shelf (the sharer or an admin). The file goes
 * back to the sharer's private storage when they still have the book in
 * their library; otherwise it is deleted. Readers keep their progress and
 * notes; their apps stop listing the book.
 */
export async function unshareBook(
  deps: ShelfDeps,
  userId: string,
  hash: string,
): Promise<ShelfResult<{ returnedToSharer: boolean }>> {
  if (!isValidBookHash(hash)) return { ok: false, error: 'invalid_hash' };
  const { store, objects } = deps;
  const row = await store.get(hash);
  if (!row || row.removed_at) return { ok: false, error: 'not_found' };
  if (row.shared_by !== userId && !(await deps.isAdmin(userId))) {
    return { ok: false, error: 'forbidden' };
  }

  const sharer = row.shared_by;
  const sharerBook = sharer ? await store.ownBook(sharer, hash) : null;
  let returnedToSharer = false;
  if (sharer && sharerBook) {
    const dir = privateBookDir(sharer, hash);
    const fileKey = `${dir}${hash}.${extensionOf(row.file_key)}`;
    await objects.copy(row.file_key, fileKey);
    await store.addFile(sharer, hash, fileKey, row.file_size);
    if (row.cover_key) {
      const coverKey = `${dir}cover.png`;
      await objects.copy(row.cover_key, coverKey);
      await store.addFile(sharer, hash, coverKey, 0);
    }
    await store.setShelf(sharer, hash, null);
    returnedToSharer = true;
  }

  const now = deps.now().toISOString();
  await store.save({ ...row, removed_at: now, removed_by: userId, updated_at: now });
  await objects.remove(row.file_key);
  if (row.cover_key) await objects.remove(row.cover_key);
  return { ok: true, returnedToSharer };
}

export interface PublicBookSummary {
  hash: string;
  title: string;
  author: string | null;
  format: string;
  size: number;
  metadata: Record<string, unknown> | null;
  sharedAt: string;
  sharedBy: string | null;
  sharedByMe: boolean;
  canRemove: boolean;
  readers: number;
  hasCover: boolean;
}

/** The shelf as the caller sees it, newest first. */
export async function listPublicBooks(
  deps: Pick<ShelfDeps, 'store' | 'isAdmin'>,
  userId: string,
  nameOf: (userId: string) => Promise<string | null>,
): Promise<{ books: PublicBookSummary[]; isAdmin: boolean }> {
  const rows = await deps.store.listActive();
  const admin = await deps.isAdmin(userId);
  const names = new Map<string, string | null>();
  for (const id of new Set(rows.map((r) => r.shared_by).filter((id): id is string => !!id))) {
    names.set(id, await nameOf(id));
  }
  const books = await Promise.all(
    rows
      .slice()
      .sort((a, b) => b.shared_at.localeCompare(a.shared_at))
      .map(async (row) => ({
        hash: row.book_hash,
        title: row.title,
        author: row.author,
        format: row.format,
        size: row.file_size,
        metadata: row.metadata,
        sharedAt: row.shared_at,
        sharedBy: row.shared_by ? (names.get(row.shared_by) ?? null) : null,
        sharedByMe: row.shared_by === userId,
        canRemove: admin || row.shared_by === userId,
        readers: await deps.store.readerCount(row.book_hash),
        hasCover: !!row.cover_key,
      })),
  );
  return { books, isAdmin: admin };
}

/**
 * The stored key of a public book's file or cover that anyone signed in may
 * read, for a key a client asked for; null when there is none.
 *
 * The shared file is stored as `<hash>/<hash>.<ext>`, but a client names a
 * book file by the storage type it believes in: the Android app has no
 * runtime config, so it falls back to R2 naming, `<hash>/<title>.<ext>`. Like
 * the private-file fallback in the download route, a book file is matched by
 * its hash and extension.
 */
export async function resolveSharedKey(store: ShelfStore, key: string): Promise<string | null> {
  if (!key.startsWith(`${SHARED_BOOKS_PREFIX}/`)) return null;
  const parts = key.slice(SHARED_BOOKS_PREFIX.length + 1).split('/');
  const hash = parts[0];
  if (!isValidBookHash(hash)) return null;
  const row = await store.get(hash);
  if (!row || row.removed_at) return null;
  if (row.file_key === key || row.cover_key === key) return key;
  if (parts.length === 2 && !isCover(key)) {
    const ext = extensionOf(key);
    if (ext && ext === extensionOf(row.file_key)) return row.file_key;
  }
  return null;
}

/** Whether a storage key is a public book's file or cover that anyone signed in may read. */
export async function isReadableSharedKey(store: ShelfStore, key: string): Promise<boolean> {
  return (await resolveSharedKey(store, key)) !== null;
}

/** The HTTP status an API route answers a shelf error with. */
export const shelfErrorStatus = (error: ShelfError): number => {
  switch (error) {
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'too_large':
      return 413;
    case 'shelf_full':
    case 'not_uploaded':
      return 409;
    default:
      return 400;
  }
};
