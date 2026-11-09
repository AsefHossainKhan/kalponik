# Kalponik

A private, self-hosted reading stack: a Readest fork (web + Android) on a free
hosted Supabase project, with book files on the home server, all at
`asroy.duckdns.org/kalponik`.

| Start here | |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Current status, decisions and working rules (also for Claude sessions) |
| [docs/PLAN.md](docs/PLAN.md) | The plan and its decisions log |
| [docs/DEV-SETUP.md](docs/DEV-SETUP.md) | From a fresh clone to a working local setup |
| [docs/SUPABASE.md](docs/SUPABASE.md) | Creating the Supabase project and applying the schema |

Layout:

```
main branch (this checkout)
├── deploy/local/      Garage + nginx for local testing (mirrors production routes)
├── supabase/          apply-schema.sh: Readest's schema → hosted Supabase
└── docs/
reader branch          the Readest fork (check out as ../kalponik-reader)
```
