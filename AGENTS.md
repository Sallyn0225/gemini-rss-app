# PROJECT KNOWLEDGE BASE

**Generated:** Sun Jan 11 2026
**Commit:** 19ff07e
**Branch:** vercel-neon-refactor

## OVERVIEW
Gemini RSS Translator: A React 19 + Vercel Serverless application for RSS aggregation, AI translation, and media proxying with Neon PostgreSQL.

## STRUCTURE
```
.
├── api/             # Vercel Serverless Functions (Backend)
├── components/      # React UI Components (Frontend)
├── db/              # Drizzle ORM Schema & Migrations
├── lib/             # Shared Security & HTTP Utilities
├── services/        # Business Logic (Gemini AI, RSS Processing)
├── scripts/         # Maintenance & Migration Scripts (migrate-to-neon.cjs)
├── App.tsx          # Main Application Orchestrator
├── index.tsx        # Frontend Entry Point
└── types.ts         # Shared TypeScript Definitions
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| UI / Styling | `components/`, `App.tsx` | Tailwind CSS + Framer Motion |
| API / Backend | `api/` | Vercel Node.js functions |
| DB Schema | `db/schema.ts` | Managed via Drizzle Kit |
| Security / SSRF | `lib/security.ts` | DNS-rebinding & private IP protection |
| AI Prompting | `services/geminiService.ts` | Translation & Analysis logic |

## CONVENTIONS
- **Serverless-First**: Backend resides in `/api`, follows Vercel function signature.
- **Flat Source**: Frontend source files (`App.tsx`, `index.tsx`) live in the root, not `/src`.
- **Media Architecture**: Use `MediaUrl` interface; backend provides dual (original/proxied) URLs.
- **Localization**: UI text is primarily **Simplified Chinese**.
- **State Management**: Local state/Context + `IndexedDB` (via `idb-keyval`) for large data; no Redux/Zustand.

## ANTI-PATTERNS (THIS PROJECT)
- **DO NOT** use `any` in TypeScript; strictly follow `tsconfig.json`.
- **DO NOT** log or hardcode `ADMIN_SECRET` or API keys.
- **DO NOT** commit `.env` or secrets.
- **NEVER** use raw `<img>` tags without `selectMediaUrl` utility.
- **DO NOT** refactor backend security without unit-testing SSRF safeguards.

## UNIQUE STYLES
- **Animations**: Standardized Material-like ease (`easeStandard [0.4, 0, 0.2, 1]`) via `components/animations.tsx`.
- **Styling**: Flat UI aesthetic using custom `accent` and `flat` palettes.

## COMMANDS
```bash
npm install        # Setup
npm run dev        # Local Vite dev server
vercel dev         # Full environment (Vercel + Local API)
npm run build      # Frontend build verification
npx drizzle-kit push # Sync DB schema to Neon
```

## NOTES
- **SSRF Shield**: `api/feed.ts` and `api/media/proxy.ts` use `resolveAndValidateHost` to block internal network access.
- **DB Transactions**: `neon-http` does not support transactions; multi-write operations are sequential.
- **Cache Policy**: RSS feeds use `s-maxage` (10m) edge caching.
- **Performance**:
  - High-frequency UI states (e.g., `pullDistance`) are localized to sub-components.
  - Large data (e.g., `read_articles`) is stored in IndexedDB to avoid main-thread blocking.
  - Core dependencies are bundled locally to optimize LCP.
