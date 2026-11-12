'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { requiresSignIn, signInUrlFor } from '@/utils/signInGate';

// Kalponik: sends anyone without a signed-in account to the sign-in page
// before the library, reader or account pages render (see utils/signInGate).
// The account comes from the session saved on this device, so this works
// offline too.
export default function SignInGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const blocked = !user && requiresSignIn(pathname);

  useEffect(() => {
    if (!blocked || !pathname) return;
    router.replace(signInUrlFor(pathname, window.location.search));
  }, [blocked, pathname, router]);

  if (blocked) return null;
  return <>{children}</>;
}
