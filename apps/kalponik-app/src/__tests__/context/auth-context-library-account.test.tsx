// @vitest-environment happy-dom
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';

vi.mock('@/utils/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      refreshSession: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('posthog-js', () => ({
  default: { identify: vi.fn() },
}));

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useLibraryStore } from '@/store/libraryStore';
import { getLocalBooksSubdir, resetLibraryAccountCache } from '@/services/libraryAccount';
import type { Book } from '@/types/book';

const ALICE = '11111111-2222-4333-8444-555555555555';
const BOB = '99999999-8888-4777-8666-555555555555';

const book = { hash: 'h1', title: 'Middlemarch', format: 'EPUB' } as Book;

describe('signing in as another account switches the library', () => {
  beforeEach(() => {
    localStorage.clear();
    resetLibraryAccountCache();
    useLibraryStore.getState().clearLibrary();
  });
  afterEach(() => cleanup());

  test("the next account doesn't see the previous account's books", () => {
    let auth: ReturnType<typeof useAuth> | null = null;
    const Probe = () => {
      auth = useAuth();
      return null;
    };
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    act(() => auth!.login('t1', { id: ALICE } as User));
    useLibraryStore.getState().setLibrary([book]);
    expect(getLocalBooksSubdir()).toBe('Kalponik/Books');

    act(() => auth!.login('t2', { id: BOB } as User));
    expect(getLocalBooksSubdir()).toBe(`Kalponik/Accounts/${BOB}/Books`);
    expect(useLibraryStore.getState().library).toEqual([]);
    expect(useLibraryStore.getState().libraryLoaded).toBe(false);
  });

  test('signing in again as the same account keeps the library in memory', () => {
    let auth: ReturnType<typeof useAuth> | null = null;
    const Probe = () => {
      auth = useAuth();
      return null;
    };
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    act(() => auth!.login('t1', { id: ALICE } as User));
    useLibraryStore.getState().setLibrary([book]);
    act(() => auth!.login('t3', { id: ALICE } as User));
    expect(useLibraryStore.getState().library).toHaveLength(1);
  });
});
