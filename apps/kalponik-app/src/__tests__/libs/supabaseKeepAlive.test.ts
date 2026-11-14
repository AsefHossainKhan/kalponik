// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INTERVAL_HOURS,
  FIRST_PING_DELAY_MS,
  MAX_INTERVAL_HOURS,
  parseIntervalHours,
  pingSupabase,
  readKeepAliveConfig,
  startKeepAlive,
  type TimerDeps,
} from '@/libs/supabaseKeepAlive';

// The web server keeps the free Supabase project awake with one small
// database read per interval (a day by default), so the project never pauses
// for inactivity. These cover the settings, the request it sends, and that
// secrets never reach the log.

const HOUR = 60 * 60 * 1000;
const URL = 'https://ref.supabase.co';
const KEY = 'service-role-secret';
const ENV = { SUPABASE_URL: URL, SUPABASE_ADMIN_KEY: KEY };

type Call = { url: string; init?: RequestInit };

const fakeDeps = (respond: () => Promise<Response>) => {
  const calls: Call[] = [];
  const logs: string[] = [];
  const timeouts: { fn: () => void; ms: number }[] = [];
  const intervals: { fn: () => void; ms: number }[] = [];
  let t = 1000;
  const deps: TimerDeps = {
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      t += 42;
      return respond();
    }) as typeof fetch,
    now: () => t,
    log: (line) => logs.push(line),
    setTimeout: (fn, ms) => {
      timeouts.push({ fn, ms });
      return { unref: () => {} };
    },
    setInterval: (fn, ms) => {
      intervals.push({ fn, ms });
      return { unref: () => {} };
    },
  };
  return { deps, calls, logs, timeouts, intervals };
};

const ok = () => Promise.resolve(new Response('[{"book_hash":"abc"}]', { status: 200 }));

describe('readKeepAliveConfig', () => {
  it('is on by default with a one-day interval', () => {
    const config = readKeepAliveConfig(ENV);
    expect(config).toEqual({ enabled: true, url: URL, key: KEY, intervalMs: 24 * HOUR });
    expect(DEFAULT_INTERVAL_HOURS).toBe(24);
  });

  it('turns off with KALPONIK_KEEPALIVE=off, false, 0 or no', () => {
    for (const value of ['off', 'OFF', 'false', '0', 'no', ' off ']) {
      expect(readKeepAliveConfig({ ...ENV, KALPONIK_KEEPALIVE: value }).enabled).toBe(false);
    }
    expect(readKeepAliveConfig({ ...ENV, KALPONIK_KEEPALIVE: 'on' }).enabled).toBe(true);
  });

  it('stays off without a Supabase URL or service key', () => {
    expect(readKeepAliveConfig({ SUPABASE_URL: URL }).enabled).toBe(false);
    expect(readKeepAliveConfig({ SUPABASE_ADMIN_KEY: KEY }).enabled).toBe(false);
  });

  it('drops a trailing slash from the URL', () => {
    const config = readKeepAliveConfig({ ...ENV, SUPABASE_URL: `${URL}/` });
    expect(config.enabled && config.url).toBe(URL);
  });

  it('reads the interval in hours and keeps it in range', () => {
    expect(parseIntervalHours('72')).toBe(72);
    expect(parseIntervalHours('0.5')).toBe(1);
    expect(parseIntervalHours('100000')).toBe(MAX_INTERVAL_HOURS);
    expect(parseIntervalHours('')).toBe(24);
    expect(parseIntervalHours(undefined)).toBe(24);
    expect(parseIntervalHours('abc')).toBe(24);
    expect(parseIntervalHours('-5')).toBe(24);
    // setInterval's limit is 2^31-1 ms.
    expect(MAX_INTERVAL_HOURS * HOUR).toBeLessThan(2 ** 31);
    const config = readKeepAliveConfig({ ...ENV, KALPONIK_KEEPALIVE_INTERVAL_HOURS: '72' });
    expect(config.enabled && config.intervalMs).toBe(72 * HOUR);
  });
});

describe('pingSupabase', () => {
  it('reads one row through PostgREST with the service key', async () => {
    const { deps, calls } = fakeDeps(ok);
    const result = await pingSupabase({ url: URL, key: KEY }, deps);
    expect(result).toEqual({ ok: true, status: 200, ms: 42 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${URL}/rest/v1/books?select=book_hash&limit=1`);
    expect(calls[0]!.init?.method ?? 'GET').toBe('GET');
    expect(calls[0]!.init?.headers).toEqual({ apikey: KEY, Authorization: `Bearer ${KEY}` });
  });

  it('logs one line per ping with the result and no secrets or data', async () => {
    const { deps, logs } = fakeDeps(ok);
    await pingSupabase({ url: URL, key: KEY }, deps);
    expect(logs).toEqual(['[keepalive] supabase ping ok (200, 42 ms)']);
    for (const line of logs) {
      expect(line).not.toContain(KEY);
      expect(line).not.toContain('ref.supabase.co');
      expect(line).not.toContain('abc');
    }
  });

  it('logs an HTTP error status as a failure', async () => {
    const { deps, logs } = fakeDeps(() =>
      Promise.resolve(new Response('{"message":"paused"}', { status: 540 })),
    );
    const result = await pingSupabase({ url: URL, key: KEY }, deps);
    expect(result.ok).toBe(false);
    expect(logs).toEqual(['[keepalive] supabase ping failed (540, 42 ms)']);
  });

  it('logs a network error by name only and never throws', async () => {
    const { deps, logs } = fakeDeps(() =>
      Promise.reject(new TypeError(`fetch failed for ${URL} with ${KEY}`)),
    );
    const result = await pingSupabase({ url: URL, key: KEY }, deps);
    expect(result.ok).toBe(false);
    expect(logs).toEqual(['[keepalive] supabase ping failed (TypeError, 42 ms)']);
  });
});

describe('startKeepAlive', () => {
  it('pings a minute after start, then every interval', async () => {
    const { deps, calls, timeouts, intervals, logs } = fakeDeps(ok);
    expect(startKeepAlive({ ...ENV, KALPONIK_KEEPALIVE_INTERVAL_HOURS: '72' }, deps)).toBe(true);
    expect(logs[0]).toBe('[keepalive] on: first ping in 60 s, then every 72 h');
    expect(timeouts.map((t) => t.ms)).toEqual([FIRST_PING_DELAY_MS]);
    expect(intervals.map((t) => t.ms)).toEqual([72 * HOUR]);
    expect(calls).toHaveLength(0);

    timeouts[0]!.fn();
    intervals[0]!.fn();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(2);
  });

  it('starts no timers when turned off, and says so once', () => {
    const { deps, timeouts, intervals, logs } = fakeDeps(ok);
    expect(startKeepAlive({ ...ENV, KALPONIK_KEEPALIVE: 'off' }, deps)).toBe(false);
    expect(timeouts).toHaveLength(0);
    expect(intervals).toHaveLength(0);
    expect(logs).toEqual(['[keepalive] off (turned off)']);
  });
});
