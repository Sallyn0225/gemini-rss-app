# API KNOWLEDGE BASE

**Generated:** Sun Jan 11 2026
**Commit:** 19ff07e
**Branch:** vercel-neon-refactor

## OVERVIEW
Vercel Serverless Functions for RSS aggregation, media proxying, and feed management with Neon PostgreSQL.

## STRUCTURE
```
api/
├── feeds.ts         # Feed CRUD operations (add/update/delete/reorder)
├── feed.ts          # RSS feed fetching with SSRF protection
├── history.ts       # Historical article storage with rate limiting
└── media/
    └── proxy.ts     # SSRF-protected media proxy (50MB limit)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Media Proxying | `media/proxy.ts` | Domain whitelist, streamWithSizeLimit, 50MB cap |
| Feed Management | `feeds.ts` | Requires ADMIN_SECRET header for write ops |
| History Storage | `history.ts` | Rate-limited (30 req/60s), 60-day auto-delete |
| SSRF Protection | `feed.ts`, `media/proxy.ts` | Uses resolveAndValidateHost from lib/security.ts |

## CONVENTIONS
- **CORS Headers**: Always set `Access-Control-Allow-Origin: *`, handle OPTIONS preflight
- **Error Handling**: Check `res.headersSent` before sending error responses
- **Logging**: Prefix server errors with `[Server Error]` (e.g., `[Server Error] [Media Proxy]`)
- **SSRF Protection**: Always use `resolveAndValidateHost` before fetching external resources
- **Rate Limiting**: IP-based rate limiting for write operations (history upsert: 30 req/60s)
- **DB Operations**: `neon-http` driver does NOT support transactions; use sequential updates

## ANTI-PATTERNS
- **DO NOT** skip `streamWithSizeLimit` when proxying media; enforce 50MB limit
- **DO NOT** send error responses without checking `res.headersSent` first
- **DO NOT** allow media proxying without validating domain against whitelist
- **DO NOT** use transactions with `neon-http`; sequential updates are required
- **DO NOT** write operations without ADMIN_SECRET validation