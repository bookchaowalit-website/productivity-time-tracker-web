# Time tracker — Product truth

> Inferred from the code and copy (no user interview). Checked against the portfolio card claims review
> (`portfolio-site-web/docs/audits/CARD-CLAIMS-REVIEW-2026-10.md`, row `time-tracker`) on 2026-10-23.

## What it is

A client-only labelled stopwatch with a local history: start a session with a label, stop it, and keep the sessions in this browser's localStorage.

## Who it is for

A portfolio visitor who wants a small honest stopwatch for the task in front of them.

## What works today

1. Label a session, Start, Stop. Only one session runs at a time; a running session keeps running across reloads.
2. The ledger lists each session with start/end time and duration; the total adds them up, including the running one.
3. Switch between All sessions and Today (started since local midnight, plus a running one). Remove one session or clear the list on screen; both can be undone for six seconds. A saved value of the wrong shape is ignored; bad entries (or an end before the start) are dropped.
4. `/api/mcp` answers JSON-RPC `initialize` and `tools/list` with an empty tool list: sessions stay in the visitor's browser, so any `tools/call` is refused with an error.
5. Front-end and server errors go to Sentry (errors only, personal data stripped) when `NEXT_PUBLIC_SENTRY_DSN` is set.

## What does not work (and must not be claimed)

- No tags, manual entry, weekly or monthly reports, billable rates, CSV export or invoice integration (removed from the portfolio card in the 2026-10 review).
- No account or sync: the register lives in one browser on one device.

## Look

- 2026-11-18: moved onto the shared App shell (Geist, light + dark, 12px+ text, 44px targets, 4.5:1 contrast). Vercel Analytics and Speed Insights removed (owner decision 2026-11-17: no analytics, so no consent banner). Storage key `time-tracker-v2` and its shape are unchanged, so saved sessions still load; the only addition is an optional `removedAt` on a session that Undo brought back running (older data without it loads as before).

## Live URL and deploy state

- Live: https://time-tracker.bookchaowalit.com (HTTP 200 on 2026-10-23).
- The Vercel project `bookchaowalit-time-tracker-frontend` is Git-linked to this repository: a push to `main` deploys (per the parent brief, 2026-11-18; earlier it was CLI-only). `NEXT_PUBLIC_SENTRY_DSN` is already set on the Vercel project (Sentry project `productivity-time-tracker-web`, org `personal-yu0`).

## Known limits

- Order is by start time. If the system clock is set back between sessions, a later session can sort
  before an earlier one, so Undo may stop a timer that was actually started later.
- Interleaving Undo and Stop across two open tabs of the app can double-count the overlapping time.
- Sessions with the same start time are ordered by a start counter (`seq`). Sessions saved before
  2026-11-19 have none and fall back to "running or later-ended is newer"; with storage blocked the
  counter lasts for the visit only.

Open review findings (Codex, 2026-11-19), accepted for now and not yet fixed:

- If another tab stops A and starts B before this tab hears about it, Stop here stops B but the status
  message still names A (it reads the session this tab last rendered).
- Clear list announces the count this tab showed, not the number actually removed when another tab
  removed some first (the toast and Undo themselves act on what was removed).
- The session list and the All sessions / Today list use `list-style: none` outside a `<nav>` without
  `role="list"`, so VoiceOver on Safari may not announce them as lists.
- Undo restores each removal batch with its own merge and sort of the whole history; with 20,000 sessions
  and 300 single removals in one Undo window that is about 0.7 s before storage writes and rendering.
- The Undo focus, toast spacing and cross-tab behaviour are covered by happy-dom tests only; they have not
  been checked by hand in a real browser or with a screen reader.

## Boundaries

- Browser-only apart from the stateless `/api/mcp` route.
