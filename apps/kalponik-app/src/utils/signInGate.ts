// Kalponik: everyone signs in before using the app. The library, reader and
// account pages need a signed-in account; the pages that get someone signed in
// (sign-in, invites, access requests, OAuth returns) and the public link
// landing pages don't.
//
// "Signed in" means a session saved on this device, so going offline keeps
// you in: progress is saved locally and syncs when you're back online. Only
// signing out, or the server refusing the session once online, ends it.

const SIGNED_IN_ROUTES = ['/library', '/reader', '/player', '/opds', '/user', '/admin', '/send'];

const matchesRoute = (pathname: string, route: string) =>
  pathname === route || pathname.startsWith(`${route}/`);

/** Whether this page (path without the base path) needs a signed-in account. */
export const requiresSignIn = (pathname: string | null | undefined): boolean => {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '') return true;
  return SIGNED_IN_ROUTES.some((route) => matchesRoute(path, route));
};

/** The sign-in page URL that comes back to `pathname` + `search` afterwards. */
export const signInUrlFor = (pathname: string, search = ''): string => {
  const target = `${pathname}${search}`;
  if (target === '/' || target === '') return '/auth';
  return `/auth?redirect=${encodeURIComponent(target)}`;
};
