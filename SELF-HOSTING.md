# Host your own Kalponik

Kalponik is invite-only: the copy its maintainer runs is for friends and
family. If you'd like to use it and don't know them, run your own copy. This
guide sets up the same stack on your own server, for $0 in hosting fees.

```
browser / Android app
   │  https://kalponik.example.com/                  → kalponik-web    (Next.js, at the root)
   │  https://kalponik.example.com/kalponik-books/... → kalponik-garage (Garage S3 API, bucket = path)
   │  https://<ref>.supabase.co                      → Supabase: accounts + reading data (free tier)
   ▼
your server: reverse proxy (TLS) ──Docker network──► kalponik-web, kalponik-garage
```

- **Supabase** (hosted) holds accounts and reading data: progress,
  highlights, notes, settings.
- **Garage**, a small S3-compatible store, holds the book files on your own
  disk. It idles at a few MB of RAM.
- **kalponik-web** is the web app and the API the Android app talks to.

Everything in this guide lives in [`deploy/prod/`](deploy/prod) and
[`supabase/`](supabase).

## Contents

1. [What you need](#1-what-you-need)
2. [Supabase](#2-supabase)
3. [Configure the server's `.env`](#3-configure-the-servers-env)
4. [Build the web image](#4-build-the-web-image)
5. [Start the stack and set up Garage](#5-start-the-stack-and-set-up-garage)
6. [Reverse proxy routes](#6-reverse-proxy-routes)
7. [Check it and sign in](#7-check-it-and-sign-in)
8. [Email (optional)](#8-email-optional)
9. [Your own Android APK](#9-your-own-android-apk)
10. [Running it](#10-running-it)
11. [License: offer the source](#11-license-offer-the-source)

## 1. What you need

- **A Linux server with Docker** and Docker Compose v2. About 1.5 GB of free
  RAM is plenty (the compose file caps the web app at 1 GB and Garage at
  512 MB), plus disk space for your books.
- **A (sub)domain name** for Kalponik, pointing at it. A free
  [DuckDNS](https://www.duckdns.org) name works, and its subdomains do too:
  `kalponik.your-domain.duckdns.org`. The app is served at the root of that
  host and the book files under `/kalponik-books/` on the same host. (To share
  one host with other things instead, build with a base path such as
  `/kalponik`; see [§4](#4-build-the-web-image).)
- **A reverse proxy with TLS** on that server, for example nginx with a
  Let's Encrypt certificate. The examples here are nginx; Caddy or Traefik
  work too if they forward paths unchanged (see [§6](#6-reverse-proxy-routes)).
- **A free [Supabase](https://supabase.com) project.** No card needed.
- **A PC to build on** with Git, Docker, Node 24 and pnpm. The web image is
  built there, not on the server: a Next.js build wants more memory than a
  small server has. For the Android app you also need the Rust, Java 17 and
  Android SDK/NDK toolchains (see [§9](#9-your-own-android-apk)).

Get the code, with submodules:

```bash
git clone --recurse-submodules https://github.com/AsefHossainKhan/kalponik.git
cd kalponik
```

On Windows, use Git Bash, turn on Developer Mode (Tauri uses symlinks) and run
`git config --global core.longpaths true` before cloning.

## 2. Supabase

### 2.1 Create the project

1. Sign up at supabase.com and pick the **Free** plan.
2. **New project**: any name, a strong database password (save it; the
   schema step needs it), and the region closest to you.
3. Collect these from the dashboard:

| Value | Where | Goes into |
|---|---|---|
| Project URL `https://<ref>.supabase.co` | Project Settings > API, or **Connect** | `SUPABASE_URL` |
| `anon` key | Project Settings > API Keys > **Legacy API keys** | `SUPABASE_ANON_KEY` |
| `service_role` key (secret) | same tab | `SUPABASE_ADMIN_KEY` |
| Session pooler connection string | **Connect** > Connection string > *Session pooler* | `SUPABASE_DB_URL`, schema step only |

Use the **legacy** JWT keys (`anon`, `service_role`), not the newer
`sb_publishable_…` / `sb_secret_…` ones: the app is built around the JWT keys.

A free project **pauses when it sees too little database activity over a
week**. The web server keeps it awake by itself; see [§10](#10-running-it).

### 2.2 Apply the database schema

From the repo root, with Docker running:

```bash
SUPABASE_DB_URL='postgresql://postgres.<ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
  sh supabase/apply-schema.sh
```

- Use the **Session pooler** string (port 5432). The direct connection is
  IPv6-only on the free tier, and the transaction pooler (port 6543) breaks
  `CREATE INDEX CONCURRENTLY`.
- Single-quote the URL, and URL-encode special characters in the password.
- psql runs from the official `postgres` Docker image; nothing is installed.
- It ends with `schema: done (N files recorded)`. Re-running is safe: it
  records what it applied in `kalponik_meta.migrations` and skips those, so
  run it again whenever you update to a version with new migrations.
- **Don't paste the schema into the SQL editor.** One migration can't run
  inside a transaction, which is how the editor runs everything.

### 2.3 Auth settings

**Authentication > Sign In / Providers**

- **Email:** on. Turn **Confirm email** off: Kalponik verifies addresses
  itself (see [§8](#8-email-optional)).
- **Allow new users to sign up: off.** Kalponik creates accounts itself, for
  people an admin approves or invites; this switch stops anyone signing up
  around it.
- **Allow manual linking: on.** The account page's "Link Google sign-in"
  needs it.

**Authentication > URL Configuration**

- **Site URL:** `https://kalponik.your-domain.duckdns.org`
- **Redirect URLs:** add
  - `https://kalponik.your-domain.duckdns.org/**`
  - `kalponik://auth-callback` (the Android app's sign-in callback; use your
    own scheme if you change it)
  - for local development, `http://localhost:47811/**`

**Google sign-in (optional)**

1. In [Google Cloud Console](https://console.cloud.google.com), create an
   OAuth client of type *Web application*. Authorized redirect URI:
   `https://<ref>.supabase.co/auth/v1/callback`. Publish the consent screen so
   it works for accounts other than test users.
2. In Supabase, **Authentication > Sign In / Providers > Google**: turn it on
   and paste the client id and secret.

With sign-up off, Google sign-in never creates accounts: an unknown Google
address is refused, and a Google address that matches an approved account
signs in to it. Other people link Google from their account page.

**SMTP:** see [§8](#8-email-optional); Supabase sends the password-reset
email through it.

## 3. Configure the server's `.env`

Copy the stack to the server. For example, from the repo root on your PC:

```bash
ssh you@your-server 'mkdir -p ~/kalponik'
scp deploy/prod/compose.yaml deploy/prod/garage.toml deploy/prod/init-garage.sh \
    deploy/prod/check.sh deploy/prod/.env.example deploy/prod/nginx-vhost.conf \
    you@your-server:~/kalponik/
```

On the server:

```bash
cd ~/kalponik
cp .env.example .env && chmod 600 .env
```

Generate the Garage secrets and the S3 key there (Garage insists on this key
shape):

```bash
echo "GARAGE_RPC_SECRET=$(openssl rand -hex 32)"
echo "GARAGE_ADMIN_TOKEN=$(openssl rand -base64 32 | tr -d '=+/')"
echo "S3_ACCESS_KEY_ID=GK$(openssl rand -hex 12)"
echo "S3_SECRET_ACCESS_KEY=$(openssl rand -hex 32)"
```

Then fill in `.env`. Every key:

| Key | What it is |
|---|---|
| `KALPONIK_PUBLIC_ORIGIN` | Kalponik's public origin, no path or trailing slash: `https://kalponik.your-domain.duckdns.org`. The app is served at the root of it, and book URLs are signed against this origin. |
| `NGINX_PROXY_NETWORK` | The Docker network your reverse proxy container is on, so it can reach the two Kalponik containers by name. Find it with `docker inspect <proxy> --format '{{json .NetworkSettings.Networks}}'`, or create one with `docker network create proxy` and attach the proxy to it. If your proxy runs on the host, set any existing network and use the `127.0.0.1` ports instead ([§6](#6-reverse-proxy-routes)). |
| `SUPABASE_URL` | `https://<ref>.supabase.co`. |
| `SUPABASE_ANON_KEY` | The legacy `anon` key. Public by design: it's handed to browsers, and row-level security protects the data. |
| `SUPABASE_ADMIN_KEY` | The legacy `service_role` key. **Secret**: full database access. It stays on the server; never put it in an app build. |
| `KALPONIK_ADMINS` | The root admin(s): comma-separated emails or Supabase user ids. They can always open `/admin` to approve access requests, make invite links and add more admins, and can't be removed from the app. Required. |
| `KALPONIK_SMTP_USER` | The email account Kalponik sends from. Empty = no email at all. See [§8](#8-email-optional). |
| `KALPONIK_SMTP_PASS` | That account's password (for Gmail, an app password). Empty = no email. |
| `KALPONIK_SMTP_HOST` | Optional, default `smtp.gmail.com`. |
| `KALPONIK_SMTP_PORT` | Optional, default `465` (TLS from the start); `587` uses STARTTLS. |
| `KALPONIK_MAIL_FROM` | Optional sender line, default `Kalponik <KALPONIK_SMTP_USER>`, e.g. `"Kalponik <you@example.com>"`. |
| `GARAGE_RPC_SECRET` | Garage's internal secret, 64 hex chars. |
| `GARAGE_ADMIN_TOKEN` | Token for Garage's admin API, any long random string. |
| `S3_ACCESS_KEY_ID` | The S3 key the web app uses: `GK` + 24 hex chars. `init-garage.sh` imports it into Garage. |
| `S3_SECRET_ACCESS_KEY` | Its secret, 64 hex chars. |
| `S3_BUCKET_NAME` | Default `kalponik-books`. It is also the public URL path, so if you change it, change the proxy location to match. |
| `S3_REGION` | Default `garage`; must equal `s3_region` in `garage.toml`. |
| `GARAGE_DATA_DIR` | Host folder for the book files. Put it on a disk with room. Docker creates it on the first start. |
| `GARAGE_META_DIR` | Host folder for Garage's small metadata database, default `./data/garage-meta`. |
| `GARAGE_CAPACITY` | How much space Garage may use on that disk, e.g. `100G`. |
| `STORAGE_FIXED_QUOTA` | Per-user storage quota shown in the app, in bytes (default 100 GiB). |
| `KALPONIK_KEEPALIVE` | Optional, default on. `off` stops the Supabase keep-awake ping ([§10](#10-running-it)). |
| `KALPONIK_KEEPALIVE_INTERVAL_HOURS` | Optional, hours between keep-awake pings, default `24` (1 to 576). |
| `KALPONIK_WEB_PORT` | Host port for the web app, bound to `127.0.0.1` only (default `47811`). Used by `check.sh` and host-mode proxies. |
| `KALPONIK_S3_PORT` | Host port for Garage's S3 API, `127.0.0.1` only (default `47812`). |
| `KALPONIK_WEB_IMAGE` | The image to run, default `kalponik-web:latest`. Pin a dated tag from [§4](#4-build-the-web-image) to make rollbacks easy. |

## 4. Build the web image

On your PC, from the repo root:

```bash
sh deploy/prod/build-web-image.sh
```

It builds the app to be served at the root of its host and writes
`deploy/prod/dist/kalponik-web-<date>-<commit>.tar.gz`. Nothing else is baked
in: Supabase, S3 and the public origin are read at runtime from the server's
`.env` (the browser gets them from `/runtime-config.js`), so one image works
for any domain.

To serve it under a sub-path of a shared host instead, bake the base path in:
`KALPONIK_BASE_PATH=/kalponik sh deploy/prod/build-web-image.sh`. Then the
app is at `<origin>/kalponik`, `API_BASE_URL` in `compose.yaml` needs
`/kalponik` appended, and the proxy routes `/kalponik` (no trailing slash:
Next.js redirects `/kalponik/` to `/kalponik`) instead of `/`.

Copy it over and load it:

```bash
scp deploy/prod/dist/kalponik-web-*.tar.gz you@your-server:~/kalponik/
ssh you@your-server 'cd ~/kalponik && gunzip -c kalponik-web-*.tar.gz | docker load'
```

## 5. Start the stack and set up Garage

On the server, in the stack's folder:

```bash
docker compose up -d
docker compose ps
sh init-garage.sh
```

`init-garage.sh` is safe to re-run. It:

1. gives the single Garage node its storage (`GARAGE_CAPACITY`),
2. imports the S3 key from `.env`,
3. creates the bucket and allows the key read/write on it,
4. sets the bucket's **CORS** rule. The web and Android apps upload and
   download with presigned URLs straight from the browser or webview, which
   are cross-origin requests; without the rule Garage answers the preflight
   with 403. Any origin is allowed, because every request still needs a valid
   signature.

## 6. Reverse proxy routes

[`deploy/prod/nginx-vhost.conf`](deploy/prod/nginx-vhost.conf) is a
complete virtual host for Kalponik's subdomain. Set its `server_name` and
certificate paths, put it in your proxy's `conf.d`, then check and reload:

```bash
docker exec <proxy> nginx -t && docker exec <proxy> nginx -s reload
```

In short, it holds two locations:

```nginx
location /kalponik-books/ {               # book files → Garage
    resolver 127.0.0.11 valid=30s;        # Docker's DNS
    set $kalponik_s3 kalponik-garage:3900;
    proxy_pass http://$kalponik_s3;       # no URI: path forwarded as sent
    proxy_set_header Host $http_host;     # keep the original Host
    client_max_body_size 1g;
    proxy_request_buffering off;
    proxy_buffering off;
    # … timeouts, see the file
}

location / {                              # web app
    resolver 127.0.0.11 valid=30s;
    set $kalponik_web kalponik-web:3000;
    proxy_pass http://$kalponik_web;
    proxy_set_header Host $http_host;
    client_max_body_size 64m;
    # … websocket headers and timeouts, see the file
}
```

If nginx runs on the host rather than in Docker, drop the `resolver` and `set`
lines and use `proxy_pass http://127.0.0.1:47812;` and
`proxy_pass http://127.0.0.1:47811;` (still with no URI after the port).

Two details matter:

- **`/kalponik-books/` is the longer prefix**, so it wins over `/` for book
  files.
- **Why path-style S3 signing works through the proxy.** The web app signs
  book URLs path-style against `KALPONIK_PUBLIC_ORIGIN`, so a book is at
  `https://kalponik.your-domain/kalponik-books/<key>?X-Amz-Signature=…`: the bucket
  name *is* the path. The signature covers the Host header and the path. As
  long as the proxy forwards the path unchanged (no URI in `proxy_pass`, no
  rewrite) and passes the original `Host`, Garage sees exactly the request
  that was signed, and the signature checks out. Garage has no `root_domain`
  set, so it only does path-style, and books need no subdomain of their own. Server
  side, the web app talks to Garage directly at `http://garage:3900`.

With Caddy or Traefik, the same rules apply: forward `/kalponik-books/` and `/` without
stripping them, and keep the `Host` header.

## 7. Check it and sign in

```bash
sh check.sh
```

The `containers` group checks the web app and Garage on `127.0.0.1`; the
`public` group goes through your proxy and TLS. Everything should say `ok`.

Then create your own account. Requests need an admin's approval, so the first
admin account is made by hand:

1. Supabase: **Authentication > Users > Add user > Create new user**, with the
   address you put in `KALPONIK_ADMINS` and a password, and tick
   **Auto Confirm User**.
2. Open `https://kalponik.your-domain.duckdns.org/` and sign in with it. The
   library menu now has an **Admin** item.
3. Upload a book and open it. Then invite others from the admin page.

How sign-up works for everyone else:

- **Request access:** email, password, a note. The account is created at
  once, locked, and a verification link is emailed. It unlocks when the email
  is verified *and* an admin approves (either order); then the person gets a
  "your account is ready" email. Declining deletes the locked account.
- **Invite links** (admin page): the person picks an email and password; the
  account unlocks once the email is verified.
- **Without email set up**, addresses are taken as given: requests wait only
  for approval, and invite links unlock at once.

## 8. Email (optional)

Kalponik sends verification links, "your account is ready", and, for admins
who turn it on, "someone asked for access". Supabase sends password resets.
Both can go through one free Gmail account:

1. Make a Gmail account for your instance and turn on
   [2-Step Verification](https://myaccount.google.com/security).
2. Create an [app password](https://myaccount.google.com/apppasswords).
   Google shows 16 letters once.
3. Server `.env`: `KALPONIK_SMTP_USER=<the address>`,
   `KALPONIK_SMTP_PASS=<the 16 letters>`, then `docker compose up -d`.
4. Supabase: **Authentication > Emails > SMTP Settings**, enable custom SMTP:
   host `smtp.gmail.com`, port `465`, the same username and app password,
   sender email the same address, sender name `Kalponik`. Raise
   **Authentication > Rate Limits** for emails if you like.
5. Test: request access with an address you own, and try "Forgot your
   password?". Check spam the first time.

Gmail allows about 500 emails a day. Any other SMTP server works too; set
`KALPONIK_SMTP_HOST` and `KALPONIK_SMTP_PORT`. Supabase's built-in mailer only
reaches members of your Supabase team, so set up SMTP before inviting anyone.

## 9. Your own Android APK

The Android app has the backend URL and Supabase keys baked in at build time,
so you build your own. Give it **your own signing key** and **your own
application id**, so it doesn't collide with other people's builds of
Kalponik on the same phone.

### 9.1 Application id and links

- `apps/kalponik-app/src-tauri/tauri.conf.json`: `"identifier"`.
- `apps/kalponik-app/src-tauri/gen/android/app/build.gradle.kts`:
  `applicationId` (the `namespace` and Kotlin package can stay).
- `apps/kalponik-app/public/.well-known/assetlinks.json`: `package_name`
  and your key's SHA-256 fingerprint, if you want verified app links.
- `apps/kalponik-app/src/libs/inviteMail.ts`: the APK download link in invite
  emails points at this repository's releases; point it at yours.

### 9.2 Signing key

Make one keystore and keep it outside the repo, backed up. Every update must
be signed with the same key, or Android refuses to install it over the old
one:

```bash
keytool -genkeypair -v -keystore ~/kalponik-release.jks -alias kalponik \
  -keyalg RSA -keysize 4096 -validity 10000
```

Use the same password for the store and the key (the Gradle config reads one
`password`). The build reads it from
`apps/kalponik-app/src-tauri/gen/android/keystore.properties` (git-ignored):

```properties
keyAlias=kalponik
password=<your keystore password>
storeFile=/absolute/path/to/kalponik-release.jks
```

### 9.3 Build

In `apps/kalponik-app`, create `.env.local` (git-ignored) with:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<legacy anon key>
NEXT_PUBLIC_SELF_HOSTED=true
NEXT_PUBLIC_API_BASE_URL=https://kalponik.your-domain.duckdns.org
NEXT_PUBLIC_NODE_BASE_URL=https://kalponik.your-domain.duckdns.org
```

Never put the `service_role` key in an app build. Then:

```bash
pnpm install
pnpm --filter @kalponik/kalponik-app setup-vendors
cd apps/kalponik-app
# first time only: generate the Android project, then restore the tracked files
rm -rf src-tauri/gen/android
pnpm tauri android init --ci
git checkout -- src-tauri
node scripts/copy-android-icons.mjs
cp ~/keystore.properties src-tauri/gen/android/keystore.properties
npx dotenv -e .env.tauri -- pnpm tauri android build --apk -t aarch64
```

`git checkout -- src-tauri` puts back the committed versions of the tracked
Android files, so commit your [§9.1](#91-application-id-and-links) changes
before running it. The APK lands in
`src-tauri/gen/android/app/build/outputs/apk/universal/release/`. Install it
with `adb install -r <apk>` or by copying it to the phone.

### 9.4 Or let GitHub build it

[`.github/workflows/kalponik-android.yml`](.github/workflows/kalponik-android.yml)
builds and attaches the signed APK when a release tagged `kalponik-vX.Y.Z` is
published. In your fork, change its `PUBLIC_URL` to your instance and add
these repository secrets:

| Secret | Value |
|---|---|
| `KALPONIK_KEYSTORE_BASE64` | `base64 -w0 kalponik-release.jks` |
| `KALPONIK_KEYSTORE_PASSWORD` | the keystore password |
| `KALPONIK_KEY_ALIAS` | the key alias |
| `KALPONIK_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `KALPONIK_SUPABASE_ANON_KEY` | the legacy `anon` key |

The tag sets the version, and each tag must be higher than the last.

## 10. Running it

- **Keep Supabase awake.** Supabase pauses a free project that gets too little
  database activity over a week; its
  [docs](https://supabase.com/docs/guides/platform/free-project-pausing) say a
  few requests a day is typically enough. The web container does this itself,
  with no host cron: a minute after it starts, and then every 24 hours, it reads
  one row through Supabase's REST API with the service key and logs one line:

  ```
  docker logs kalponik-web 2>&1 | grep keepalive
  [keepalive] on: first ping in 60 s, then every 24 h
  [keepalive] supabase ping ok (200, 143 ms)
  ```

  It stops whenever the `web` container stops. Set
  `KALPONIK_KEEPALIVE=off` to turn it off, or
  `KALPONIK_KEEPALIVE_INTERVAL_HOURS` to change the interval (see
  [§3](#3-configure-the-servers-env)), then `docker compose up -d`. If you
  had the old `curl` cron job from an earlier version of this guide, remove it.

- **Backups.** Back up `GARAGE_DATA_DIR` and `GARAGE_META_DIR` together (the
  books and Garage's index of them). The free Supabase tier has no
  downloadable backups; use `pg_dump` with the session pooler URL.
- **Update the web app:** pull, build a new image ([§4](#4-build-the-web-image)),
  `docker load` it, set `KALPONIK_WEB_IMAGE` to the new tag, `docker compose up -d`.
  Run `supabase/apply-schema.sh` first if the update adds migrations.
- **Update the Android app:** build with the same key and a higher version,
  and install over the old one.
- **If the data disk is remounted**, restart Garage
  (`docker compose restart garage`): a running container keeps its view of
  the old mount, and downloads come back empty.

## 11. License: offer the source

Kalponik is a fork of [Readest](https://github.com/readest/readest) and, like
it, is licensed under the [GNU AGPL-3.0](LICENSE). If you run Kalponik for
other people, including a modified copy, the AGPL requires you to offer them
the source code of the version you run. The app's About dialog and footer
link to the source (`SOURCE_CODE_URL` in
`apps/kalponik-app/src/utils/legal.ts`); if you change the code, point it at
your own public fork and keep that fork current.
