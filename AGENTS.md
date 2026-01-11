# Agentic Development Guidelines - Gemini RSS Translator

This document provides essential information for AI coding agents to operate effectively in this repository.

## 🛠 Build & Development Commands

This project uses **Vite** for the frontend and a custom **Node.js** server for the backend.

### Setup
- `npm install`: Install dependencies.

### Development
- `npm run dev`: Start the Vite development server (usually at `http://localhost:5173`).
- `node server.js`: Start the backend server (usually at `http://localhost:3000`).
  - *Note:* In development, you may need to set `ADMIN_SECRET` environment variable for management APIs.

### Build
- `npm run build`: Build the frontend for production (output to `dist/`).
- `docker-compose up --build`: Build and start the entire stack using Docker.

### Testing & Linting
- There are currently no automated tests or linters configured in `package.json`. 
- **Manual Verification**: Verify frontend changes by running `npm run build` to ensure no TypeScript or Vite build errors.

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

### 🔌 Backend (Node.js)
- **Runtime**: CommonJS (as per `package.json` `"type": "commonjs"`). Use `require()`.
- **Database**: `better-sqlite3`. Database file located at `data/history.db`.
- **API Style**: Vanilla `http` module. No Express. Handle routing via `req.url` parsing in `server.js`.
- **Security**: 
  - Use `ADMIN_SECRET` for protected routes.
  - Validate all incoming URLs for SSRF/private IP protection (see `isPrivateIp` in `server.js`).
  - Check `allowedMediaHosts` white-list for media proxying.

### 📂 Directory Structure
- `components/`: React UI components.
- `services/`: API and business logic (e.g., `geminiService.ts`, `rssService.ts`).
- `data/`: Persistent data (SQLite DB, feeds JSON). **Do not commit contents of this folder.**
- `dist/`: Build output.
- `types.ts`: Shared TypeScript definitions.
- `server.js`: The primary backend entry point.
- `proxyUtils.js`: Network/proxy utility functions.

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
- `PORT`: Server port (default: 3000).
- `ADMIN_SECRET`: Required for administrative API endpoints (`/api/feeds/*`).
- `UPSTREAM_PROXY`: HTTP/HTTPS proxy for fetching external RSS/Media resources (e.g., `http://127.0.0.1:7890`).
- `MEDIA_PROXY_MAX_BYTES`: Max size for proxied media (default: 50MB).
- `MEDIA_PROXY_MAX_REQUESTS`: Rate limit for media proxy (default: 120 req/min).

---

## 💾 Data Persistence

This project manages two main data files in the `data/` directory:
1. `feeds.json`: Stores the configuration of all subscribed RSS feeds.
2. `history.db`: A SQLite database managed by `better-sqlite3` for storing article history and AI-generated metadata.

### Database Schema (`history` table)
- `feedId` (TEXT): ID of the source feed.
- `guid` (TEXT): Unique identifier for the article.
- `pubDate` (TEXT): Publication date in ISO format.
- `aiCategory` (TEXT): AI-classified category.
- `content` / `description` (TEXT): Article body.

---

## 🚢 Docker Deployment

The `Dockerfile` is a multi-stage build:
1. **Frontend Build**: Uses Node to run `npm run build`.
2. **Production Runtime**: Uses a lightweight Node image to serve the `dist/` folder and run `server.js`.

### Commands
- `docker-compose up -d`: Run in detached mode.
- `docker-compose logs -f`: Stream logs.
- `docker-compose down`: Stop and remove containers.

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
- **Git**: Follow conventional commits if possible. Do not commit `data/` directory contents.
