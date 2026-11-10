// Kalponik: the web app is served under a sub-path (https://host/kalponik),
// not at the site root. Next.js prefixes its own routes and `_next` assets
// with `basePath`, but not plain strings: files from `public/`, hand-written
// `fetch('/api/...')` calls, `<Image src='/...'>` and the like. Wrap those in
// `withBasePath`.
//
// `NEXT_PUBLIC_BASE_PATH` is set by next.config.mjs and is always '' for the
// Tauri (Android/desktop) build, whose static export lives at the root.
export const BASE_PATH = process.env['NEXT_PUBLIC_BASE_PATH'] ?? '';

export const withBasePath = (path: string): string =>
  BASE_PATH && path.startsWith('/') && !path.startsWith('//') ? `${BASE_PATH}${path}` : path;

// The reverse: `window.location.pathname` includes the base path, but the
// router (`router.push`) and route checks like `startsWith('/reader')` expect
// app paths without it. Passing the raw pathname to `router.push` gives
// /kalponik/kalponik/...
export const stripBasePath = (pathname: string): string =>
  BASE_PATH && (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`))
    ? pathname.slice(BASE_PATH.length) || '/'
    : pathname;

export const getAppPathname = (): string =>
  typeof window === 'undefined' ? '' : stripBasePath(window.location.pathname);
