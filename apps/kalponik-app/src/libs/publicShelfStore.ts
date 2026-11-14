import { createSupabaseAdminClient } from '@/utils/supabase';
import { copyObject, deleteObject } from '@/utils/object';
import { isAdmin } from '@/libs/admins';
import { createSupabaseAdminStore, getRootAdminsSetting } from '@/libs/invitesStore';
import {
  getShelfLimits,
  type ObjectStore,
  type OwnBook,
  type PublicBookRow,
  type ShelfDeps,
  type ShelfStore,
  type StoredFile,
} from '@/libs/publicShelf';

// The Supabase and Garage side of the public shelf: the `public_books` table
// (migration 037), the users' `books` and `files` rows, and the books bucket.
// Server only: all of it needs the service-role key.

const fail = (what: string, error: { message: string }): never => {
  throw new Error(`public shelf: ${what} failed: ${error.message}`);
};

const ROW_COLUMNS =
  'book_hash, title, author, format, file_key, cover_key, file_size, metadata, shared_by, shared_at, removed_at, removed_by, updated_at';

const parseMetadata = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const createSupabaseShelfStore = (): ShelfStore => {
  const db = createSupabaseAdminClient();
  return {
    async get(hash) {
      const { data, error } = await db
        .from('public_books')
        .select(ROW_COLUMNS)
        .eq('book_hash', hash)
        .maybeSingle();
      if (error) fail('read book', error);
      return (data as PublicBookRow | null) ?? null;
    },
    async listActive() {
      const { data, error } = await db
        .from('public_books')
        .select(ROW_COLUMNS)
        .is('removed_at', null)
        .order('shared_at', { ascending: false });
      if (error) fail('list books', error);
      return (data as PublicBookRow[]) ?? [];
    },
    async activeBytes() {
      const { data, error } = await db
        .from('public_books')
        .select('file_size')
        .is('removed_at', null);
      if (error) fail('sum sizes', error);
      return (data ?? []).reduce((sum, row) => sum + Number(row.file_size ?? 0), 0);
    },
    async save(row) {
      const { error } = await db.from('public_books').upsert(row, { onConflict: 'book_hash' });
      if (error) fail('save book', error);
    },
    async ownBook(userId, hash) {
      const { data, error } = await db
        .from('books')
        .select('title, author, format, metadata')
        .eq('user_id', userId)
        .eq('book_hash', hash)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) fail('read own book', error);
      if (!data) return null;
      return { ...(data as OwnBook), metadata: parseMetadata(data.metadata) };
    },
    async setShelf(userId, hash, shelf) {
      // Any write stamps synced_at, so the account's other devices pull it.
      const { error } = await db
        .from('books')
        .update({ shelf, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('book_hash', hash);
      if (error) fail('set shelf', error);
    },
    async ownFiles(userId, hash) {
      const { data, error } = await db
        .from('files')
        .select('id, file_key, file_size')
        .eq('user_id', userId)
        .eq('book_hash', hash)
        .is('deleted_at', null);
      if (error) fail('list own files', error);
      return (data as StoredFile[]) ?? [];
    },
    async addFile(userId, hash, fileKey, fileSize) {
      const { error } = await db
        .from('files')
        .upsert(
          { user_id: userId, book_hash: hash, file_key: fileKey, file_size: fileSize },
          { onConflict: 'file_key' },
        );
      if (error) fail('add file', error);
    },
    async removeFiles(ids) {
      const { error } = await db.from('files').delete().in('id', ids);
      if (error) fail('remove files', error);
    },
    async readerCount(hash) {
      const { count, error } = await db
        .from('books')
        .select('user_id', { count: 'exact', head: true })
        .eq('book_hash', hash)
        .eq('shelf', 'public')
        .is('deleted_at', null);
      if (error) fail('count readers', error);
      return count ?? 0;
    },
  };
};

export const createBucketObjectStore = (): ObjectStore => ({
  async copy(from, to) {
    await copyObject(from, to);
  },
  async remove(key) {
    await deleteObject(key);
  },
});

/** A display name for "Shared by", never an email address. */
export const createShelfNameLookup = () => {
  const db = createSupabaseAdminClient();
  return async (userId: string): Promise<string | null> => {
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error || !data.user) return null;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const name = [meta['full_name'], meta['name'], meta['display_name']].find(
      (v): v is string => typeof v === 'string' && !!v.trim(),
    );
    return name ? name.trim().split(/\s+/)[0]! : null;
  };
};

export const createShelfDeps = (caller: { id: string; email?: string | null }): ShelfDeps => {
  const admins = createSupabaseAdminStore();
  return {
    store: createSupabaseShelfStore(),
    objects: createBucketObjectStore(),
    limits: getShelfLimits(process.env),
    // Only the caller's own admin status is ever asked.
    isAdmin: (userId) =>
      isAdmin(admins, userId === caller.id ? caller : { id: userId }, getRootAdminsSetting()),
    now: () => new Date(),
  };
};
