# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server on port 3000
npm run build      # Production build
npm run preview    # Preview production build locally

# Cloudflare Pages
npm run preview:cf            # Build + local CF Pages dev server
npm run deploy:cf             # Build + deploy to CF Pages
npm run db:generate:d1        # Generate D1 (SQLite) migrations
npm run db:migrate:d1:local   # Apply D1 migrations locally
npm run db:migrate:d1:remote  # Apply D1 migrations to production
```

No test runner is configured. Drizzle migrations are managed via `drizzle.config.ts` (Neon PG) and `drizzle.d1.config.ts` (D1 SQLite).

## Architecture

This is a **React 19 + Vite SPA** with two supported deployment targets:

1. **Vercel Functions** + **Neon PostgreSQL** (backend in `api/` + `lib/`)
2. **Cloudflare Pages Functions** + **D1 SQLite / Neon PG** (backend in `functions/` + `server/`)

### Key principle
All user preferences and API keys are stored **client-side only** (localStorage + IndexedDB). The backend handles RSS fetching, media proxying, and article history — never user credentials.

### Frontend

- **`App.tsx`** — top-level orchestrator: route parsing, feed fetching/caching, article deduplication, AI workflow
- **`lib/AppContext.tsx`** — global React Context for dark mode, sidebar state, feed configs, AI settings; persisted to localStorage
- **`services/rssService.ts`** — RSS fetching, media URL handling with dual proxy/direct modes (`ImageProxyMode`)
- **`services/geminiService.ts`** — AI translation, classification, summarization via Google GenAI SDK
- **`types.ts`** — canonical type definitions (`Article`, `Feed`, `MediaUrl`, `AISettings`, `ArticleCategory`)

### Backend — Vercel (legacy, `api/`)

| File | Purpose |
|------|---------|
| `api/feed.ts` | Fetch a single RSS feed |
| `api/feeds.ts` | Feed CRUD + admin management (requires `ADMIN_SECRET`) |
| `api/history.ts` | Article history sync |
| `api/media/proxy.ts` | Secure media proxy with SSRF protection, domain whitelist, size limits |

### Backend — Cloudflare Pages (`functions/` + `server/`)

Platform-agnostic shared logic lives in `server/`, thin CF wrappers in `functions/`.

| Directory | Purpose |
|-----------|---------|
| `server/handlers/` | Core request handlers (return Web API `Response`) |
| `server/db/` | Dual database support: D1 (SQLite) + Neon PG, Repository pattern |
| `server/security.ts` | Platform-agnostic SSRF/security (no Node.js deps) |
| `server/http.ts` | `secureFetch()` + `streamWithSizeLimit()` |
| `server/rate-limit.ts` | KV-backed distributed rate limiting with in-memory fallback |
| `server/env.ts` | Cloudflare bindings type definition |
| `functions/_middleware.ts` | CORS + security headers + error boundary |
| `functions/api/` | Thin wrappers that wire CF context → shared handlers |

### Database

**Vercel path:** `db/schema.ts` + `db/index.ts` — Neon serverless client

**Cloudflare path:** Dual-database factory in `server/db/client.ts`:
- `server/db/schema.d1.ts` — D1/SQLite schema
- `server/db/schema.pg.ts` — PostgreSQL schema (copy of `db/schema.ts`)
- `server/db/repository.ts` — Unified Repository with internal routing by `DbClient.type`

Priority: D1 binding (`env.DB`) → Neon PG (`env.DATABASE_URL`)

Indexes: `feed_id + pub_date`; unique constraints on `guid/link` per feed.

### Security layer

**Vercel:** `lib/security.ts` + `lib/http.ts` — SSRF via DNS resolution + private IP check.

**Cloudflare:** `server/security.ts` + `server/http.ts` — CF Workers `fetch()` automatically blocks private IPs; no DNS resolution needed. Uses regex for IP validation instead of Node.js `net.isIP()`.

Do not bypass security checks when adding new proxy or fetch functionality.

## Environment Variables

### Vercel

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `ADMIN_SECRET` | Yes | Protects feed write operations |
| `MEDIA_PROXY_MAX_BYTES` | No | Max proxied media size (default 50 MB) |

### Cloudflare (configured in `wrangler.toml` + secrets)

| Binding/Secret | Type | Purpose |
|----------------|------|---------|
| `DB` | D1 binding | SQLite database (preferred) |
| `DATABASE_URL` | Secret | Neon PG fallback (optional if D1 is set) |
| `ADMIN_SECRET` | Secret | Protects feed write operations |
| `RATE_LIMIT_KV` | KV binding | Distributed rate limiting |
| `MEDIA_PROXY_MAX_BYTES` | Secret | Max proxied media size (default 50 MB) |

## Path Alias

`@/` maps to the project root (configured in both `vite.config.ts` and `tsconfig.json`).
