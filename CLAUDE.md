# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

BRANDO Sales Assistant — internal Next.js 16 app (App Router, TypeScript, Tailwind v4, shadcn/ui on **Base UI**, not Radix) backed by Firebase Auth + Firestore and Google APIs. UI text is Vietnamese with full diacritics. Setup/deploy details and Google Sheets formats are in README.md.

## Commands

On this Windows machine Node/Java may not be on PATH in Git Bash: prefix with
`export PATH="/c/Program Files/nodejs:/c/Program Files/Microsoft/jdk-21.0.13.21-hotspot/bin:$PATH"`.

- `npm run emulators` + `npm run dev` — local dev against Auth/Firestore emulators (`.env.local` from `.env.example`, `GOOGLE_MODE=mock`).
- `npm test` — Vitest unit tests (`tests/unit`). Single test: `npx vitest run tests/unit -t "<name>"`.
- `npm run test:rules` — Security Rules tests in `tests/rules` (spawns Firestore emulator).
- `npm run test:e2e` — Playwright acceptance tests (spawns emulators + `next dev -p 3100`). Single: `npm run test:e2e -- -g "<name>"`.
- `npm run typecheck`, `npm run lint`, `npx next build`.

Local login: with `NEXT_PUBLIC_USE_EMULATORS=true` the login page shows an "Đăng nhập thử" form that signs in any email via the Auth emulator. Emails in `ADMIN_EMAILS` get the admin role on first login only (later role changes go through `/admin`). When `catalog/meta` is missing (fresh emulator, new project), `AppShell` calls `POST /api/catalog/ensure` after login and any signed-in user triggers the first sync; later refreshes stay admin-only ("Đồng bộ lại"). E2E helpers for this live in `tests/e2e/helpers.ts`.

## Architecture

- **Two auth layers.** Browser uses Firebase client SDK (realtime `onSnapshot`) and exchanges the ID token at `POST /api/auth/session` for an httpOnly `__session` cookie. Server code (`src/server/auth.ts`) verifies that cookie, re-checks the email domain, and loads `users/{uid}` (role `sales|lead|admin`, `teamId`, `active`). The `(app)` route-group layout redirects to `/login` without a valid session.
- **Write split.** Clients may only write: per-field updates to `clients/{id}.sections.*` / `business.*` / `status`, plus `presence`, `locks`, `activity`, `meetings` subcollections. Everything authoritative — creating clients, members, assessments, quotes, comments, catalog, users — goes through Route Handlers in `src/app/api/**` using the Admin SDK. `firestore.rules` enforces this; keep rules and handlers in sync and extend `tests/rules` when changing access.
- **Domain is in two places**: `NEXT_PUBLIC_ALLOWED_DOMAIN` (`src/lib/config.ts`) and the regex in `firestore.rules`.
- **Google adapters** (`src/server/google/*`) all branch on `GOOGLE_MODE` (`mock` | `live`). Mock mode reads fixtures from `src/server/fixtures/sheets.ts` (overridable via Firestore doc `_mock/sheets`, used by e2e test 5) and writes fake Drive output to `_mock/drive/files`. Any new Google integration needs a mock path so e2e tests keep running offline.
- **Catalog cache**: admin "Đồng bộ lại" (`/api/admin/sync`) parses Sheets (`src/lib/sheets-parse.ts`) into `catalog/{prices,rules,industries,stats}` docs. Quotes snapshot line prices at creation; never recompute old quotes from the catalog.
- **Pure business logic lives in `src/lib`** and is shared by server and client preview: `pricing.ts` (VND rounding; server is authoritative), `stats-guard.ts` (strips any sentence whose numbers are not in the STATS library — applied to Gemini output, sales edits, and quote benefits), `packages.ts` (RULES → Cơ bản/Khuyến nghị/Toàn diện, budget warning, never auto-discount), `present.ts` (whitelist for `/present`).
- **`/present/[id]`** is a server component rendering only `toPresentation()` output; never pass raw client/assessment objects to it or its client children (e2e test 7 checks the HTML).
- **Realtime collaboration**: `src/hooks/collab.ts` (presence heartbeat, soft field locks in `clients/{id}/locks/{path with . → __}` expiring after 60 s, per-field `updateDoc` + activity log) and `src/components/editable-field.tsx`.
- **Assessments** store `ai` (original) and `edited` (sales version) in `clients/{id}/assessment/current`; UI shows `edited ?? ai`.

## Gotchas

- Next 16: `params`/`cookies()` are async; `middleware` is now `proxy`; `cacheComponents` was deliberately removed from `next.config.ts` (all pages are per-user dynamic). Pages using `useSearchParams` must be under `<Suspense>`.
- Base UI components: use `buttonVariants()` on `<Link>` rather than `<Button render={<Link/>}>`.
- Admin Firestore uses `ignoreUndefinedProperties: true` (Places responses have missing fields).
- Comments query (`section` + `createdAt`) needs the composite index in `firestore.indexes.json` in production.
