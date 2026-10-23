# Time Card Room (time tracker)

A labelled stopwatch with a local register: start, stop, see each session and the total. Everything stays in this browser.

Live: https://time-tracker.bookchaowalit.com (deployed by Vercel CLI; it can lag `main`, see `PRODUCT.md`).

## What it does not do

- No tags, reports, export, billing, account or sync.

## Run

```bash
npm ci
npm run dev
```

## Checks

```bash
npm test           # Vitest: session rules and formatting, saved-data parsing, local store, MCP route, home page render, Sentry scrubbing
npm run lint
npm run typecheck
npm run build
```

CI (`.github/workflows/ci.yml`) runs the shared Node workflow (with a line-coverage gate) and the shared security
scan on every push and PR to `main`.

## Code map

- `lib/time-tracker.ts`: duration and date formatting, start/stop/remove rules, saved-data parsing, the localStorage store and a hydration-safe clock store.
- `lib/local-store.ts`: small localStorage store for `useSyncExternalStore` (hydration-safe, works when storage is blocked).
- `app/api/mcp/route.ts`: stateless JSON-RPC endpoint; `initialize` and an empty `tools/list`, every call refused.
- `lib/sentry.ts` + `instrumentation*.ts`: error reporting to Sentry, errors only, personal data stripped; off when `NEXT_PUBLIC_SENTRY_DSN` is unset.
- `app/more-projects/page.tsx`: shared portfolio link page (copied per repository, not a package).
