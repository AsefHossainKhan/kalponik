import { withBasePath } from '@/utils/basePath';

// Kalponik's own privacy policy, the public page at /privacy. Google's OAuth
// consent screen links to it too, so it must stay reachable without signing in.
export const PRIVACY_PATH = '/privacy';

/**
 * Where the Privacy Policy link goes. The web app links within the site; the
 * Android/desktop app has no site of its own, so it opens the live web page
 * (`webBaseUrl` is the web app's URL, e.g. https://asroy.duckdns.org/kalponik).
 */
export const privacyPolicyUrl = (isTauri: boolean, webBaseUrl: string): string =>
  isTauri ? `${webBaseUrl.replace(/\/+$/, '')}${PRIVACY_PATH}` : withBasePath(PRIVACY_PATH);
