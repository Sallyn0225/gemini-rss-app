# API KNOWLEDGE BASE

**Generated:** Sun Jan 11 2026
**Commit:** 19ff07e
**Branch:** vercel-neon-refactor

## OVERVIEW
Vercel Serverless Functions for RSS aggregation, media proxying, and feed management with Neon PostgreSQL.

## STRUCTURE
```
api/
├── feeds/          # Feed CRUD operations
│   ├── manage.ts   # Add/delete/update/reorder (requires ADMIN_SECRET)
│   └── list.ts     # List feeds (admin endpoint via vercel.json routing)
├── history/        # Historical article storage
│   ├── upsert.ts   # Insert/update history with 60-day auto-delete
│   └── get.ts      # Query history with pagination
├── media/          # Media proxying
│   └── proxy.ts    # SSRF-protected media proxy (50MB limit)
└── feed.ts         # RSS feed fetching endpoint
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Media Proxying | `media/proxy.ts` | SSRF protection, domain whitelist, streamWithSizeLimit |
| Feed Management | `feeds/manage.ts` | Requires ADMIN_SECRET header |
| History Storage | `history/upsert.ts` | Rate-limited, 60-day auto-delete |
| Routing Config | `vercel.json` | Custom action routing for feeds |
| Security Utils | `lib/security.ts` | IP validation, admin secret, domain inference |

## CONVENTIONS
- **CORS Headers**: Always set `Access-Control-Allow-Origin: *` and handle OPTIONS
- **Error Handling**: Check `res.headersSent` before sending error responses
- **Logging**: Prefix all server errors with `[Server Error]` (e.g., `[Server Error] [Media Proxy]`)
- **SSRF Protection**: Always use `resolveAndValidateHost` from `lib/security.ts` before fetching external resources
- **Rate Limiting**: Implement IP-based rate limiting for write operations (e.g., `history/upsert.ts` uses 30 req/60s window)
- **DB Transactions**: `neon-http` driver does NOT support transactions; use sequential updates

## ANTI-PATTERNS
- **DO NOT** return raw media URLs from feed endpoints; always use `MediaUrl` interface with dual `original`/`proxied` URLs
- **DO NOT** send error responses without checking `res.headersSent` first
- **DO NOT** skip `streamWithSizeLimit` when proxying media; enforce 50MB limit
- **DO NOT** use transactions with `neon-http`; sequential updates are required
- **DO NOT** allow media proxying without validating the domain against the whitelist