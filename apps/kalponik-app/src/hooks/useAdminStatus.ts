'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getAPIBaseUrl } from '@/services/environment';
import {
  type AdminStatus,
  applyAdminCheck,
  checkAdminStatus,
  readCachedAdminStatus,
} from '@/libs/adminStatus';

const getStorage = () => (typeof window === 'undefined' ? null : window.localStorage);

/**
 * Whether the signed-in account is an admin, and how many access requests
 * wait. Starts from the answer saved on this device (so it shows offline),
 * then asks the server.
 */
export const useAdminStatus = (): AdminStatus => {
  const { token, user } = useAuth();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<AdminStatus | null>(() =>
    userId ? readCachedAdminStatus(getStorage(), userId) : null,
  );

  useEffect(() => {
    if (!userId) {
      setStatus(null);
      return;
    }
    const cached = readCachedAdminStatus(getStorage(), userId);
    setStatus(cached);
    if (!token) return;
    let cancelled = false;
    void checkAdminStatus(getAPIBaseUrl(), token).then((check) => {
      if (!cancelled) setStatus(applyAdminCheck(getStorage(), userId, cached, check));
    });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  return status ?? { isAdmin: false, pending: 0 };
};
