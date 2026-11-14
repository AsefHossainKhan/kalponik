// Kalponik: keep a free Supabase project awake.
//
// Supabase pauses a free project that gets too little database activity over
// a week ("a few user requests to the database each day" is typically enough,
// per https://supabase.com/docs/guides/platform/free-project-pausing). The web
// server runs this timer itself (started from src/instrumentation.ts), so it
// stops whenever the server stops, and no host crontab is needed.
//
// Each ping is one small read through PostgREST that really runs a query:
// GET /rest/v1/books?select=book_hash&limit=1 with the server's service key.
// The response body is thrown away and only the status and timing are logged;
// the URL's keys and headers never reach the log.
//
// Settings (server env):
//   KALPONIK_KEEPALIVE                 "off" / "false" / "0" turns it off (on by default)
//   KALPONIK_KEEPALIVE_INTERVAL_HOURS  hours between pings (default 24)

export const DEFAULT_INTERVAL_HOURS = 24;
// setInterval can't wait longer than 2^31-1 ms (about 24.8 days).
export const MAX_INTERVAL_HOURS = 24 * 24;
export const MIN_INTERVAL_HOURS = 1;
// The first ping waits a little after start, so a crash-looping container
// doesn't hammer Supabase.
export const FIRST_PING_DELAY_MS = 60 * 1000;
export const PING_TIMEOUT_MS = 20 * 1000;
const PING_PATH = '/rest/v1/books?select=book_hash&limit=1';

const HOUR_MS = 60 * 60 * 1000;

export type KeepAliveConfig =
  | { enabled: false; reason: string }
  | { enabled: true; url: string; key: string; intervalMs: number };

type Env = Record<string, string | undefined>;

const isOff = (value: string | undefined) =>
  ['off', 'false', '0', 'no'].includes((value ?? '').trim().toLowerCase());

export const parseIntervalHours = (value: string | undefined): number => {
  const hours = Number((value ?? '').trim());
  if (!value?.trim() || !Number.isFinite(hours) || hours <= 0) return DEFAULT_INTERVAL_HOURS;
  return Math.min(MAX_INTERVAL_HOURS, Math.max(MIN_INTERVAL_HOURS, hours));
};

export const readKeepAliveConfig = (env: Env): KeepAliveConfig => {
  if (isOff(env['KALPONIK_KEEPALIVE'])) return { enabled: false, reason: 'turned off' };
  const url = (env['SUPABASE_URL'] || env['NEXT_PUBLIC_SUPABASE_URL'] || '').trim();
  const key = (env['SUPABASE_ADMIN_KEY'] || '').trim();
  if (!url || !key) return { enabled: false, reason: 'no SUPABASE_URL or SUPABASE_ADMIN_KEY' };
  return {
    enabled: true,
    url: url.replace(/\/+$/, ''),
    key,
    intervalMs: parseIntervalHours(env['KALPONIK_KEEPALIVE_INTERVAL_HOURS']) * HOUR_MS,
  };
};

export type PingDeps = {
  fetch: typeof fetch;
  now: () => number;
  log: (line: string) => void;
};

export type PingResult = { ok: boolean; status?: number; ms: number };

export const pingSupabase = async (
  config: { url: string; key: string },
  deps: PingDeps,
): Promise<PingResult> => {
  const start = deps.now();
  try {
    const res = await deps.fetch(`${config.url}${PING_PATH}`, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    // Drain and drop the body (at most one row hash).
    await res.text().catch(() => '');
    const ms = deps.now() - start;
    deps.log(
      res.ok
        ? `[keepalive] supabase ping ok (${res.status}, ${ms} ms)`
        : `[keepalive] supabase ping failed (${res.status}, ${ms} ms)`,
    );
    return { ok: res.ok, status: res.status, ms };
  } catch (error) {
    const ms = deps.now() - start;
    const reason = error instanceof Error ? error.name : 'error';
    deps.log(`[keepalive] supabase ping failed (${reason}, ${ms} ms)`);
    return { ok: false, ms };
  }
};

export type TimerDeps = PingDeps & {
  setTimeout: (fn: () => void, ms: number) => { unref?: () => void };
  setInterval: (fn: () => void, ms: number) => { unref?: () => void };
};

// Pings once shortly after start, then every interval. Timers are unref'd so
// they never keep the process alive on their own. Returns false when off.
export const startKeepAlive = (env: Env, deps: TimerDeps): boolean => {
  const config = readKeepAliveConfig(env);
  if (!config.enabled) {
    deps.log(`[keepalive] off (${config.reason})`);
    return false;
  }
  const ping = () => void pingSupabase(config, deps);
  const hours = Math.round((config.intervalMs / HOUR_MS) * 100) / 100;
  deps.log(`[keepalive] on: first ping in ${FIRST_PING_DELAY_MS / 1000} s, then every ${hours} h`);
  deps.setTimeout(ping, FIRST_PING_DELAY_MS).unref?.();
  deps.setInterval(ping, config.intervalMs).unref?.();
  return true;
};
