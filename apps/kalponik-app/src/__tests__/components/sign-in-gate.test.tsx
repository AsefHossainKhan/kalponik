import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const replace = vi.fn();
let pathname = '/library';
let user: { id: string } | null = null;

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace, push: vi.fn() }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user }),
}));

import SignInGate from '@/components/SignInGate';

afterEach(() => {
  cleanup();
  replace.mockClear();
});

describe('SignInGate', () => {
  it('sends a signed-out visitor from the library to sign in, showing nothing', () => {
    pathname = '/library';
    user = null;
    render(
      <SignInGate>
        <div>shelf</div>
      </SignInGate>,
    );
    expect(screen.queryByText('shelf')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/auth?redirect=%2Flibrary');
  });

  it('shows the library to a signed-in account, even offline', () => {
    pathname = '/library';
    user = { id: 'u1' };
    render(
      <SignInGate>
        <div>shelf</div>
      </SignInGate>,
    );
    expect(screen.getByText('shelf')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('leaves the sign-in and request pages open when signed out', () => {
    user = null;
    for (const path of ['/auth', '/request-access', '/join']) {
      pathname = path;
      render(
        <SignInGate>
          <div>{path}</div>
        </SignInGate>,
      );
      expect(screen.getByText(path)).toBeTruthy();
    }
    expect(replace).not.toHaveBeenCalled();
  });
});
