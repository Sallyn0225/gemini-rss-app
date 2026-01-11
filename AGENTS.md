# Agentic Development Guidelines - Gemini RSS Translator

This document provides essential information for AI coding agents to operate effectively in this repository.

## 🛠 Build & Development Commands

This project targets **Serverless (Vercel + Neon)** for production.

### Setup
- `npm install`: Install dependencies.

### Development
- `npm run dev`: Start the Vite development server (usually at `http://localhost:5173`).
- `vercel dev`: Start Vercel development environment with serverless functions.

### Build
- `npm run build`: Build the frontend for production (output to `dist/`).
- `npm run vercel-build`: Build command used by Vercel.

### Testing & Linting
- There are currently no automated tests or linters configured in `package.json`. 
- **Manual Verification**: Verify frontend changes by running `npm run build` to ensure no TypeScript or Vite build errors.

---

## 🏗️ Architecture Overview

### Serverless Architecture (Current)

```
┌─────────────────┐
│  Vercel CDN     │  ← Static frontend (React + Vite)
└────────┬────────┘
         │
┌────────▼────────────────────────┐
│  Vercel Functions (/api/*.ts)   │  ← Serverless API endpoints
└────────┬────────────────────────┘
         │
┌────────▼────────┐
│  Neon PostgreSQL │  ← Serverless database
└─────────────────┘
```

**Key Components:**
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **API Layer**: Vercel Functions (Node.js runtime)
- **Database**: Neon PostgreSQL with Drizzle ORM
- **Security**: SSRF protection, rate limiting, domain whitelisting

---

## 🎨 Code Style & Conventions

### ⚛️ React & Frontend
- **Framework**: React 19 with TypeScript.
- **Styling**: Tailwind CSS (Utility-first). Use standard Tailwind classes.
- **Animations**: `framer-motion`. Prefer using constants from `components/animations.tsx`.
- **Icons**: Use inline SVGs (Lucide style) or heroicons.
- **Components**: 
  - Functional components with `React.FC` or standard function declarations.
  - Use `useCallback` and `useMemo` for performance optimization in complex components.
  - Files located in `components/`.

### 📘 TypeScript
- **Strictness**: Follow `tsconfig.json` settings. Avoid `any` at all costs.
- **Types**: Centralized in `types.ts`. Import from there when possible.
- **Interfaces**: Prefer `interface` for props and public APIs, `type` for unions/aliases.
- **Enums**: Use `enum` for fixed categories (e.g., `ArticleCategory`, `Language`).
- **Media Utilities**: Use `selectMediaUrl`, `buildProxiedUrl`, and `createMediaUrl` from `types.ts` for handling dual-URL media.

### 🔌 Backend (Serverless Functions)
- **Runtime**: Node.js 20.x (Vercel default)
- **Framework**: `@vercel/node` for type definitions
- **Database**: Neon PostgreSQL with Drizzle ORM
- **ORM**: Drizzle (lightweight, serverless-friendly)
- **API Style**: Vercel Functions in `/api` directory
- **File Naming**: Use `.ts` extension for TypeScript functions
- **Security**: 
  - SSRF protection via `lib/security.ts`
  - Rate limiting for media proxy
  - Domain whitelisting for allowed media hosts
  - Admin secret validation for protected routes

### 📂 Directory Structure
- `components/`: React UI components.
- `services/`: API and business logic (e.g., `geminiService.ts`, `rssService.ts`).
- `api/`: Vercel Functions (serverless API endpoints).
- `db/`: Drizzle schema and database connection.
- `lib/`: Shared serverless utilities (security, HTTP helpers).
- `scripts/`: Migration and maintenance scripts.
- `dist/`: Build output.
- `types.ts`: Shared TypeScript definitions.
- `vercel.json`: Vercel routing and build config.
- `drizzle.config.ts`: Drizzle ORM configuration.

### 📝 Naming Conventions
- **Files**: PascalCase for components (`ArticleCard.tsx`), camelCase for utilities/services (`rssService.ts`).
- **Variables/Functions**: camelCase.
- **Constants**: SCREAMING_SNAKE_CASE for global constants.

### 🚨 Error Handling
- **Frontend**: Use `try/catch` for API calls. Display user-friendly error messages (e.g., `setImgError(true)`).
- **Backend**: Always check `res.headersSent` before sending error responses. Log errors with descriptive prefixes like `[Server Error]`.

---

## ⚙️ Environment Variables

The application uses different sets of environment variables for the frontend (Vite) and backend (Node.js).

### Frontend (Build-time)
- `GEMINI_API_KEY`: Fallback API key for Gemini. Loaded via `loadEnv` in `vite.config.ts`.
- `process.env.API_KEY`: Alias for `GEMINI_API_KEY` in the frontend code.

### Backend (Runtime)
- `DATABASE_URL`: Neon PostgreSQL connection string (required).
- `ADMIN_SECRET`: Required for administrative API endpoints (`/api/feeds/*`).
- `UPSTREAM_PROXY`: HTTP/HTTPS proxy for fetching external RSS/Media resources (optional).
- `MEDIA_PROXY_MAX_BYTES`: Max size for proxied media (default: 50MB).
- `MEDIA_PROXY_MAX_REQUESTS`: Rate limit for media proxy (default: 120 req/min).

---

## 💾 Data Persistence

This project stores data in **Neon PostgreSQL**:
- `feeds` table: RSS feed configuration (replaces `feeds.json`).
- `history` table: Article history (replaces SQLite `history.db`).

See `db/schema.ts` for the canonical schema.

---

## 🧩 Common Development Patterns

### 🔄 Dual Media URL Handling
Always use the `MediaUrl` interface for images and videos. The system supports three proxy modes (`all`, `media_only`, `none`).
```typescript
// Example usage in components
const imageUrl = selectMediaUrl(article.thumbnail, userSettings.imageProxyMode);
```

### 🤖 AI Workflow
AI tasks are handled in `services/geminiService.ts`. Users can configure different providers (OpenAI/Gemini) for different tasks (Translation, Summary, Analysis).

### 🔒 Security Checks
When adding new backend endpoints that fetch external content:
1. **Validate URL**: Use `safeParseUrl`.
2. **SSRF Protection**: Use `resolveAndValidateHost` to ensure the target is not a private/loopback IP.
3. **Protocol Check**: Only allow `http:` and `https:`.

---

## 🤖 Interaction Rules
- **Localization**: UI text is primarily in **Simplified Chinese**. Maintain this for user-facing strings.
- **Privacy**: Never log or hardcode `ADMIN_SECRET` or API keys.
- **Performance**: Be mindful of media proxying overhead. Implement caching where appropriate.
- **Git**: Follow conventional commits if possible. Do not commit secrets (e.g., `.env`, API keys).
