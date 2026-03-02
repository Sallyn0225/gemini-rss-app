# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server on port 3000
npm run build      # Production build
npm run preview    # Preview production build locally
```

No test runner is configured. Drizzle migrations are managed via `drizzle.config.ts` and the `DATABASE_URL` env var.

## Architecture

This is a **React 19 + Vite SPA** with **Vercel Functions** as the serverless backend and **Neon PostgreSQL** (via Drizzle ORM) for persistence.

### Key principle
All user preferences and API keys are stored **client-side only** (localStorage + IndexedDB). The backend handles RSS fetching, media proxying, and article history — never user credentials.

### Frontend

- **`App.tsx`** — top-level orchestrator: route parsing, feed fetching/caching, article deduplication, AI workflow
- **`lib/AppContext.tsx`** — global React Context for dark mode, sidebar state, feed configs, AI settings; persisted to localStorage
- **`services/rssService.ts`** — RSS fetching, media URL handling with dual proxy/direct modes (`ImageProxyMode`)
- **`services/geminiService.ts`** — AI translation, classification, summarization via Google GenAI SDK
- **`types.ts`** — canonical type definitions (`Article`, `Feed`, `MediaUrl`, `AISettings`, `ArticleCategory`)

### Backend (Vercel Functions in `api/`)

| File | Purpose |
|------|---------|
| `api/feed.ts` | Fetch a single RSS feed |
| `api/feeds.ts` | Feed CRUD + admin management (requires `ADMIN_SECRET`) |
| `api/history.ts` | Article history sync |
| `api/media/proxy.ts` | Secure media proxy with SSRF protection, domain whitelist, size limits |

### Database (`db/`)

- `db/schema.ts` — Drizzle schema: `feeds` table and `history` table
- `db/index.ts` — Neon serverless client setup
- Indexes: `feed_id + pub_date`; unique constraints on `guid/link` per feed

### Security layer (`lib/security.ts`, `lib/http.ts`)

SSRF protection is enforced on all outbound requests: URL validation, private IP detection, DNS rebinding prevention, domain whitelist. Do not bypass these checks when adding new proxy or fetch functionality.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `ADMIN_SECRET` | Yes | Protects feed write operations |
| `MEDIA_PROXY_MAX_BYTES` | No | Max proxied media size (default 50 MB) |

## Path Alias

`@/` maps to the project root (configured in both `vite.config.ts` and `tsconfig.json`).
