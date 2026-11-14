// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { Book } from '@/types/book';
import type { DBBook } from '@/types/records';
import { transformBookFromDB, transformBookToDB } from '@/utils/transform';

const db = vi.hoisted(() => ({
  book: null as DBBook | null,
  writes: [] as DBBook[],
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: async () => ({ user: { id: 'test-user' }, token: 'test-token' }),
}));
vi.mock('@/utils/supabase', () => ({
  createSupabaseClient: () => ({
    from: () => ({
      select: () => ({ or: async () => ({ data: db.book ? [db.book] : [], error: null }) }),
      upsert: (rows: DBBook[]) => {
        db.writes.push(...rows);
        db.book = rows[0] ?? null;
        return { select: async () => ({ data: rows, error: null }) };
      },
    }),
  }),
}));

import { POST } from '@/pages/api/sync';

const push = (book: Partial<Book>) =>
  POST(
    new Request('https://example.com/api/sync', {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        books: [{ hash: 'h', format: 'EPUB', title: 'T', author: 'A', updatedAt: 5, ...book }],
      }),
    }) as unknown as NextRequest,
  );

beforeEach(() => {
  db.book = {
    user_id: 'test-user',
    book_hash: 'h',
    format: 'EPUB',
    title: 'T',
    author: 'A',
    shelf: 'public',
    updated_at: new Date(2).toISOString(),
  };
  db.writes = [];
});

describe('public shelf column in sync', () => {
  it('keeps the shelf the server set when a newer device push has none', async () => {
    const response = await push({ progress: [10, 100] });
    expect(response.status).toBe(200);
    expect(db.writes).toHaveLength(1);
    expect(db.book?.shelf).toBe('public');
  });

  it('a private book is pushed without the column, so older servers accept it', () => {
    const row = transformBookToDB({ hash: 'h', format: 'EPUB', title: 'T', author: 'A' }, 'u');
    expect('shelf' in row).toBe(false);
    const pub = transformBookToDB(
      { hash: 'h', format: 'EPUB', title: 'T', author: 'A', shelf: 'public' },
      'u',
    );
    expect(pub.shelf).toBe('public');
  });

  it('a pulled row taken off the shelf clears the local public mark', () => {
    const local = { hash: 'h', title: 'T', shelf: 'public' } as Book;
    const pulled = transformBookFromDB({ ...db.book!, shelf: null, created_at: '2026-01-01' });
    expect({ ...local, ...pulled }.shelf).toBeUndefined();
    const legacy = transformBookFromDB({
      user_id: 'u',
      book_hash: 'h',
      format: 'EPUB',
      title: 'T',
      author: 'A',
      created_at: '2026-01-01',
    });
    expect('shelf' in legacy).toBe(false);
  });
});
