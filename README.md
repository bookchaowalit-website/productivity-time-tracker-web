# Time tracker

A labelled stopwatch with a session history: start, stop, see each session and the total, for all time or today. Everything stays in this browser. The page uses the shared App shell look (see `APP-SHELL.md`); there is no analytics.

Live: https://time-tracker.bookchaowalit.com (Vercel Git deploy on push to `main`).

## What it does not do

- No tags, reports, export, billing, account or sync.

## Run

```bash
npm ci
npm run dev
```

## Checks

```bash
npm test           # Vitest: session rules, saved-data parsing, local store, MCP route, server render, mounted happy-dom flows (start/stop, lists, remove/clear + Undo), redirects, Sentry scrubbing
npm run lint
npm run typecheck
npm run build
```

CI (`.github/workflows/ci.yml`) runs the shared Node workflow (with a line-coverage gate) and the shared security
scan on every push and PR to `main`.

## Code map

- `lib/time-tracker.ts`: duration and date formatting, start/stop/remove/restore rules, the All/Today lists, saved-data parsing, the localStorage store and a hydration-safe clock store.
- `lib/local-store.ts`: small localStorage store for `useSyncExternalStore` (hydration-safe, works when storage is blocked).
- `app/api/mcp/route.ts`: stateless JSON-RPC endpoint; `initialize` and an empty `tools/list`, every call refused.
- `lib/sentry.ts` + `instrumentation*.ts`: error reporting to Sentry, errors only, personal data stripped; off when `NEXT_PUBLIC_SENTRY_DSN` is unset.
- `app/page.tsx` + `components/app-shell.tsx` + `app/app-shell.css`: the App shell page (top bar, All/Today lists, timer card, history rows, Undo toast, footer back to bookchaowalit.com).
- `app/robots.ts`, `app/sitemap.ts`, `lib/site.ts`: canonical origin https://time-tracker.bookchaowalit.com. `/more-projects` is a 308 redirect to https://bookchaowalit.com/ (`next.config.ts`).
