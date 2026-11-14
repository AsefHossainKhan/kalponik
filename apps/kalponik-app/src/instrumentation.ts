// Next.js calls register() once when the server starts. Kalponik uses it to
// keep the free Supabase project awake (src/libs/supabaseKeepAlive.ts). It only
// runs on the Node.js production server: not in `next dev`, the edge runtime,
// or the static export the apps are built from.
export async function register() {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;
  const marker = Symbol.for('kalponik.keepalive.started');
  const g = globalThis as Record<symbol, unknown>;
  if (g[marker]) return;
  g[marker] = true;

  const { startKeepAlive } = await import('@/libs/supabaseKeepAlive');
  startKeepAlive(process.env, {
    fetch: globalThis.fetch,
    now: Date.now,
    log: (line) => console.log(line),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    setInterval: (fn, ms) => setInterval(fn, ms),
  });
}
