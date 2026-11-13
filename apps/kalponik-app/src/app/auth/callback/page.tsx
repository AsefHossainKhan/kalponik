'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { handleAuthCallback, parseOAuthCallbackUrl } from '@/helpers/auth';

export default function AuthCallback() {
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    // Tokens come in the fragment; `next` (e.g. back to the account page
    // after linking Google) and some errors come in the query string.
    const { accessToken, refreshToken, type, next, error, errorCode, errorDescription } =
      parseOAuthCallbackUrl(window.location.href);

    handleAuthCallback({
      accessToken,
      refreshToken,
      type,
      // Only a path in this app: never send a fresh session elsewhere.
      next: next && next.startsWith('/') && !next.startsWith('//') ? next : '/',
      error,
      errorCode,
      errorDescription,
      login,
      navigate: router.push,
    });
  }, [login, router]);

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center'>
      <span className='loading loading-infinity loading-xl w-20' />
    </div>
  );
}
