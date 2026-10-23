# Time Card Room (time tracker) — Product truth

> Inferred from the code and copy (no user interview). Checked against the portfolio card claims review
> (`portfolio-site-web/docs/audits/CARD-CLAIMS-REVIEW-2026-10.md`, row `time-tracker`) on 2026-10-23.

## What it is

A client-only labelled stopwatch with a local history: start a session with a label, stop it, and keep the sessions in this browser's localStorage.

## Who it is for

A portfolio visitor who wants a small honest stopwatch for the task in front of them.

## What works today

1. Label a session, Start, Stop. Only one session runs at a time; a running session keeps running across reloads.
2. The ledger lists each session with start/end time and duration; the total adds them up, including the running one.
3. Remove one session or clear the register. A saved value of the wrong shape is ignored; bad entries (or an end before the start) are dropped.
4. `/api/mcp` answers JSON-RPC `initialize` and `tools/list` with an empty tool list: sessions stay in the visitor's browser, so any `tools/call` is refused with an error.
5. Front-end and server errors go to Sentry (errors only, personal data stripped) when `NEXT_PUBLIC_SENTRY_DSN` is set.

## What does not work (and must not be claimed)

- No tags, manual entry, weekly or monthly reports, billable rates, CSV export or invoice integration (removed from the portfolio card in the 2026-10 review).
- No account or sync: the register lives in one browser on one device.

## Live URL and deploy state

- Live: https://time-tracker.bookchaowalit.com (HTTP 200 on 2026-10-23).
- The Vercel project `bookchaowalit-time-tracker-frontend` is deployed only by CLI. Its last production deploy is the CVE patch (2026-10-23, CLI, commit 2bac040). Its Git link names the old repository `bookchaowalit/bookchaowalit-time-tracker-frontend`, so a push to `main` does not deploy: the L2 work stays undeployed until the owner reconnects Vercel Git to this repository (owner action D9). `NEXT_PUBLIC_SENTRY_DSN` is already set on the Vercel project (Sentry project `productivity-time-tracker-web`, org `personal-yu0`).

## Boundaries

- Browser-only apart from the stateless `/api/mcp` route.
