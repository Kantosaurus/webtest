# VirusTotal + Gemini Scanner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Frontend phases (10–14) MUST additionally invoke `impeccable:impeccable` before any visual/interactive work.** **Commit messages MUST NOT contain any reference to Claude, Anthropic, "Co-Authored-By: Claude ...", or any AI-attribution trailer.**

**Goal:** Ship a containerized web app on EC2 that lets authenticated users upload files, scans them via VirusTotal, streams results via SSE, and lets users chat with Gemini about the results — all auto-deployed through GitHub Actions.

**Architecture:** Monorepo with two services: `api/` (Express + TypeScript) and `web/` (Next.js + React + Tailwind + Shadcn). Postgres holds users, sessions, scans, and chat messages. Caddy reverse-proxies HTTPS to `web`. All four services run under Docker Compose (and unchanged under Podman). Auto-deploy via GHA on push to `main`.

**Tech Stack:**
- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Shadcn UI, TanStack Query, react-markdown + remark-gfm + rehype-highlight, Playwright (e2e)
- **Backend:** Node.js 22, Express 4, TypeScript, `busboy`, `form-data`, `pg`, `connect-pg-simple`, `bcryptjs`, `pino`, `@google/generative-ai`, `express-rate-limit`, `node-pg-migrate`, `zod` (env validation), Vitest + Testcontainers + `msw`
- **Infra:** PostgreSQL 16, Caddy 2, Docker Compose / Podman, GitHub Actions, AWS EC2 (Ubuntu 24.04)

**Reference spec:** `docs/superpowers/specs/2026-04-23-virustotal-scanner-design.md`

**Phase list (each ends in a green commit):**
1. Repository scaffolding & tooling
2. Docker & Compose skeleton
3. Database schema & migrations
4. API bootstrap (app factory, config, logger, health)
5. API authentication
6. API file upload (streaming to VirusTotal)
7. API scan retrieval & SSE status stream
8. API chat (Gemini streaming)
9. API rate limiting & error polish
10. Web scaffolding (Next.js + Shadcn + middleware)
11. Web auth pages
12. Web dashboard (upload + history)
13. Web scan detail page
14. Web chat UI
15. E2E smoke tests (Playwright)
16. CI pipeline (GitHub Actions)
17. CD pipeline + EC2 bootstrap
18. Documentation & README

---

## File Structure (reference for all phases)

```
/
├── .github/workflows/{ci.yml, deploy.yml}
├── .gitignore, .editorconfig, .env.example
├── docker-compose.yml, Caddyfile
├── README.md                                    # rewritten in phase 18
├── docs/
│   ├── superpowers/specs/, superpowers/plans/
│   └── deployment.md                             # phase 17
├── files/                                        # existing sample files
├── scripts/{bootstrap-ec2.sh, backup-db.sh}      # phase 17
├── api/
│   ├── Dockerfile, package.json, tsconfig.json
│   ├── vitest.config.ts, .eslintrc.cjs
│   ├── src/
│   │   ├── index.ts, app.ts, config.ts, logger.ts
│   │   ├── db/pool.ts, db/types.ts
│   │   ├── middleware/{auth,error,rateLimit,requestId}.ts
│   │   ├── routes/{auth,scans,scanEvents,messages,health}.ts
│   │   ├── services/{virustotal,gemini,scans}.ts
│   │   └── lib/{hash,sse,promptBuilder,errors,sessionStore}.ts
│   ├── migrations/{001_init.sql,002_scans.sql,003_messages.sql}
│   └── tests/
│       ├── unit/{hash,promptBuilder,sse,virustotal}.test.ts
│       └── integration/{auth,scans,messages}.test.ts
└── web/
    ├── Dockerfile, package.json, next.config.mjs
    ├── tailwind.config.ts, tsconfig.json, components.json
    ├── middleware.ts
    ├── app/
    │   ├── layout.tsx, globals.css
    │   ├── (auth)/{login,register}/page.tsx
    │   └── (app)/{layout.tsx, page.tsx, scans/[id]/page.tsx}
    ├── components/
    │   ├── ui/                                  # shadcn primitives
    │   ├── auth/{LoginForm,RegisterForm}.tsx
    │   ├── upload/{UploadDropzone,ScanProgress}.tsx
    │   ├── scans/{ScansTable,ScanResult}.tsx
    │   └── chat/{ChatPanel,MessageList,MessageBubble,MarkdownRenderer,Composer,useChatStream}.{tsx,ts}
    ├── lib/{api,sse,types}.ts
    └── tests/e2e/{playwright.config.ts, smoke.spec.ts}
```

---

## Phase 1 — Repository Scaffolding & Tooling

**Goal:** Two workspaces (`api/`, `web/`) with TypeScript, ESLint, Prettier configured. Repo-wide `.gitignore`, `.editorconfig`, and `.env.example`.

### Task 1.1: Root-level files

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.env.example`
- Create: `.prettierrc`
- Create: `.prettierignore`

- [ ] **Step 1: Write `.gitignore`**

```gitignore
# deps & build
node_modules/
.next/
dist/
build/
coverage/
*.tsbuildinfo

# env
.env
.env.local
.env.*.local
!.env.example

# editor / os
.DS_Store
Thumbs.db
.vscode/*
!.vscode/extensions.json
.idea/

# tests
playwright-report/
test-results/

# logs
*.log
npm-debug.log*
```

- [ ] **Step 2: Write `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 3: Write `.env.example`**

```bash
# Postgres
POSTGRES_USER=webtest
POSTGRES_PASSWORD=change-me
POSTGRES_DB=webtest
POSTGRES_HOST=db
POSTGRES_PORT=5432

# API
API_PORT=4000
SESSION_SECRET=change-me-to-a-long-random-string
VT_API_KEY=your-virustotal-key
GEMINI_API_KEY=your-gemini-key
NODE_ENV=development
LOG_LEVEL=info

# Web
WEB_PORT=3000
NEXT_PUBLIC_API_BASE=http://localhost:4000

# Caddy (prod)
PUBLIC_HOSTNAME=webtest.example.com
ACME_EMAIL=you@example.com
```

- [ ] **Step 4: Write `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

- [ ] **Step 5: Write `.prettierignore`**

```
node_modules
dist
.next
build
coverage
*.lock
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore .editorconfig .env.example .prettierrc .prettierignore
git commit -m "chore: repo-wide tooling config"
```

### Task 1.2: API workspace scaffolding

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/.eslintrc.cjs`
- Create: `api/vitest.config.ts`
- Create: `api/src/index.ts` (minimal placeholder)

- [ ] **Step 1: Write `api/package.json`**

```json
{
  "name": "webtest-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "migrate": "node-pg-migrate -m migrations --schema public",
    "migrate:up": "npm run migrate -- up",
    "migrate:create": "npm run migrate -- create"
  },
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "bcryptjs": "^2.4.3",
    "busboy": "^1.6.0",
    "connect-pg-simple": "^9.0.1",
    "cookie-parser": "^1.4.6",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.4.0",
    "express-session": "^1.18.0",
    "form-data": "^4.0.0",
    "node-pg-migrate": "^7.6.1",
    "pg": "^8.12.0",
    "pino": "^9.3.0",
    "pino-http": "^10.2.0",
    "undici": "^6.19.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/busboy": "^1.5.4",
    "@types/cookie-parser": "^1.4.7",
    "@types/express": "^4.17.21",
    "@types/express-session": "^1.18.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.6",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^8.57.0",
    "msw": "^2.3.5",
    "pino-pretty": "^11.2.2",
    "supertest": "^7.0.0",
    "testcontainers": "^10.11.0",
    "tsx": "^4.17.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "allowJs": false,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 3: Write `api/.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: ['dist', 'node_modules', 'migrations'],
};
```

- [ ] **Step 4: Write `api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
  },
});
```

- [ ] **Step 5: Write `api/src/index.ts` (placeholder)**

```ts
console.log('api: bootstrap placeholder');
```

- [ ] **Step 6: Install dependencies**

```bash
cd api && npm install
```

Expected: `node_modules/` populated; `package-lock.json` created.

- [ ] **Step 7: Typecheck to verify tsconfig is valid**

```bash
cd api && npm run typecheck
```

Expected: exit 0 (no output).

- [ ] **Step 8: Commit**

```bash
git add api/package.json api/package-lock.json api/tsconfig.json api/.eslintrc.cjs api/vitest.config.ts api/src/index.ts
git commit -m "chore(api): scaffold express+typescript workspace"
```

### Task 1.3: Web workspace scaffolding

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.mjs`
- Create: `web/tailwind.config.ts`
- Create: `web/postcss.config.mjs`
- Create: `web/.eslintrc.cjs`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx` (placeholder)
- Create: `web/app/globals.css`

- [ ] **Step 1: Write `web/package.json`**

```json
{
  "name": "webtest-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.1",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-toast": "^1.2.1",
    "@tanstack/react-query": "^5.51.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "lucide-react": "^0.408.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^9.0.1",
    "rehype-highlight": "^7.0.0",
    "remark-gfm": "^4.0.0",
    "tailwind-merge": "^2.4.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.46.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-config-next": "^15.0.0",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.7",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Write `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.INTERNAL_API_BASE ?? 'http://api:4000'}/api/:path*` },
    ];
  },
};
export default nextConfig;
```

- [ ] **Step 4: Write `web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [animate],
};
export default config;
```

- [ ] **Step 5: Write `web/postcss.config.mjs`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 6: Write `web/.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  extends: ['next/core-web-vitals'],
};
```

- [ ] **Step 7: Write `web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
  body { @apply bg-background text-foreground; font-feature-settings: 'rlig' 1, 'calt' 1; }
}
```

- [ ] **Step 8: Write `web/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VirusTotal Scanner',
  description: 'Scan files and get AI-powered explanations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Write `web/app/page.tsx` (placeholder)**

```tsx
export default function Page() {
  return <main className="p-8">web: bootstrap placeholder</main>;
}
```

- [ ] **Step 10: Install, typecheck, build**

```bash
cd web && npm install && npm run typecheck && npm run build
```

Expected: install succeeds; typecheck exits 0; `next build` succeeds and emits `.next/`.

- [ ] **Step 11: Commit**

```bash
git add web/
git commit -m "chore(web): scaffold next.js 15 + tailwind workspace"
```

---

## Phase 2 — Docker & Compose Skeleton

**Goal:** A `docker-compose.yml` that boots `db` + `migrate` + `api` + `web` + `caddy`. Images build from per-service Dockerfiles. Works under `podman compose` unchanged.

### Task 2.1: API Dockerfile

**Files:**
- Create: `api/Dockerfile`
- Create: `api/.dockerignore`

- [ ] **Step 1: Write `api/.dockerignore`**

```
node_modules
dist
coverage
.env
.env.*
!.env.example
tests
*.log
.git
```

- [ ] **Step 2: Write `api/Dockerfile`**

```dockerfile
# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY package.json ./
USER app
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Commit**

```bash
git add api/Dockerfile api/.dockerignore
git commit -m "chore(api): add multi-stage dockerfile, non-root runtime"
```

### Task 2.2: Web Dockerfile

**Files:**
- Create: `web/Dockerfile`
- Create: `web/.dockerignore`

- [ ] **Step 1: Write `web/.dockerignore`**

```
node_modules
.next
coverage
.env
.env.*
!.env.example
tests
*.log
.git
playwright-report
test-results
```

- [ ] **Step 2: Write `web/Dockerfile`**

```dockerfile
# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
```

- [ ] **Step 3: Create empty public dir placeholder (next build requires it)**

```bash
mkdir -p web/public && touch web/public/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add web/Dockerfile web/.dockerignore web/public/.gitkeep
git commit -m "chore(web): add multi-stage dockerfile, standalone output"
```

### Task 2.3: Caddyfile

**Files:**
- Create: `Caddyfile`

- [ ] **Step 1: Write `Caddyfile`**

```
{
  email {$ACME_EMAIL}
}

{$PUBLIC_HOSTNAME} {
  encode gzip zstd
  reverse_proxy web:3000 {
    header_up Host {host}
    header_up X-Real-IP {remote}
    header_up X-Forwarded-For {remote}
    header_up X-Forwarded-Proto {scheme}
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add Caddyfile
git commit -m "chore: add caddyfile for auto-https reverse proxy"
```

### Task 2.4: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
name: webtest

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 10

  migrate:
    build: { context: ./api }
    image: webtest-api:${IMAGE_TAG:-latest}
    command: npm run migrate:up
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
    depends_on:
      db: { condition: service_healthy }
    restart: "no"

  api:
    build: { context: ./api }
    image: webtest-api:${IMAGE_TAG:-latest}
    restart: unless-stopped
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      API_PORT: 4000
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      SESSION_SECRET: ${SESSION_SECRET}
      VT_API_KEY: ${VT_API_KEY}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
    depends_on:
      db: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }

  web:
    build: { context: ./web }
    image: webtest-web:${IMAGE_TAG:-latest}
    restart: unless-stopped
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      INTERNAL_API_BASE: http://api:4000
    depends_on:
      api: { condition: service_healthy }

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      PUBLIC_HOSTNAME: ${PUBLIC_HOSTNAME:-localhost}
      ACME_EMAIL: ${ACME_EMAIL:-admin@localhost}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      web: { condition: service_healthy }

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

- [ ] **Step 2: Verify compose config parses**

```bash
cp .env.example .env
docker compose config > /dev/null
```

Expected: exit 0, no errors. Config echo silenced via `> /dev/null`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add docker-compose orchestrating db, api, web, caddy"
```

---

## Phase 3 — Database Schema & Migrations

**Goal:** Three numbered migration files that bring up the schema from spec §4. A `migrate` service in compose runs them before `api` starts.

### Task 3.1: Migration files

**Files:**
- Create: `api/migrations/001_init.sql`
- Create: `api/migrations/002_scans.sql`
- Create: `api/migrations/003_messages.sql`

- [ ] **Step 1: Write `api/migrations/001_init.sql`**

```sql
-- Up Migration
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "session" (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX session_expire_idx ON "session" (expire);

-- Down Migration
DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS users;
```

- [ ] **Step 2: Write `api/migrations/002_scans.sql`**

```sql
-- Up Migration
CREATE TABLE scans (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vt_analysis_id  TEXT UNIQUE NOT NULL,
  file_name       TEXT NOT NULL,
  file_sha256     TEXT NOT NULL,
  file_size       BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
  result          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scans_user_created_idx ON scans (user_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS scans;
```

- [ ] **Step 3: Write `api/migrations/003_messages.sql`**

```sql
-- Up Migration
CREATE TABLE messages (
  id         BIGSERIAL PRIMARY KEY,
  scan_id    BIGINT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_scan_created_idx ON messages (scan_id, created_at);

-- Down Migration
DROP TABLE IF EXISTS messages;
```

- [ ] **Step 4: Configure `node-pg-migrate` to read SQL files**

Add to `api/package.json` (the `migrate` script already exists; `node-pg-migrate` supports SQL migrations natively — no code change needed). Verify SQL file names conform to `###_name.sql` (check only: the files above do).

- [ ] **Step 5: Test migrations against a local Postgres**

```bash
cp .env.example .env
docker compose up -d db
sleep 3
cd api && DATABASE_URL="postgres://webtest:change-me@localhost:5432/webtest" npx node-pg-migrate up -m migrations
```

Expected output (last line): `Migrations complete!`

- [ ] **Step 6: Verify schema**

```bash
docker compose exec -T db psql -U webtest -d webtest -c "\dt"
```

Expected: five tables listed — `pgmigrations`, `users`, `session`, `scans`, `messages`.

- [ ] **Step 7: Tear down**

```bash
docker compose down
```

- [ ] **Step 8: Commit**

```bash
git add api/migrations
git commit -m "feat(db): initial schema for users, sessions, scans, messages"
```

---

## Phase 4 — API Bootstrap

**Goal:** Express app factory with config, logger, health endpoint, error handler, request IDs. `GET /healthz` returns 200 if DB is reachable.

### Task 4.1: Config + logger

**Files:**
- Create: `api/src/config.ts`
- Create: `api/src/logger.ts`

- [ ] **Step 1: Write `api/src/config.ts`**

```ts
import { z } from 'zod';
import 'dotenv/config';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  VT_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  PUBLIC_HOSTNAME: z.string().default('localhost'),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

export const isProd = config.NODE_ENV === 'production';
```

- [ ] **Step 2: Write `api/src/logger.ts`**

```ts
import pino from 'pino';
import { config, isProd } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.password_hash'],
    remove: true,
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add api/src/config.ts api/src/logger.ts
git commit -m "feat(api): zod-validated config and pino logger"
```

### Task 4.2: Database pool + health route

**Files:**
- Create: `api/src/db/pool.ts`
- Create: `api/src/routes/health.ts`

- [ ] **Step 1: Write `api/src/db/pool.ts`**

```ts
import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function ping(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Write `api/src/routes/health.ts`**

```ts
import { Router } from 'express';
import { ping } from '../db/pool.js';
import { logger } from '../logger.js';

export const health = Router();

health.get('/healthz', async (_req, res) => {
  try {
    await ping();
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'healthcheck failed');
    res.status(503).json({ ok: false });
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add api/src/db/pool.ts api/src/routes/health.ts
git commit -m "feat(api): pg pool and /healthz endpoint"
```

### Task 4.3: App factory + error middleware + request IDs

**Files:**
- Create: `api/src/lib/errors.ts`
- Create: `api/src/middleware/requestId.ts`
- Create: `api/src/middleware/error.ts`
- Create: `api/src/app.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Write `api/src/lib/errors.ts`**

```ts
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FILE_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'SCAN_FAILED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (msg: string, details?: unknown) => new AppError('VALIDATION_FAILED', 400, msg, details),
  unauthorized: () => new AppError('UNAUTHORIZED', 401, 'Not authenticated'),
  forbidden: () => new AppError('FORBIDDEN', 403, 'Not permitted'),
  notFound: (thing = 'Resource') => new AppError('NOT_FOUND', 404, `${thing} not found`),
  conflict: (msg: string) => new AppError('CONFLICT', 409, msg),
  tooLarge: () => new AppError('FILE_TOO_LARGE', 413, 'File exceeds 32 MB limit'),
  rateLimited: () => new AppError('RATE_LIMITED', 429, 'Too many requests'),
  scanFailed: (msg: string) => new AppError('SCAN_FAILED', 502, msg),
} as const;
```

- [ ] **Step 2: Write `api/src/middleware/requestId.ts`**

```ts
import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.requestId = typeof incoming === 'string' && incoming ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
```

- [ ] **Step 3: Write `api/src/middleware/error.ts`**

```ts
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    logger.warn({ err, reqId: req.requestId, code: err.code }, 'app error');
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  logger.error({ err, reqId: req.requestId }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
};
```

- [ ] **Step 4: Write `api/src/app.ts`**

```ts
import express from 'express';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import { logger } from './logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/error.js';
import { health } from './routes/health.js';

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(pinoHttp({ logger, customProps: (req) => ({ reqId: (req as express.Request).requestId }) }));
  app.use(cookieParser());
  app.use('/', health);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 5: Replace `api/src/index.ts`**

```ts
import { buildApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

const app = buildApp();

app.listen(config.API_PORT, () => {
  logger.info({ port: config.API_PORT }, 'api listening');
});
```

- [ ] **Step 6: Smoke-test against a local Postgres**

```bash
cp .env.example .env
# edit .env: set SESSION_SECRET to a >=32 char string, fill VT_API_KEY and GEMINI_API_KEY with "dummy" (will be validated but not used yet)
docker compose up -d db
cd api && DATABASE_URL="postgres://webtest:change-me@localhost:5432/webtest" \
  SESSION_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  VT_API_KEY=dummy GEMINI_API_KEY=dummy npm run dev &
sleep 2
curl -s http://localhost:4000/healthz
kill %1
docker compose down
```

Expected: `{"ok":true}`.

- [ ] **Step 7: Commit**

```bash
git add api/src
git commit -m "feat(api): express app factory with error handling, request ids, healthz"
```

---

## Phase 5 — API Authentication

**Goal:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. Sessions in Postgres via `connect-pg-simple`. Bcrypt password hashes. TDD discipline with integration tests using Testcontainers.

### Task 5.1: Session store + auth middleware

**Files:**
- Create: `api/src/lib/sessionStore.ts`
- Create: `api/src/middleware/auth.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write `api/src/lib/sessionStore.ts`**

```ts
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../db/pool.js';
import { config, isProd } from '../config.js';

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgStore({ pool, tableName: 'session', createTableIfMissing: false }),
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
  name: 'wt.sid',
});

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    email?: string;
  }
}
```

- [ ] **Step 2: Write `api/src/middleware/auth.ts`**

```ts
import type { RequestHandler } from 'express';
import { Errors } from '../lib/errors.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.userId) return next(Errors.unauthorized());
  next();
};
```

- [ ] **Step 3: Modify `api/src/app.ts` to register session middleware before routes**

Replace the body of `buildApp()` so the middleware order is:

```ts
import express from 'express';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import { logger } from './logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/error.js';
import { sessionMiddleware } from './lib/sessionStore.js';
import { health } from './routes/health.js';

export function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(pinoHttp({ logger, customProps: (req) => ({ reqId: (req as express.Request).requestId }) }));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  app.use(sessionMiddleware);
  app.use('/', health);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 4: Commit**

```bash
git add api/src/lib/sessionStore.ts api/src/middleware/auth.ts api/src/app.ts
git commit -m "feat(api): pg-backed session store and requireAuth middleware"
```

### Task 5.2: Auth route — TDD

**Files:**
- Create: `api/tests/integration/setup.ts`
- Create: `api/tests/integration/auth.test.ts`
- Create: `api/src/routes/auth.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write integration test harness `api/tests/integration/setup.ts`**

```ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import path from 'node:path';

export async function startTestDb(): Promise<{ url: string; stop: () => Promise<void> }> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('webtest_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();

  const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
  execSync(`npx node-pg-migrate up -m ${migrationsDir}`, {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  return { url, stop: () => container.stop() };
}
```

Also add to `api/package.json` devDependencies: `"@testcontainers/postgresql": "^10.11.0"` (install with `npm i -D @testcontainers/postgresql` in `api/`).

- [ ] **Step 2: Write failing test `api/tests/integration/auth.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { startTestDb } from './setup.js';

let stop: () => Promise<void>;
let app: import('express').Express;

beforeAll(async () => {
  const db = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.SESSION_SECRET = 'a'.repeat(40);
  process.env.VT_API_KEY = 'x';
  process.env.GEMINI_API_KEY = 'x';
  stop = db.stop;
  const mod = await import('../../src/app.js');
  app = mod.buildApp();
}, 120_000);

afterAll(async () => { await stop(); });

describe('auth', () => {
  it('registers, logs in, fetches me, logs out', async () => {
    const agent = request.agent(app);

    const reg = await agent.post('/api/auth/register').send({ email: 'a@example.com', password: 'hunter22!' });
    expect(reg.status).toBe(201);
    expect(reg.body.email).toBe('a@example.com');

    const me1 = await agent.get('/api/auth/me');
    expect(me1.status).toBe(200);
    expect(me1.body.email).toBe('a@example.com');

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(204);

    const me2 = await agent.get('/api/auth/me');
    expect(me2.status).toBe(401);

    const login = await agent.post('/api/auth/login').send({ email: 'a@example.com', password: 'hunter22!' });
    expect(login.status).toBe(200);
  });

  it('rejects weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'b@example.com', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects duplicate email', async () => {
    await request(app).post('/api/auth/register').send({ email: 'c@example.com', password: 'hunter22!' });
    const dup = await request(app).post('/api/auth/register').send({ email: 'c@example.com', password: 'hunter22!' });
    expect(dup.status).toBe(409);
  });

  it('rejects wrong password on login', async () => {
    await request(app).post('/api/auth/register').send({ email: 'd@example.com', password: 'hunter22!' });
    const bad = await request(app).post('/api/auth/login').send({ email: 'd@example.com', password: 'wrong1234' });
    expect(bad.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd api && npx vitest run tests/integration/auth.test.ts
```

Expected: FAIL — 404/missing routes.

- [ ] **Step 4: Write `api/src/routes/auth.ts`**

```ts
import { Router, type RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { Errors } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

export const auth = Router();

const credsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const register: RequestHandler = async (req, res, next) => {
  try {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return next(Errors.validation('Invalid credentials', parsed.error.flatten()));
    const { email, password } = parsed.data;
    const hash = await bcrypt.hash(password, 12);
    try {
      const { rows } = await pool.query<{ id: number; email: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [email, hash],
      );
      const user = rows[0]!;
      req.session.userId = user.id;
      req.session.email = user.email;
      res.status(201).json({ id: user.id, email: user.email });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        return next(Errors.conflict('Email already registered'));
      }
      throw err;
    }
  } catch (err) { next(err); }
};

const login: RequestHandler = async (req, res, next) => {
  try {
    const parsed = credsSchema.safeParse(req.body);
    if (!parsed.success) return next(Errors.validation('Invalid credentials'));
    const { email, password } = parsed.data;
    const { rows } = await pool.query<{ id: number; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email],
    );
    const row = rows[0];
    if (!row) return next(Errors.unauthorized());
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return next(Errors.unauthorized());
    req.session.userId = row.id;
    req.session.email = row.email;
    res.status(200).json({ id: row.id, email: row.email });
  } catch (err) { next(err); }
};

const logout: RequestHandler = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('wt.sid');
    res.status(204).end();
  });
};

const me: RequestHandler = (req, res) => {
  res.status(200).json({ id: req.session.userId, email: req.session.email });
};

auth.post('/register', register);
auth.post('/login', login);
auth.post('/logout', logout);
auth.get('/me', requireAuth, me);
```

- [ ] **Step 5: Register route in `api/src/app.ts`**

Add after `app.use('/', health);`:

```ts
import { auth } from './routes/auth.js';
// ...
app.use('/api/auth', auth);
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd api && npx vitest run tests/integration/auth.test.ts
```

Expected: 4 passing.

- [ ] **Step 7: Commit**

```bash
git add api/src/routes/auth.ts api/src/app.ts api/tests/integration
git commit -m "feat(api): auth routes with bcrypt, session cookies, integration tests"
```

---

## Phase 6 — API File Upload (Streaming to VirusTotal)

**Goal:** `POST /api/scans` accepts multipart upload, pipes file stream through sha256 + byte-count Transforms straight into VirusTotal, never touches disk. Inserts a `scans` row on success.

### Task 6.1: Hash + size transforms — unit tests

**Files:**
- Create: `api/src/lib/hash.ts`
- Create: `api/tests/unit/hash.test.ts`

- [ ] **Step 1: Write failing test `api/tests/unit/hash.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createSha256Transform, createByteCounter } from '../../src/lib/hash.js';

describe('hash/size transforms', () => {
  it('computes sha256 and byte count while passing data through', async () => {
    const input = Readable.from(Buffer.from('hello world'));
    const hasher = createSha256Transform();
    const counter = createByteCounter();
    const sinkChunks: Buffer[] = [];
    const sink = new (await import('node:stream')).Writable({
      write(chunk, _enc, cb) { sinkChunks.push(chunk); cb(); },
    });
    await pipeline(input, hasher, counter, sink);
    expect(hasher.digest()).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    expect(counter.bytes).toBe(11);
    expect(Buffer.concat(sinkChunks).toString()).toBe('hello world');
  });

  it('enforces max bytes if configured', async () => {
    const input = Readable.from(Buffer.from('x'.repeat(100)));
    const counter = createByteCounter({ max: 50 });
    const sink = new (await import('node:stream')).Writable({ write(_c, _e, cb) { cb(); } });
    await expect(pipeline(input, counter, sink)).rejects.toThrow(/file too large/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx vitest run tests/unit/hash.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `api/src/lib/hash.ts`**

```ts
import { Transform } from 'node:stream';
import { createHash, type Hash } from 'node:crypto';

export interface Sha256Transform extends Transform { digest: () => string; }

export function createSha256Transform(): Sha256Transform {
  const hasher: Hash = createHash('sha256');
  const t = new Transform({
    transform(chunk, _enc, cb) { hasher.update(chunk); cb(null, chunk); },
  }) as Sha256Transform;
  t.digest = () => hasher.digest('hex');
  return t;
}

export interface ByteCounterTransform extends Transform { bytes: number; }

export function createByteCounter(opts: { max?: number } = {}): ByteCounterTransform {
  let total = 0;
  const t = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (opts.max != null && total > opts.max) {
        cb(new Error('file too large'));
        return;
      }
      cb(null, chunk);
    },
  }) as ByteCounterTransform;
  Object.defineProperty(t, 'bytes', { get: () => total });
  return t;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && npx vitest run tests/unit/hash.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/hash.ts api/tests/unit/hash.test.ts
git commit -m "feat(api): streaming sha256 and byte-counter transforms"
```

### Task 6.2: VirusTotal client — unit tests

**Files:**
- Create: `api/src/services/virustotal.ts`
- Create: `api/tests/unit/virustotal.test.ts`

- [ ] **Step 1: Write failing test `api/tests/unit/virustotal.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Readable } from 'node:stream';
import { uploadToVt, getAnalysis } from '../../src/services/virustotal.js';

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); server.close(); });

describe('virustotal client', () => {
  it('uploads a stream and returns analysis id', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', async ({ request }) => {
        expect(request.headers.get('x-apikey')).toBe('key-abc');
        expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data/);
        return HttpResponse.json({ data: { id: 'analysis-xyz' } }, { status: 200 });
      }),
    );
    const stream = Readable.from(Buffer.from('file bytes'));
    const id = await uploadToVt({ apiKey: 'key-abc', filename: 'sample.js', stream });
    expect(id).toBe('analysis-xyz');
  });

  it('fetches an analysis by id', async () => {
    server.use(
      http.get('https://www.virustotal.com/api/v3/analyses/analysis-xyz', ({ request }) => {
        expect(request.headers.get('x-apikey')).toBe('key-abc');
        return HttpResponse.json({ data: { id: 'analysis-xyz', attributes: { status: 'completed', stats: { malicious: 1, suspicious: 0, undetected: 60, harmless: 0 }, results: {} } } });
      }),
    );
    const r = await getAnalysis({ apiKey: 'key-abc', analysisId: 'analysis-xyz' });
    expect(r.status).toBe('completed');
    expect(r.stats.malicious).toBe(1);
  });

  it('throws on non-2xx upload response', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () => HttpResponse.json({ error: { message: 'unauthorized' } }, { status: 401 })),
    );
    await expect(uploadToVt({ apiKey: 'bad', filename: 'f', stream: Readable.from(Buffer.from('x')) })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx vitest run tests/unit/virustotal.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `api/src/services/virustotal.ts`**

```ts
import FormData from 'form-data';
import { request } from 'undici';
import type { Readable } from 'node:stream';

const VT_BASE = 'https://www.virustotal.com/api/v3';

export interface AnalysisStats {
  malicious: number;
  suspicious: number;
  undetected: number;
  harmless: number;
}

export interface Analysis {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stats: AnalysisStats;
  results?: Record<string, { category: string; result: string | null; engine_name: string }>;
  raw: unknown;
}

export async function uploadToVt(opts: {
  apiKey: string;
  filename: string;
  stream: Readable;
  contentType?: string;
}): Promise<string> {
  const form = new FormData();
  form.append('file', opts.stream, { filename: opts.filename, contentType: opts.contentType ?? 'application/octet-stream' });
  const { statusCode, body } = await request(`${VT_BASE}/files`, {
    method: 'POST',
    headers: { ...form.getHeaders(), 'x-apikey': opts.apiKey, accept: 'application/json' },
    body: form,
  });
  const json = (await body.json()) as { data?: { id?: string }; error?: { message?: string } };
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`VT upload failed: ${statusCode} ${json?.error?.message ?? ''}`);
  }
  const id = json?.data?.id;
  if (!id) throw new Error('VT upload: missing analysis id');
  return id;
}

export async function getAnalysis(opts: { apiKey: string; analysisId: string }): Promise<Analysis> {
  const { statusCode, body } = await request(`${VT_BASE}/analyses/${opts.analysisId}`, {
    headers: { 'x-apikey': opts.apiKey, accept: 'application/json' },
  });
  const json = (await body.json()) as {
    data?: { id?: string; attributes?: { status?: string; stats?: AnalysisStats; results?: Analysis['results'] } };
    error?: { message?: string };
  };
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`VT analysis fetch failed: ${statusCode} ${json?.error?.message ?? ''}`);
  }
  const a = json?.data?.attributes;
  const id = json?.data?.id;
  if (!a || !id) throw new Error('VT analysis: malformed response');
  const rawStatus = a.status ?? 'queued';
  const status = rawStatus === 'completed' ? 'completed' : rawStatus === 'queued' ? 'queued' : 'running';
  return {
    id,
    status,
    stats: a.stats ?? { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 },
    results: a.results,
    raw: json.data,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && npx vitest run tests/unit/virustotal.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/virustotal.ts api/tests/unit/virustotal.test.ts
git commit -m "feat(api): virustotal client (stream upload + analysis fetch)"
```

### Task 6.3: POST /api/scans — integration test

**Files:**
- Create: `api/tests/integration/scans.test.ts`
- Create: `api/src/services/scans.ts`
- Create: `api/src/routes/scans.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write failing test `api/tests/integration/scans.test.ts`**

```ts
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { startTestDb } from './setup.js';

let stop: () => Promise<void>;
let app: import('express').Express;
const server = setupServer();

beforeAll(async () => {
  const db = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.SESSION_SECRET = 'a'.repeat(40);
  process.env.VT_API_KEY = 'vt-key';
  process.env.GEMINI_API_KEY = 'g';
  stop = db.stop;
  server.listen({ onUnhandledRequest: 'bypass' });
  const mod = await import('../../src/app.js');
  app = mod.buildApp();
}, 120_000);

afterEach(() => server.resetHandlers());
afterAll(async () => { server.close(); await stop(); });

async function signup(): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email: `u${Date.now()}@example.com`, password: 'hunter22!' });
  return agent;
}

describe('POST /api/scans', () => {
  it('streams upload to VT and persists scan', async () => {
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () => HttpResponse.json({ data: { id: 'analysis-1' } })),
    );
    const agent = await signup();
    const res = await agent
      .post('/api/scans')
      .attach('file', Buffer.from('console.log(1)'), { filename: 'sample.js', contentType: 'application/javascript' });
    expect(res.status).toBe(202);
    expect(res.body.analysisId).toBe('analysis-1');
    expect(res.body.scanId).toBeGreaterThan(0);
    expect(res.body.status).toBe('queued');
  });

  it('rejects >32MB upload', async () => {
    const big = Buffer.alloc(33 * 1024 * 1024, 1);
    const agent = await signup();
    const res = await agent.post('/api/scans').attach('file', big, 'big.bin');
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('401 when not authenticated', async () => {
    const res = await request(app).post('/api/scans').attach('file', Buffer.from('x'), 'x.txt');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx vitest run tests/integration/scans.test.ts
```

Expected: FAIL — route missing.

- [ ] **Step 3: Write `api/src/services/scans.ts`**

```ts
import { pool } from '../db/pool.js';

export interface Scan {
  id: number;
  userId: number;
  vtAnalysisId: string;
  fileName: string;
  fileSha256: string;
  fileSize: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toScan(row: Record<string, unknown>): Scan {
  return {
    id: Number(row.id), userId: Number(row.user_id),
    vtAnalysisId: row.vt_analysis_id as string,
    fileName: row.file_name as string, fileSha256: row.file_sha256 as string,
    fileSize: Number(row.file_size), status: row.status as Scan['status'],
    result: row.result, createdAt: row.created_at as Date, updatedAt: row.updated_at as Date,
  };
}

export async function insertScan(input: {
  userId: number; vtAnalysisId: string; fileName: string; fileSha256: string; fileSize: number;
}): Promise<Scan> {
  const { rows } = await pool.query(
    `INSERT INTO scans (user_id, vt_analysis_id, file_name, file_sha256, file_size, status)
     VALUES ($1,$2,$3,$4,$5,'queued') RETURNING *`,
    [input.userId, input.vtAnalysisId, input.fileName, input.fileSha256, input.fileSize],
  );
  return toScan(rows[0]!);
}

export async function updateScanStatus(id: number, status: Scan['status'], result?: unknown): Promise<void> {
  await pool.query(
    `UPDATE scans SET status = $2, result = COALESCE($3, result), updated_at = now() WHERE id = $1`,
    [id, status, result == null ? null : JSON.stringify(result)],
  );
}

export async function getScanForUser(id: number, userId: number): Promise<Scan | null> {
  const { rows } = await pool.query(`SELECT * FROM scans WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ? toScan(rows[0]) : null;
}

export async function listScansForUser(userId: number, limit = 50): Promise<Scan[]> {
  const { rows } = await pool.query(
    `SELECT * FROM scans WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toScan);
}
```

- [ ] **Step 4: Write `api/src/routes/scans.ts`**

```ts
import { Router, type RequestHandler } from 'express';
import Busboy from 'busboy';
import { PassThrough } from 'node:stream';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { Errors } from '../lib/errors.js';
import { createSha256Transform, createByteCounter } from '../lib/hash.js';
import { uploadToVt } from '../services/virustotal.js';
import { insertScan, getScanForUser, listScansForUser } from '../services/scans.js';

export const scans = Router();

const MAX_BYTES = 32 * 1024 * 1024;

const uploadHandler: RequestHandler = (req, res, next) => {
  if (!req.headers['content-type']?.startsWith('multipart/form-data')) {
    return next(Errors.validation('Expected multipart/form-data'));
  }

  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES } });
  let handled = false;

  const fail = (err: Error): void => {
    if (handled) return;
    handled = true;
    req.unpipe(bb);
    next(err);
  };

  bb.on('file', async (_name, stream, info) => {
    try {
      const hasher = createSha256Transform();
      const counter = createByteCounter({ max: MAX_BYTES });
      const passthrough = new PassThrough();
      stream.on('limit', () => fail(Errors.tooLarge()));
      stream.pipe(hasher).pipe(counter).pipe(passthrough).on('error', fail);
      counter.on('error', fail);

      const analysisId = await uploadToVt({
        apiKey: config.VT_API_KEY,
        filename: info.filename || 'upload.bin',
        stream: passthrough,
        contentType: info.mimeType,
      });

      const scan = await insertScan({
        userId: req.session.userId!,
        vtAnalysisId: analysisId,
        fileName: info.filename || 'upload.bin',
        fileSha256: hasher.digest(),
        fileSize: counter.bytes,
      });

      if (handled) return;
      handled = true;
      res.status(202).json({ scanId: scan.id, analysisId, status: 'queued' });
    } catch (err) {
      if (err instanceof Error && /file too large/i.test(err.message)) return fail(Errors.tooLarge());
      fail(err as Error);
    }
  });

  bb.on('error', fail);
  bb.on('finish', () => {
    if (!handled) fail(Errors.validation('No file in upload'));
  });

  req.pipe(bb);
};

scans.post('/', requireAuth, uploadHandler);
scans.get('/', requireAuth, async (req, res, next) => {
  try {
    const list = await listScansForUser(req.session.userId!);
    res.json(list.map((s) => ({ id: s.id, fileName: s.fileName, status: s.status, createdAt: s.createdAt })));
  } catch (err) { next(err); }
});
scans.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return next(Errors.validation('Bad id'));
    const scan = await getScanForUser(id, req.session.userId!);
    if (!scan) return next(Errors.notFound('Scan'));
    res.json(scan);
  } catch (err) { next(err); }
});
```

- [ ] **Step 5: Register scans router in `api/src/app.ts`**

Add:

```ts
import { scans } from './routes/scans.js';
// ...
app.use('/api/scans', scans);
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd api && npx vitest run tests/integration/scans.test.ts
```

Expected: 3 passing.

- [ ] **Step 7: Commit**

```bash
git add api/src/services/scans.ts api/src/routes/scans.ts api/src/app.ts api/tests/integration/scans.test.ts
git commit -m "feat(api): POST /api/scans streams uploads directly to virustotal"
```

---

## Phase 7 — API Scan Retrieval & SSE Status Stream

**Goal:** `GET /api/scans/:id/events` opens an SSE stream, polls VT until terminal, pushes events.

### Task 7.1: SSE writer — unit tests

**Files:**
- Create: `api/src/lib/sse.ts`
- Create: `api/tests/unit/sse.test.ts`

- [ ] **Step 1: Write failing test `api/tests/unit/sse.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { SseWriter } from '../../src/lib/sse.js';

describe('SseWriter', () => {
  it('formats events correctly', () => {
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (c) => chunks.push(c));
    const sse = new SseWriter({
      setHeader: () => undefined,
      write: (s: string) => sink.write(s),
      flushHeaders: () => undefined,
    } as unknown as import('express').Response);
    sse.event('status', { state: 'running' });
    sse.event('result', { ok: true });
    const text = Buffer.concat(chunks).toString();
    expect(text).toContain('event: status\n');
    expect(text).toContain('data: {"state":"running"}\n\n');
    expect(text).toContain('event: result\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx vitest run tests/unit/sse.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Write `api/src/lib/sse.ts`**

```ts
import type { Response } from 'express';

export class SseWriter {
  constructor(private res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as Response & { flushHeaders?: () => void }).flushHeaders === 'function') {
      (res as Response & { flushHeaders: () => void }).flushHeaders();
    }
  }
  event(name: string, data: unknown): void {
    this.res.write(`event: ${name}\n`);
    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
  comment(text: string): void { this.res.write(`: ${text}\n\n`); }
  close(): void { this.res.end(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && npx vitest run tests/unit/sse.test.ts
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/sse.ts api/tests/unit/sse.test.ts
git commit -m "feat(api): SseWriter helper for server-sent events"
```

### Task 7.2: SSE scan events route

**Files:**
- Create: `api/src/routes/scanEvents.ts`
- Modify: `api/src/app.ts`
- Modify: `api/tests/integration/scans.test.ts` (add SSE test cases)

- [ ] **Step 1: Write `api/src/routes/scanEvents.ts`**

```ts
import { Router, type RequestHandler } from 'express';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { Errors } from '../lib/errors.js';
import { SseWriter } from '../lib/sse.js';
import { getScanForUser, updateScanStatus } from '../services/scans.js';
import { getAnalysis } from '../services/virustotal.js';
import { logger } from '../logger.js';

export const scanEvents = Router();

const POLL_MS = 2_000;
const MAX_MS = 150_000;

const events: RequestHandler = async (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return next(Errors.validation('Bad id'));
  const scan = await getScanForUser(id, req.session.userId!);
  if (!scan) return next(Errors.notFound('Scan'));

  const sse = new SseWriter(res);

  if (scan.status === 'completed' || scan.status === 'failed') {
    sse.event(scan.status === 'completed' ? 'result' : 'error', {
      status: scan.status, result: scan.result,
    });
    sse.close();
    return;
  }

  let aborted = false;
  req.on('close', () => { aborted = true; });

  const start = Date.now();
  sse.event('status', { state: scan.status });

  while (!aborted && Date.now() - start < MAX_MS) {
    try {
      const a = await getAnalysis({ apiKey: config.VT_API_KEY, analysisId: scan.vtAnalysisId });
      if (a.status === 'completed') {
        await updateScanStatus(scan.id, 'completed', a.raw);
        sse.event('result', { status: 'completed', stats: a.stats, results: a.results });
        sse.close();
        return;
      }
      sse.event('status', { state: a.status });
    } catch (err) {
      logger.warn({ err, scanId: scan.id }, 'VT poll error');
      sse.event('error', { message: 'Temporary error polling VirusTotal; retrying' });
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  if (!aborted) {
    await updateScanStatus(scan.id, 'failed', { reason: 'timeout' });
    sse.event('error', { message: 'Scan timed out' });
  }
  sse.close();
};

scanEvents.get('/:id/events', requireAuth, events);
```

- [ ] **Step 2: Mount in `api/src/app.ts`**

```ts
import { scanEvents } from './routes/scanEvents.js';
// ...
app.use('/api/scans', scanEvents);
```

(Mounted at the same path as `scans` router; Express handles both.)

- [ ] **Step 3: Add SSE test case to `api/tests/integration/scans.test.ts`**

Append inside the existing `describe('POST /api/scans', ...)` or add a new `describe`:

```ts
describe('GET /api/scans/:id/events', () => {
  it('streams result when analysis completes', async () => {
    let polls = 0;
    server.use(
      http.post('https://www.virustotal.com/api/v3/files', () => HttpResponse.json({ data: { id: 'a-2' } })),
      http.get('https://www.virustotal.com/api/v3/analyses/a-2', () => {
        polls++;
        if (polls < 2) return HttpResponse.json({ data: { id: 'a-2', attributes: { status: 'queued', stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 } } } });
        return HttpResponse.json({ data: { id: 'a-2', attributes: { status: 'completed', stats: { malicious: 2, suspicious: 0, undetected: 50, harmless: 0 }, results: {} } } });
      }),
    );
    const agent = await signup();
    const up = await agent.post('/api/scans').attach('file', Buffer.from('x'), 'x.js');
    const scanId = up.body.scanId as number;

    const res = await agent.get(`/api/scans/${scanId}/events`).buffer(true).parse((r, cb) => {
      let data = '';
      r.on('data', (c: Buffer) => (data += c.toString()));
      r.on('end', () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(String(res.body)).toContain('event: result');
  }, 60_000);
});
```

- [ ] **Step 4: Run tests to verify passes**

```bash
cd api && npx vitest run tests/integration/scans.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/scanEvents.ts api/src/app.ts api/tests/integration/scans.test.ts
git commit -m "feat(api): SSE endpoint streams virustotal scan progress"
```

---

## Phase 8 — API Chat (Gemini Streaming)

**Goal:** `GET /api/scans/:id/messages` returns history. `POST /api/scans/:id/messages` streams Gemini tokens via SSE and persists.

### Task 8.1: Prompt builder — unit tests

**Files:**
- Create: `api/src/lib/promptBuilder.ts`
- Create: `api/tests/unit/promptBuilder.test.ts`

- [ ] **Step 1: Write failing test `api/tests/unit/promptBuilder.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildGeminiPrompt } from '../../src/lib/promptBuilder.js';

describe('buildGeminiPrompt', () => {
  it('includes system prompt, scan context, and prior history', () => {
    const result = buildGeminiPrompt({
      scan: { fileName: 'evil.js', fileSha256: 'abc123', status: 'completed', stats: { malicious: 5, suspicious: 0, undetected: 60, harmless: 0 }, topEngines: ['Kaspersky', 'Sophos'] },
      history: [
        { role: 'user', content: 'What is this?' },
        { role: 'assistant', content: 'A malicious script.' },
      ],
      userMessage: 'Should I worry?',
    });
    expect(result.systemInstruction).toMatch(/explain virustotal/i);
    expect(result.systemInstruction).toContain('evil.js');
    expect(result.systemInstruction).toContain('malicious: 5');
    expect(result.contents).toHaveLength(3);
    expect(result.contents[2]!.role).toBe('user');
    expect(result.contents[2]!.parts[0]!.text).toBe('Should I worry?');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx vitest run tests/unit/promptBuilder.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Write `api/src/lib/promptBuilder.ts`**

```ts
export interface ScanContext {
  fileName: string;
  fileSha256: string;
  status: string;
  stats: { malicious: number; suspicious: number; undetected: number; harmless: number };
  topEngines: string[];
}

export interface HistoryMessage { role: 'user' | 'assistant'; content: string; }

export interface GeminiPrompt {
  systemInstruction: string;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
}

export function buildGeminiPrompt(input: {
  scan: ScanContext;
  history: HistoryMessage[];
  userMessage: string;
}): GeminiPrompt {
  const { scan, history, userMessage } = input;
  const systemInstruction = [
    'You help explain VirusTotal scan results to non-technical users.',
    'Stay on-topic: this file\'s scan, what it means, and practical advice.',
    'If asked something unrelated, politely redirect the user back to the scan.',
    '',
    `File context:`,
    `- Name: ${scan.fileName}`,
    `- SHA-256: ${scan.fileSha256}`,
    `- Status: ${scan.status}`,
    `- Detection counts — malicious: ${scan.stats.malicious}, suspicious: ${scan.stats.suspicious}, undetected: ${scan.stats.undetected}, harmless: ${scan.stats.harmless}`,
    `- Top detecting engines: ${scan.topEngines.length ? scan.topEngines.join(', ') : 'none'}`,
  ].join('\n');

  const contents = [
    ...history.map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: m.content }],
    })),
    { role: 'user' as const, parts: [{ text: userMessage }] },
  ];

  return { systemInstruction, contents };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && npx vitest run tests/unit/promptBuilder.test.ts
```

Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/promptBuilder.ts api/tests/unit/promptBuilder.test.ts
git commit -m "feat(api): gemini prompt builder with scan context"
```

### Task 8.2: Gemini client

**Files:**
- Create: `api/src/services/gemini.ts`

- [ ] **Step 1: Write `api/src/services/gemini.ts`**

```ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiPrompt } from '../lib/promptBuilder.js';

export interface GeminiStream {
  [Symbol.asyncIterator](): AsyncIterator<string>;
}

export function createGeminiClient(apiKey: string) {
  const client = new GoogleGenerativeAI(apiKey);
  return {
    async *stream(prompt: GeminiPrompt, signal?: AbortSignal): AsyncGenerator<string> {
      const model = client.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: prompt.systemInstruction,
      });
      const result = await model.generateContentStream({ contents: prompt.contents });
      for await (const chunk of result.stream) {
        if (signal?.aborted) return;
        const text = chunk.text();
        if (text) yield text;
      }
    },
  };
}
```

- [ ] **Step 2: Commit (no dedicated test — exercised via integration test in 8.4)**

```bash
git add api/src/services/gemini.ts
git commit -m "feat(api): gemini streaming client"
```

### Task 8.3: Messages service

**Files:**
- Create: `api/src/services/messages.ts`

- [ ] **Step 1: Write `api/src/services/messages.ts`**

```ts
import { pool } from '../db/pool.js';

export interface Message {
  id: number;
  scanId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

function toMessage(row: Record<string, unknown>): Message {
  return { id: Number(row.id), scanId: Number(row.scan_id), role: row.role as Message['role'], content: row.content as string, createdAt: row.created_at as Date };
}

export async function listMessagesForScan(scanId: number): Promise<Message[]> {
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE scan_id = $1 AND role <> 'system' ORDER BY created_at ASC`,
    [scanId],
  );
  return rows.map(toMessage);
}

export async function insertMessage(input: { scanId: number; role: Message['role']; content: string }): Promise<Message> {
  const { rows } = await pool.query(
    `INSERT INTO messages (scan_id, role, content) VALUES ($1,$2,$3) RETURNING *`,
    [input.scanId, input.role, input.content],
  );
  return toMessage(rows[0]!);
}

export async function deleteMessage(id: number, scanId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM messages WHERE id = $1 AND scan_id = $2`, [id, scanId]);
  return (rowCount ?? 0) > 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add api/src/services/messages.ts
git commit -m "feat(api): message persistence service"
```

### Task 8.4: Chat routes — integration test

**Files:**
- Create: `api/tests/integration/messages.test.ts`
- Create: `api/src/routes/messages.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write failing test `api/tests/integration/messages.test.ts`**

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { startTestDb } from './setup.js';

let stop: () => Promise<void>;
let app: import('express').Express;
const server = setupServer();

vi.mock('../../src/services/gemini.js', () => ({
  createGeminiClient: () => ({
    async *stream() { yield 'Hello'; yield ' world'; },
  }),
}));

beforeAll(async () => {
  const db = await startTestDb();
  process.env.DATABASE_URL = db.url;
  process.env.SESSION_SECRET = 'a'.repeat(40);
  process.env.VT_API_KEY = 'v';
  process.env.GEMINI_API_KEY = 'g';
  stop = db.stop;
  server.listen({ onUnhandledRequest: 'bypass' });
  const mod = await import('../../src/app.js');
  app = mod.buildApp();
}, 120_000);

afterEach(() => server.resetHandlers());
afterAll(async () => { server.close(); await stop(); });

async function signupAndScan(): Promise<{ agent: ReturnType<typeof request.agent>; scanId: number }> {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email: `u${Date.now()}@example.com`, password: 'hunter22!' });
  server.use(http.post('https://www.virustotal.com/api/v3/files', () => HttpResponse.json({ data: { id: 'a-x' } })));
  const up = await agent.post('/api/scans').attach('file', Buffer.from('x'), 'x.js');
  return { agent, scanId: up.body.scanId };
}

describe('chat messages', () => {
  it('streams assistant reply and persists both turns', async () => {
    const { agent, scanId } = await signupAndScan();
    const res = await agent
      .post(`/api/scans/${scanId}/messages`)
      .send({ content: 'Is this safe?' })
      .buffer(true)
      .parse((r, cb) => { let d = ''; r.on('data', (c: Buffer) => (d += c)); r.on('end', () => cb(null, d)); });

    expect(res.status).toBe(200);
    const text = String(res.body);
    expect(text).toContain('event: token');
    expect(text).toContain('event: done');

    const hist = await agent.get(`/api/scans/${scanId}/messages`);
    expect(hist.body).toHaveLength(2);
    expect(hist.body[0].role).toBe('user');
    expect(hist.body[1].role).toBe('assistant');
    expect(hist.body[1].content).toBe('Hello world');
  });

  it('rejects chat on a scan the user does not own', async () => {
    const { scanId } = await signupAndScan();
    const other = request.agent(app);
    await other.post('/api/auth/register').send({ email: `o${Date.now()}@example.com`, password: 'hunter22!' });
    const res = await other.post(`/api/scans/${scanId}/messages`).send({ content: 'hi' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && npx vitest run tests/integration/messages.test.ts
```

Expected: FAIL — route missing.

- [ ] **Step 3: Write `api/src/routes/messages.ts`**

```ts
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { Errors } from '../lib/errors.js';
import { SseWriter } from '../lib/sse.js';
import { getScanForUser } from '../services/scans.js';
import { listMessagesForScan, insertMessage, deleteMessage } from '../services/messages.js';
import { buildGeminiPrompt, type ScanContext } from '../lib/promptBuilder.js';
import { createGeminiClient } from '../services/gemini.js';
import { logger } from '../logger.js';

export const messages = Router();

const contentSchema = z.object({ content: z.string().min(1).max(4_000) });

function scanToContext(scan: Awaited<ReturnType<typeof getScanForUser>>): ScanContext {
  if (!scan) throw Errors.notFound('Scan');
  const raw = scan.result as { attributes?: { stats?: ScanContext['stats']; results?: Record<string, { engine_name?: string; category?: string; result?: string | null }> } } | null;
  const stats = raw?.attributes?.stats ?? { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 };
  const results = raw?.attributes?.results ?? {};
  const topEngines = Object.values(results)
    .filter((r) => r.category === 'malicious' || r.category === 'suspicious')
    .map((r) => r.engine_name)
    .filter((x): x is string => !!x)
    .slice(0, 5);
  return { fileName: scan.fileName, fileSha256: scan.fileSha256, status: scan.status, stats, topEngines };
}

const list: RequestHandler = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const scan = await getScanForUser(id, req.session.userId!);
    if (!scan) return next(Errors.notFound('Scan'));
    const msgs = await listMessagesForScan(scan.id);
    res.json(msgs);
  } catch (err) { next(err); }
};

const post: RequestHandler = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const scan = await getScanForUser(id, req.session.userId!);
    if (!scan) return next(Errors.notFound('Scan'));
    const parsed = contentSchema.safeParse(req.body);
    if (!parsed.success) return next(Errors.validation('Invalid message'));

    const userMsg = await insertMessage({ scanId: scan.id, role: 'user', content: parsed.data.content });
    const history = (await listMessagesForScan(scan.id))
      .filter((m) => m.id !== userMsg.id)
      .map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: m.content }));

    const prompt = buildGeminiPrompt({ scan: scanToContext(scan), history, userMessage: parsed.data.content });

    const sse = new SseWriter(res);
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    const client = createGeminiClient(config.GEMINI_API_KEY);
    let full = '';
    try {
      for await (const token of client.stream(prompt, controller.signal)) {
        full += token;
        sse.event('token', { token });
      }
    } catch (err) {
      logger.warn({ err, scanId: scan.id }, 'gemini stream error');
      sse.event('error', { message: 'Model stream failed' });
      sse.close();
      return;
    }

    if (controller.signal.aborted) {
      sse.close();
      return;
    }

    const assistant = await insertMessage({ scanId: scan.id, role: 'assistant', content: full });
    sse.event('done', { msgId: assistant.id, fullText: full });
    sse.close();
  } catch (err) { next(err); }
};

const remove: RequestHandler = async (req, res, next) => {
  try {
    const scanId = Number(req.params.id);
    const msgId = Number(req.params.msgId);
    const scan = await getScanForUser(scanId, req.session.userId!);
    if (!scan) return next(Errors.notFound('Scan'));
    const ok = await deleteMessage(msgId, scan.id);
    if (!ok) return next(Errors.notFound('Message'));
    res.status(204).end();
  } catch (err) { next(err); }
};

messages.get('/:id/messages', requireAuth, list);
messages.post('/:id/messages', requireAuth, post);
messages.delete('/:id/messages/:msgId', requireAuth, remove);
```

- [ ] **Step 4: Mount in `api/src/app.ts`**

```ts
import { messages } from './routes/messages.js';
// ...
app.use('/api/scans', messages);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd api && npx vitest run tests/integration/messages.test.ts
```

Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add api/src/services/messages.ts api/src/lib/promptBuilder.ts api/src/services/gemini.ts api/src/routes/messages.ts api/src/app.ts api/tests
git commit -m "feat(api): streaming chat endpoints with gemini"
```

---

## Phase 9 — API Rate Limiting & Error Polish

**Goal:** `express-rate-limit` protects auth + scan routes.

### Task 9.1: Rate limit middleware

**Files:**
- Create: `api/src/middleware/rateLimit.ts`
- Modify: `api/src/app.ts`

- [ ] **Step 1: Write `api/src/middleware/rateLimit.ts`**

```ts
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

export const apiLimiter = rateLimit({
  windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});
```

- [ ] **Step 2: Apply limiters in `api/src/app.ts`**

```ts
import { authLimiter, apiLimiter } from './middleware/rateLimit.js';
// ...
app.use('/api/auth', authLimiter, auth);
app.use('/api/scans', apiLimiter, scans);
app.use('/api/scans', apiLimiter, scanEvents);
app.use('/api/scans', apiLimiter, messages);
```

- [ ] **Step 3: Run full test suite**

```bash
cd api && npm test
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add api/src/middleware/rateLimit.ts api/src/app.ts
git commit -m "feat(api): per-route rate limits"
```

---

## Phase 10 — Web Scaffolding (Next.js + Shadcn + Middleware)

> **Before starting this phase, invoke `impeccable:impeccable`. Frontend work in phases 10–14 must be held to the impeccable-craft quality bar for visual polish, interaction feel, accessibility, and consistency.**

**Goal:** Shadcn UI installed with the components we need. TanStack Query provider. `middleware.ts` protects the `(app)` route group.

### Task 10.1: Install Shadcn primitives + provider

**Files:**
- Create: `web/components.json`
- Create: `web/lib/utils.ts`
- Create: `web/components/ui/button.tsx`
- Create: `web/components/ui/card.tsx`
- Create: `web/components/ui/input.tsx`
- Create: `web/components/ui/label.tsx`
- Create: `web/components/ui/table.tsx`
- Create: `web/components/ui/toast.tsx`
- Create: `web/components/ui/toaster.tsx`
- Create: `web/components/ui/use-toast.ts`
- Create: `web/components/providers.tsx`
- Modify: `web/app/layout.tsx`

- [ ] **Step 1: Write `web/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 2: Write `web/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 3: Write `web/components/ui/button.tsx`**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-muted',
        ghost: 'hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: { default: 'h-9 px-4 py-2', sm: 'h-8 px-3 text-xs', lg: 'h-10 px-6', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';
```

- [ ] **Step 4: Write `web/components/ui/card.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...p }, ref) => <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...p} />,
);
Card.displayName = 'Card';
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...p }, ref) => <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...p} />,
);
CardHeader.displayName = 'CardHeader';
export const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...p }, ref) => <div ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...p} />,
);
CardTitle.displayName = 'CardTitle';
export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...p }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...p} />,
);
CardContent.displayName = 'CardContent';
```

- [ ] **Step 5: Write `web/components/ui/input.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

- [ ] **Step 6: Write `web/components/ui/label.tsx`**

```tsx
'use client';
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...p }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none', className)} {...p} />
));
Label.displayName = 'Label';
```

- [ ] **Step 7: Write `web/components/ui/table.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(({ className, ...p }, ref) => (
  <div className="relative w-full overflow-auto"><table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...p} /></div>
));
Table.displayName = 'Table';
export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...p }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...p} />,
);
TableHeader.displayName = 'TableHeader';
export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...p }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...p} />,
);
TableBody.displayName = 'TableBody';
export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...p }, ref) => <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50', className)} {...p} />,
);
TableRow.displayName = 'TableRow';
export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...p }, ref) => <th ref={ref} className={cn('h-10 px-4 text-left align-middle font-medium text-muted-foreground', className)} {...p} />,
);
TableHead.displayName = 'TableHead';
export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...p }, ref) => <td ref={ref} className={cn('p-4 align-middle', className)} {...p} />,
);
TableCell.displayName = 'TableCell';
```

- [ ] **Step 8: Write `web/components/ui/toast.tsx`, `toaster.tsx`, `use-toast.ts`**

Copy the canonical shadcn toast trio from the official registry (https://ui.shadcn.com/docs/components/toast). Do not hand-reimplement; use the exact files. The `useToast` hook exposes `toast({ title, description, variant })`. If copying from the registry isn't possible in your environment, drop toast usage and surface errors via inline text until phase 14.

- [ ] **Step 9: Write `web/components/providers.tsx`**

```tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { Toaster } from '@/components/ui/toaster';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 10: Update `web/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'VirusTotal Scanner',
  description: 'Scan files and get AI-powered explanations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 11: Typecheck + build**

```bash
cd web && npm run typecheck && npm run build
```

Expected: exit 0 for both.

- [ ] **Step 12: Commit**

```bash
git add web/components web/lib web/app/layout.tsx web/components.json
git commit -m "feat(web): shadcn primitives, tanstack query provider"
```

### Task 10.2: API client + SSE helper + middleware

**Files:**
- Create: `web/lib/api.ts`
- Create: `web/lib/sse.ts`
- Create: `web/lib/types.ts`
- Create: `web/middleware.ts`

- [ ] **Step 1: Write `web/lib/types.ts`**

```ts
export interface User { id: number; email: string; }
export interface Scan {
  id: number; fileName: string; fileSha256?: string; fileSize?: number;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: unknown;
  createdAt: string; updatedAt?: string;
}
export interface Message { id: number; scanId: number; role: 'user' | 'assistant'; content: string; createdAt: string; }
export interface ApiError { code: string; message: string; details?: unknown; }
```

- [ ] **Step 2: Write `web/lib/api.ts`**

```ts
import type { ApiError } from './types';

export class ApiCallError extends Error {
  constructor(public status: number, public api: ApiError) { super(api.message); }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: ApiError };
    throw new ApiCallError(res.status, body.error ?? { code: 'UNKNOWN', message: `HTTP ${res.status}` });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

- [ ] **Step 3: Write `web/lib/sse.ts`**

```ts
export interface SseEvent { event: string; data: string; }

export async function* readSse(response: Response, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  if (!response.body) throw new Error('No body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = 'message';
        let data = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim();
        }
        if (data) yield { event, data };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 4: Write `web/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/register'];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC_PATHS.includes(path) || path.startsWith('/api') || path.startsWith('/_next') || path === '/favicon.ico') {
    return NextResponse.next();
  }
  const session = req.cookies.get('wt.sid');
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

- [ ] **Step 5: Typecheck + build**

```bash
cd web && npm run typecheck && npm run build
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/lib web/middleware.ts
git commit -m "feat(web): api client, sse reader, auth middleware"
```

---

## Phase 11 — Web Auth Pages

> **Invoke `impeccable:impeccable` before this phase. Auth pages are the first user impression — visual polish matters.**

**Goal:** Login and Register pages with Shadcn form components, TanStack Query mutations, redirect on success.

### Task 11.1: Auth forms

**Files:**
- Create: `web/components/auth/AuthForm.tsx`
- Create: `web/app/(auth)/login/page.tsx`
- Create: `web/app/(auth)/register/page.tsx`

- [ ] **Step 1: Write `web/components/auth/AuthForm.tsx`**

```tsx
'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiCallError } from '@/lib/api';
import type { User } from '@/lib/types';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [err, setErr] = React.useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => apiFetch<User>(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) }),
    onSuccess: () => router.replace(search.get('from') || '/'),
    onError: (e) => setErr(e instanceof ApiCallError ? e.api.message : 'Something went wrong'),
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>{mode === 'login' ? 'Log in' : 'Create an account'}</CardTitle></CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); setErr(null); mut.mutate(); }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={mut.isPending}>
              {mut.isPending ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {mode === 'login' ? (
                <>New here? <a className="underline" href="/register">Create an account</a></>
              ) : (
                <>Already have an account? <a className="underline" href="/login">Log in</a></>
              )}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Write `web/app/(auth)/login/page.tsx`**

```tsx
import { AuthForm } from '@/components/auth/AuthForm';
export default function LoginPage() { return <AuthForm mode="login" />; }
```

- [ ] **Step 3: Write `web/app/(auth)/register/page.tsx`**

```tsx
import { AuthForm } from '@/components/auth/AuthForm';
export default function RegisterPage() { return <AuthForm mode="register" />; }
```

- [ ] **Step 4: Typecheck + build**

```bash
cd web && npm run typecheck && npm run build
```

Expected: exit 0.

- [ ] **Step 5: Manual browser verification**

Bring up the stack:

```bash
cp .env.example .env   # (if not already)
# Edit .env: set SESSION_SECRET to 32+ chars, set real VT_API_KEY and GEMINI_API_KEY
docker compose up -d --build
```

Visit `http://localhost:3000/register`, create an account, verify redirect to `/`. Visit `/login` in a private window, log in, verify same redirect.

Tear down with `docker compose down`.

- [ ] **Step 6: Commit**

```bash
git add web/components/auth web/app/\(auth\)
git commit -m "feat(web): login and register pages"
```

---

## Phase 12 — Web Dashboard (Upload + History)

> **Invoke `impeccable:impeccable` before this phase.**

**Goal:** `/` shows an upload dropzone, a scans history table, and a top nav with logout.

### Task 12.1: App layout with nav

**Files:**
- Create: `web/app/(app)/layout.tsx`
- Create: `web/components/nav/TopNav.tsx`

- [ ] **Step 1: Write `web/components/nav/TopNav.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import type { User } from '@/lib/types';
import { ShieldCheck } from 'lucide-react';

export function TopNav() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => apiFetch<User>('/api/auth/me') });
  const logout = useMutation({
    mutationFn: () => apiFetch<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => { qc.clear(); router.replace('/login'); },
  });
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-5 w-5" />
        <span>Scanner</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{user?.email}</span>
        <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
          Log out
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Write `web/app/(app)/layout.tsx`**

```tsx
import { TopNav } from '@/components/nav/TopNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-5xl p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/app/\(app\)/layout.tsx web/components/nav
git commit -m "feat(web): app shell with top nav"
```

### Task 12.2: Upload dropzone

**Files:**
- Create: `web/components/upload/UploadDropzone.tsx`

- [ ] **Step 1: Write `web/components/upload/UploadDropzone.tsx`**

```tsx
'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UploadCloud } from 'lucide-react';

const MAX = 32 * 1024 * 1024;

async function uploadFile(file: File): Promise<{ scanId: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/scans', { method: 'POST', credentials: 'include', body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as { scanId: number };
}

export function UploadDropzone() {
  const router = useRouter();
  const qc = useQueryClient();
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const mut = useMutation({
    mutationFn: uploadFile,
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['scans'] }); router.push(`/scans/${r.scanId}`); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Upload failed'),
  });

  const onFiles = (files: FileList | null) => {
    setError(null);
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX) { setError('File exceeds 32 MB limit.'); return; }
    mut.mutate(f);
  };

  return (
    <Card>
      <CardHeader><CardTitle>Upload a file</CardTitle></CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-10 text-center transition-colors ${dragOver ? 'border-primary bg-muted' : 'border-muted-foreground/30 hover:bg-muted/50'}`}
          role="button"
          aria-label="Upload file"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm font-medium">{mut.isPending ? 'Uploading…' : 'Drop a file or click to browse'}</div>
          <div className="text-xs text-muted-foreground">Up to 32 MB. Scanned with VirusTotal.</div>
        </div>
        <input ref={inputRef} type="file" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {mut.isPending && <div className="mt-3 flex justify-end"><Button variant="outline" size="sm" disabled>Uploading…</Button></div>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/components/upload
git commit -m "feat(web): upload dropzone with drag+drop"
```

### Task 12.3: Scans table + dashboard page

**Files:**
- Create: `web/components/scans/ScansTable.tsx`
- Create: `web/app/(app)/page.tsx`

- [ ] **Step 1: Write `web/components/scans/ScansTable.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import type { Scan } from '@/lib/types';

const statusTone: Record<Scan['status'], string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100',
  completed: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  failed: 'bg-destructive/20 text-destructive',
};

export function ScansTable() {
  const { data, isLoading } = useQuery({
    queryKey: ['scans'],
    queryFn: () => apiFetch<Scan[]>('/api/scans'),
    refetchInterval: (q) => (q.state.data?.some((s) => s.status === 'queued' || s.status === 'running') ? 3000 : false),
  });
  return (
    <Card>
      <CardHeader><CardTitle>Recent scans</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">No scans yet. Upload a file above to get started.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((s) => (
                <TableRow key={s.id} className="cursor-pointer">
                  <TableCell><Link href={`/scans/${s.id}`} className="hover:underline">{s.fileName}</Link></TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[s.status]}`}>{s.status}</span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">{new Date(s.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `web/app/(app)/page.tsx`**

```tsx
import { UploadDropzone } from '@/components/upload/UploadDropzone';
import { ScansTable } from '@/components/scans/ScansTable';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <UploadDropzone />
      <ScansTable />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build + manual browser verification**

```bash
cd web && npm run typecheck && npm run build
```

Then `docker compose up -d --build`, log in, upload `files/newegg_magecart_skimmer.js`, verify the row appears in the history table with a refreshing status.

- [ ] **Step 4: Commit**

```bash
git add web/components/scans web/app/\(app\)/page.tsx
git commit -m "feat(web): dashboard with upload and history table"
```

---

## Phase 13 — Web Scan Detail Page

> **Invoke `impeccable:impeccable` before this phase.**

**Goal:** `/scans/[id]` renders the VT result, a scan-progress component that subscribes to SSE, and a slot for the chat panel (built in phase 14).

### Task 13.1: Scan progress + result components

**Files:**
- Create: `web/components/upload/ScanProgress.tsx`
- Create: `web/components/scans/ScanResult.tsx`
- Create: `web/app/(app)/scans/[id]/page.tsx`

- [ ] **Step 1: Write `web/components/upload/ScanProgress.tsx`**

```tsx
'use client';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

export function ScanProgress({ scanId, initialStatus }: { scanId: number; initialStatus: string }) {
  const [status, setStatus] = React.useState(initialStatus);
  const qc = useQueryClient();

  React.useEffect(() => {
    if (status === 'completed' || status === 'failed') return;
    const es = new EventSource(`/api/scans/${scanId}/events`, { withCredentials: true });
    es.addEventListener('status', (e) => setStatus((JSON.parse((e as MessageEvent).data) as { state: string }).state));
    es.addEventListener('result', () => { setStatus('completed'); qc.invalidateQueries({ queryKey: ['scan', scanId] }); qc.invalidateQueries({ queryKey: ['scans'] }); es.close(); });
    es.addEventListener('error', () => { es.close(); });
    return () => es.close();
  }, [scanId, status, qc]);

  if (status === 'completed') return null;
  if (status === 'failed') return <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Scan failed.</div>;
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Scan {status}…</span>
    </div>
  );
}
```

- [ ] **Step 2: Write `web/components/scans/ScanResult.tsx`**

```tsx
'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Scan } from '@/lib/types';

interface VtAttributes {
  stats?: { malicious: number; suspicious: number; undetected: number; harmless: number };
  results?: Record<string, { engine_name?: string; category?: string; result?: string | null }>;
}

export function ScanResult({ scan }: { scan: Scan }) {
  const attrs = (scan.result as { attributes?: VtAttributes } | null)?.attributes;
  const stats = attrs?.stats ?? { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 };
  const engines = Object.values(attrs?.results ?? {});
  const verdict = stats.malicious > 0 ? 'Malicious' : stats.suspicious > 0 ? 'Suspicious' : 'Clean';
  const verdictTone = stats.malicious > 0 ? 'text-destructive' : stats.suspicious > 0 ? 'text-yellow-600' : 'text-emerald-600';
  if (scan.status !== 'completed') return null;
  return (
    <Card>
      <CardHeader><CardTitle>Scan result: <span className={verdictTone}>{verdict}</span></CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">File</dt><dd className="truncate">{scan.fileName}</dd>
          <dt className="text-muted-foreground">SHA-256</dt><dd className="font-mono text-xs truncate">{scan.fileSha256}</dd>
          <dt className="text-muted-foreground">Size</dt><dd>{scan.fileSize?.toLocaleString()} bytes</dd>
        </dl>
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Malicious" value={stats.malicious} tone="destructive" />
          <Stat label="Suspicious" value={stats.suspicious} tone="warning" />
          <Stat label="Harmless" value={stats.harmless} tone="ok" />
          <Stat label="Undetected" value={stats.undetected} tone="muted" />
        </div>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">Per-engine results ({engines.length})</summary>
          <div className="mt-3 max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left">
                <tr><th className="px-3 py-1.5">Engine</th><th className="px-3 py-1.5">Category</th><th className="px-3 py-1.5">Result</th></tr>
              </thead>
              <tbody>
                {engines.map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5">{e.engine_name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{e.category}</td>
                    <td className="px-3 py-1.5">{e.result ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'destructive' | 'warning' | 'ok' | 'muted' }) {
  const cls = {
    destructive: 'bg-destructive/10 text-destructive',
    warning: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
    ok: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    muted: 'bg-muted text-muted-foreground',
  }[tone];
  return (
    <div className={`rounded-md p-3 text-center ${cls}`}>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
```

- [ ] **Step 3: Write `web/app/(app)/scans/[id]/page.tsx`**

```tsx
'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Scan } from '@/lib/types';
import { ScanProgress } from '@/components/upload/ScanProgress';
import { ScanResult } from '@/components/scans/ScanResult';

export default function ScanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { data, isLoading, error } = useQuery({
    queryKey: ['scan', id],
    queryFn: () => apiFetch<Scan>(`/api/scans/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'queued' || q.state.data?.status === 'running' ? 3000 : false),
  });
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="text-sm text-destructive">Could not load scan.</p>;
  return (
    <div className="space-y-6">
      <ScanProgress scanId={data.id} initialStatus={data.status} />
      <ScanResult scan={data} />
      {data.status === 'completed' && (
        <div id="chat-slot" className="text-sm text-muted-foreground">Chat panel arrives in phase 14.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + build + manual verification**

```bash
cd web && npm run typecheck && npm run build
```

Rebuild the stack (`docker compose up -d --build`), upload a sample, and verify the detail page shows progress → result with engine breakdown.

- [ ] **Step 5: Commit**

```bash
git add web/components/upload/ScanProgress.tsx web/components/scans/ScanResult.tsx web/app/\(app\)/scans
git commit -m "feat(web): scan detail page with SSE progress and result"
```

---

## Phase 14 — Web Chat UI

> **Invoke `impeccable:impeccable` before this phase. This is the most visually/interactively rich part of the app — polish matters for the Presentation criterion.**

**Goal:** Chat panel below the scan result: message list with markdown rendering, composer with Enter-to-send, stop-generating, regenerate last answer, auto-scroll behavior, accessible focus management.

### Task 14.1: Markdown renderer + message bubble

**Files:**
- Create: `web/components/chat/MarkdownRenderer.tsx`
- Create: `web/components/chat/MessageBubble.tsx`

- [ ] **Step 1: Write `web/components/chat/MarkdownRenderer.tsx`**

```tsx
'use client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

export function MarkdownRenderer({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-muted prose-pre:text-foreground prose-code:before:hidden prose-code:after:hidden">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{text}</Markdown>
    </div>
  );
}
```

Also install highlight.js (for the theme CSS): add `highlight.js` to `web/package.json` dependencies (`npm i highlight.js`) and add `@tailwindcss/typography` to `tailwind.config.ts` plugins (`npm i -D @tailwindcss/typography`, then import it in the config).

Modify `web/tailwind.config.ts`:

```ts
import typography from '@tailwindcss/typography';
// ...
plugins: [animate, typography],
```

- [ ] **Step 2: Write `web/components/chat/MessageBubble.tsx`**

```tsx
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './MarkdownRenderer';

export function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[85%] rounded-lg px-4 py-2 text-sm',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
      )}>
        {isUser ? content : <MarkdownRenderer text={content} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/components/chat/MarkdownRenderer.tsx web/components/chat/MessageBubble.tsx web/tailwind.config.ts web/package.json web/package-lock.json
git commit -m "feat(web): markdown renderer and message bubble"
```

### Task 14.2: useChatStream hook

**Files:**
- Create: `web/components/chat/useChatStream.ts`

- [ ] **Step 1: Write `web/components/chat/useChatStream.ts`**

```ts
'use client';
import * as React from 'react';
import { readSse } from '@/lib/sse';

interface StreamState {
  streaming: boolean;
  draft: string;
  error: string | null;
}

export function useChatStream(scanId: number) {
  const [state, setState] = React.useState<StreamState>({ streaming: false, draft: '', error: null });
  const controllerRef = React.useRef<AbortController | null>(null);

  const send = React.useCallback(async (content: string): Promise<{ msgId: number; fullText: string } | null> => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ streaming: true, draft: '', error: null });
    try {
      const res = await fetch(`/api/scans/${scanId}/messages`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });
      if (!res.ok) { setState({ streaming: false, draft: '', error: `HTTP ${res.status}` }); return null; }
      let finalMsg: { msgId: number; fullText: string } | null = null;
      for await (const evt of readSse(res, controller.signal)) {
        if (evt.event === 'token') {
          const parsed = JSON.parse(evt.data) as { token: string };
          setState((s) => ({ ...s, draft: s.draft + parsed.token }));
        } else if (evt.event === 'done') {
          finalMsg = JSON.parse(evt.data) as { msgId: number; fullText: string };
        } else if (evt.event === 'error') {
          const e = JSON.parse(evt.data) as { message: string };
          setState((s) => ({ ...s, error: e.message }));
        }
      }
      setState({ streaming: false, draft: '', error: null });
      return finalMsg;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState({ streaming: false, draft: '', error: null });
        return null;
      }
      setState({ streaming: false, draft: '', error: err instanceof Error ? err.message : 'Stream failed' });
      return null;
    } finally {
      controllerRef.current = null;
    }
  }, [scanId]);

  const stop = React.useCallback(() => { controllerRef.current?.abort(); }, []);
  return { ...state, send, stop };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/components/chat/useChatStream.ts
git commit -m "feat(web): useChatStream hook for gemini streaming"
```

### Task 14.3: Composer + MessageList + ChatPanel

**Files:**
- Create: `web/components/chat/Composer.tsx`
- Create: `web/components/chat/MessageList.tsx`
- Create: `web/components/chat/ChatPanel.tsx`
- Modify: `web/app/(app)/scans/[id]/page.tsx`

- [ ] **Step 1: Write `web/components/chat/Composer.tsx`**

```tsx
'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Send, Square } from 'lucide-react';

export function Composer({
  onSend, onStop, streaming,
}: { onSend: (text: string) => void; onStop: () => void; streaming: boolean }) {
  const [value, setValue] = React.useState('');
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const t = value.trim();
    if (!t || streaming) return;
    onSend(t);
    setValue('');
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex items-end gap-2 rounded-lg border bg-background p-2 focus-within:ring-1 focus-within:ring-ring"
    >
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        rows={1}
        placeholder={streaming ? 'Generating…' : 'Ask about this scan…'}
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none disabled:opacity-50"
        disabled={streaming}
      />
      {streaming ? (
        <Button type="button" variant="outline" size="icon" onClick={onStop} aria-label="Stop generating">
          <Square className="h-4 w-4" />
        </Button>
      ) : (
        <Button type="submit" size="icon" aria-label="Send" disabled={!value.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Write `web/components/chat/MessageList.tsx`**

```tsx
'use client';
import * as React from 'react';
import { MessageBubble } from './MessageBubble';
import type { Message } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ArrowDown } from 'lucide-react';

export function MessageList({
  messages, streamingDraft,
}: { messages: Message[]; streamingDraft: string | null }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = React.useState(true);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
      setStuck(nearBottom);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    if (!stuck) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingDraft, stuck]);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setStuck(true);
  };

  return (
    <div className="relative">
      <div ref={scrollRef} className="max-h-[480px] space-y-3 overflow-y-auto px-1 py-2">
        {messages.length === 0 && !streamingDraft && (
          <p className="text-center text-sm text-muted-foreground">Ask the assistant to explain this scan.</p>
        )}
        {messages.map((m) => <MessageBubble key={m.id} role={m.role} content={m.content} />)}
        {streamingDraft && <MessageBubble role="assistant" content={streamingDraft} />}
      </div>
      {!stuck && (
        <Button variant="outline" size="sm" onClick={jumpToBottom} className="absolute right-2 bottom-2 shadow">
          <ArrowDown className="mr-1 h-3 w-3" />Jump to latest
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `web/components/chat/ChatPanel.tsx`**

```tsx
'use client';
import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { Message } from '@/lib/types';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { useChatStream } from './useChatStream';

export function ChatPanel({ scanId }: { scanId: number }) {
  const qc = useQueryClient();
  const { data: messages = [] } = useQuery({
    queryKey: ['messages', scanId],
    queryFn: () => apiFetch<Message[]>(`/api/scans/${scanId}/messages`),
  });
  const { streaming, draft, error, send, stop } = useChatStream(scanId);

  const doSend = async (content: string) => {
    qc.setQueryData<Message[]>(['messages', scanId], (cur) => [
      ...(cur ?? []),
      { id: -Date.now(), scanId, role: 'user', content, createdAt: new Date().toISOString() },
    ]);
    const result = await send(content);
    if (result) {
      await qc.invalidateQueries({ queryKey: ['messages', scanId] });
    } else {
      await qc.invalidateQueries({ queryKey: ['messages', scanId] });
    }
  };

  const regenerate = useMutation({
    mutationFn: async () => {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      if (!lastAssistant || !lastUser) return;
      await apiFetch(`/api/scans/${scanId}/messages/${lastAssistant.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['messages', scanId] });
      await send(lastUser.content);
    },
  });

  const canRegenerate = !streaming && messages.some((m) => m.role === 'assistant');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Ask about this scan</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => regenerate.mutate()} disabled={!canRegenerate}>
          <RefreshCcw className="mr-1 h-3 w-3" />Regenerate
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <MessageList messages={messages} streamingDraft={streaming ? draft : null} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Composer onSend={doSend} onStop={stop} streaming={streaming} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Modify `web/app/(app)/scans/[id]/page.tsx`** to mount `ChatPanel`

Replace the `chat-slot` placeholder div with:

```tsx
import { ChatPanel } from '@/components/chat/ChatPanel';
// ... inside the return:
{data.status === 'completed' && <ChatPanel scanId={data.id} />}
```

(Full file: the existing page, with the `<div id="chat-slot">…</div>` replaced by the `<ChatPanel />` element and the `import` added at the top.)

- [ ] **Step 5: Seed an initial assistant explanation on first visit**

When the scan finishes and there are zero messages yet, automatically send a default user message asking for an explanation. Add to `ChatPanel` after the `useChatStream` line:

```tsx
const seeded = React.useRef(false);
React.useEffect(() => {
  if (seeded.current) return;
  if (!streaming && messages.length === 0) {
    seeded.current = true;
    void doSend('Please explain this scan result in plain language.');
  }
}, [streaming, messages.length]);
```

- [ ] **Step 6: Typecheck + build + full manual verification**

```bash
cd web && npm run typecheck && npm run build
docker compose up -d --build
```

Visit a completed scan. Verify:
- Chat opens with a seeded explanation streaming in.
- Typing a follow-up and pressing Enter sends; Shift+Enter makes newline.
- Stop button aborts mid-stream; partial text remains but no server record.
- Regenerate replaces the last answer.
- Scrolling up pauses auto-scroll and shows "Jump to latest"; clicking it re-engages.
- Markdown (lists, code blocks, bold) renders.

- [ ] **Step 7: Commit**

```bash
git add web/components/chat web/app/\(app\)/scans/\[id\]/page.tsx web/package.json web/package-lock.json
git commit -m "feat(web): streaming chat panel with markdown, stop, regenerate"
```

---

## Phase 15 — E2E Smoke Tests (Playwright)

**Goal:** Two smoke tests exercising the whole stack via `docker compose`.

### Task 15.1: Playwright configuration

**Files:**
- Create: `web/tests/e2e/playwright.config.ts`
- Create: `web/tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Write `web/tests/e2e/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 2: Write `web/tests/e2e/smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

const uniq = () => `e2e${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;

test('register, upload a sample, see result', async ({ page }) => {
  await page.goto('/register');
  const email = uniq();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('hunter22!');
  await page.getByRole('button', { name: /sign up/i }).click();
  await page.waitForURL('/');

  const file = path.resolve(__dirname, '..', '..', '..', 'files', 'newegg_magecart_skimmer.js');
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.waitForURL(/\/scans\/\d+/);

  await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 180_000 });
});

test('chat panel streams an explanation', async ({ page }) => {
  await page.goto('/register');
  const email = uniq();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('hunter22!');
  await page.getByRole('button', { name: /sign up/i }).click();
  await page.waitForURL('/');

  const file = path.resolve(__dirname, '..', '..', '..', 'files', 'newegg_magecart_skimmer.js');
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.waitForURL(/\/scans\/\d+/);
  await expect(page.getByText(/scan result/i)).toBeVisible({ timeout: 180_000 });
  await expect(page.getByRole('heading', { name: /ask about this scan/i })).toBeVisible();
  await expect(page.locator('.prose').first()).toContainText(/./, { timeout: 90_000 });
});
```

- [ ] **Step 3: Install browsers**

```bash
cd web && npx playwright install chromium
```

- [ ] **Step 4: Run the suite against a live stack**

```bash
# in one shell:
docker compose up -d --build
# wait ~30s for healthy
sleep 30
# in another shell:
cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test
```

Expected: 2 tests pass. If Gemini/VT API keys are missing, the first test will pass but the second will time out — configure `.env` with real keys.

- [ ] **Step 5: Commit**

```bash
git add web/tests web/package.json web/package-lock.json
git commit -m "test(web): playwright smoke e2e tests"
```

---

## Phase 16 — CI Pipeline (GitHub Actions)

### Task 16.1: ci.yml

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  api:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: api } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm', cache-dependency-path: api/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test

  web:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: web } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm', cache-dependency-path: web/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build

  e2e:
    needs: [api, web]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - name: Create .env for compose
        run: |
          cp .env.example .env
          sed -i 's/^SESSION_SECRET=.*/SESSION_SECRET=0123456789abcdef0123456789abcdef0123/' .env
          sed -i 's#^VT_API_KEY=.*#VT_API_KEY=${{ secrets.VT_API_KEY }}#' .env
          sed -i 's#^GEMINI_API_KEY=.*#GEMINI_API_KEY=${{ secrets.GEMINI_API_KEY }}#' .env
      - name: Boot stack
        run: docker compose up -d --build
      - name: Wait for web healthy
        run: |
          for i in $(seq 1 60); do
            if curl -sf http://localhost:3000 > /dev/null; then echo ok; exit 0; fi
            sleep 2
          done
          docker compose logs
          exit 1
      - name: Install playwright
        working-directory: web
        run: npm ci && npx playwright install --with-deps chromium
      - name: Run e2e
        working-directory: web
        env: { E2E_BASE_URL: http://localhost:3000 }
        run: npx playwright test
      - name: Upload artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with: { name: playwright-report, path: web/playwright-report }
      - name: Stack logs on failure
        if: failure()
        run: docker compose logs --no-color
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add github actions pipeline for api, web, and e2e"
```

---

## Phase 17 — CD Pipeline + EC2 Bootstrap

### Task 17.1: deploy.yml

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build & push api
        uses: docker/build-push-action@v6
        with:
          context: ./api
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/api:${{ github.sha }}
            ghcr.io/${{ github.repository }}/api:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Build & push web
        uses: docker/build-push-action@v6
        with:
          context: ./web
          push: true
          tags: |
            ghcr.io/${{ github.repository }}/web:${{ github.sha }}
            ghcr.io/${{ github.repository }}/web:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy over SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /opt/webtest
            echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io -u ${{ github.actor }} --password-stdin
            export IMAGE_TAG=${{ github.sha }}
            export API_IMAGE=ghcr.io/${{ github.repository }}/api:$IMAGE_TAG
            export WEB_IMAGE=ghcr.io/${{ github.repository }}/web:$IMAGE_TAG
            docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
            docker image prune -f
```

- [ ] **Step 2: Create `docker-compose.prod.yml` override (uses GHCR images instead of local build)**

```yaml
services:
  api:
    build: null
    image: ${API_IMAGE}
  web:
    build: null
    image: ${WEB_IMAGE}
  migrate:
    build: null
    image: ${API_IMAGE}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml docker-compose.prod.yml
git commit -m "cd: auto-deploy to ec2 via ghcr on push to main"
```

### Task 17.2: EC2 bootstrap script + backup cron

**Files:**
- Create: `scripts/bootstrap-ec2.sh`
- Create: `scripts/backup-db.sh`
- Create: `docs/deployment.md`

- [ ] **Step 1: Write `scripts/bootstrap-ec2.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Run as root on a fresh Ubuntu 24.04 EC2 instance.

apt-get update
apt-get install -y ca-certificates curl gnupg ufw
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

id -u deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
echo "Append the GHA deploy public key to /home/deploy/.ssh/authorized_keys"

mkdir -p /opt/webtest/backups
chown -R deploy:deploy /opt/webtest
echo "Copy docker-compose.yml, docker-compose.prod.yml, Caddyfile, and .env to /opt/webtest/ and chmod 600 .env"

cat > /etc/cron.d/webtest-backup <<'EOF'
0 3 * * * deploy /opt/webtest/backup-db.sh >> /var/log/webtest-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/webtest-backup

echo "Done. Review README.md next."
```

- [ ] **Step 2: Write `scripts/backup-db.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/webtest
STAMP=$(date +%F_%H%M)
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-webtest}" "${POSTGRES_DB:-webtest}" | gzip > "backups/${STAMP}.sql.gz"
find backups -type f -mtime +7 -delete
```

- [ ] **Step 3: Make scripts executable**

```bash
chmod +x scripts/bootstrap-ec2.sh scripts/backup-db.sh
```

- [ ] **Step 4: Write `docs/deployment.md`**

```markdown
# Deployment (AWS EC2)

## One-time host setup

1. Launch Ubuntu 24.04 LTS t3.small with a public IP and an Elastic IP attached.
2. SSH as `ubuntu` with your keypair, then: `sudo bash bootstrap-ec2.sh` (copy the script from `scripts/bootstrap-ec2.sh` first).
3. Paste your **GHA deploy key's public half** into `/home/deploy/.ssh/authorized_keys`.
4. Copy `docker-compose.yml`, `docker-compose.prod.yml`, `Caddyfile`, and `.env.example` to `/opt/webtest/` and rename `.env.example` → `.env`. Fill in production values. `chmod 600 .env`.
5. Point a DNS record (free DuckDNS subdomain works) to your Elastic IP. Set `PUBLIC_HOSTNAME` and `ACME_EMAIL` in `.env`.
6. First deploy: push to `main`. The `deploy.yml` workflow builds, pushes, and SSHes in to `docker compose up -d`.

## Required GitHub Actions secrets

| Secret | Description |
|---|---|
| `EC2_HOST` | Elastic IP or DNS name of the host |
| `EC2_USER` | `deploy` |
| `EC2_SSH_KEY` | Private half of the key whose public half is in `/home/deploy/.ssh/authorized_keys` |
| `GHCR_TOKEN` | GitHub PAT with `read:packages` (or rely on `GITHUB_TOKEN` if repo is public) |
| `VT_API_KEY`, `GEMINI_API_KEY` | Only needed by the `e2e` job in ci.yml |

## Rollback

Re-run a prior successful `deploy.yml` run from the Actions tab with `workflow_dispatch`.

## Logs

```bash
ssh deploy@EC2_HOST
cd /opt/webtest
docker compose logs -f api
docker compose logs -f web
```

## Backup restore

```bash
gunzip < backups/2026-04-23_0300.sql.gz | docker compose exec -T db psql -U webtest webtest
```
```

- [ ] **Step 5: Commit**

```bash
git add scripts docs/deployment.md
git commit -m "docs: ec2 bootstrap, backups, deployment runbook"
```

---

## Phase 18 — Documentation & README

### Task 18.1: Rewrite root README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the existing `README.md` with the project README.**

The existing `README.md` is the assignment prompt and should be moved to `docs/assignment.md`; write a new top-level `README.md` that covers: project description, architecture diagram (same as spec §3), quick start, environment variables, testing, deployment link, screenshot/demo section, tech choices rationale, known limitations.

**Commands to execute:**

```bash
git mv README.md docs/assignment.md
```

Then write `README.md` with this structure — fill every section with real content; no placeholders:

```markdown
# VirusTotal + Gemini File Scanner

Upload files, scan them with VirusTotal, get AI-powered explanations via Gemini.

## Stack
- Next.js 15 · Tailwind · Shadcn UI · TanStack Query
- Express.js · TypeScript · PostgreSQL · SSE streaming
- Docker Compose (Podman-compatible) · Caddy (HTTPS) · GitHub Actions CI/CD · AWS EC2

## Architecture
<insert the architecture diagram from the spec §3>

## Quick start

```bash
git clone <this repo>
cd webtest
cp .env.example .env
# edit .env: set SESSION_SECRET (32+ chars), VT_API_KEY, GEMINI_API_KEY
docker compose up -d --build
# visit http://localhost (or localhost:3000 without Caddy)
```

Works identically under Podman: replace `docker` with `podman` (or use `podman compose`).

## Environment variables
<list from .env.example with a one-line description of each>

## Testing
- API: `cd api && npm test` (unit + integration, real Postgres via Testcontainers)
- Web: `cd web && npm run build && npx playwright test` (smoke e2e against running stack)

## Deployment
See `docs/deployment.md`. Auto-deploys via GitHub Actions on push to `main`.

## Rationale & trade-offs
- Streaming directly to VirusTotal avoids disk I/O and keeps the server stateless for file handling.
- SSE (not polling) gives a natural "live" progress UX and a single, clean contract for both scan progress and chat tokens.
- Separate `api`/`web` services keep images small and responsibilities explicit, at the cost of one extra container.
- Sessions in Postgres (not JWT) so logout actually invalidates credentials server-side.

## Known limitations
- VirusTotal free tier (4 req/min, 500/day) will throttle under concurrent load.
- No password reset or email verification.
- Single-instance rate limiting — if horizontally scaled, move to Redis.

## Assignment prompt
See `docs/assignment.md`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md docs/assignment.md
git commit -m "docs: rewrite root README and move assignment prompt to docs/"
```

---

## Self-Review (run inline, fix as you go)

**1. Spec coverage** — every section of the spec has at least one task:
- §3 Architecture → Phase 2 (compose), §11 (deployment)
- §4 Data model → Phase 3
- §5 API surface → Phases 5, 6, 7, 8, 9
- §6 Flows → Phase 6 (6.1), Phase 7 (6.2), Phase 8 (6.3)
- §7 Frontend → Phases 10–14
- §8 Security → covered across Phases 5, 6, 9, 10
- §9 Testing → Phases 5, 6, 7, 8, 15
- §10 CI/CD → Phases 16, 17
- §11 Deployment → Phase 17
- §12 Containerization → Phase 2
- §13 Observability → Phase 4 (logger, healthz)
- §14 Risks → noted in plan front matter; revisable cuts listed if time-constrained

**2. Placeholder scan** — no "TBD", "handle edge cases", "add validation" without code. Every step that changes code shows code. Every command shows expected output. ✓

**3. Type consistency** — `Scan` shape matches between `api/src/services/scans.ts` (database row → object) and `web/lib/types.ts` (API response). The `result` field is `unknown` on both sides — safe. `Message.role` values agree across API, DB, and web types. ✓

**Execution notes for the worker:**
- Every commit message must follow the `type(scope): subject` convention used in this plan. **NO Co-Authored-By, NO AI-attribution trailers, NO mention of Claude or Anthropic.**
- Before each frontend phase (10, 11, 12, 13, 14), invoke `impeccable:impeccable` to set the quality bar.
- Full test suite (`cd api && npm test && cd ../web && npm run build`) should be green before ending each phase.
