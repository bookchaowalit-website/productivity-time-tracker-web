# Design system

Time tracker uses the shared **App shell** (see `APP-SHELL.md`, `app/app-shell.css`,
`components/app-shell.tsx`), moved onto it on 2026-11-18. It replaced the earlier paper
"time card room" theme (system-only serif/sans fonts, 9-10px mono labels, low-contrast rust and
muted text).

## Tokens

All colours come from the shell's `--as-*` tokens, light and dark via `prefers-color-scheme`. Text
pairs pass 4.5:1 in both themes; input edges use `--as-field-line` (3:1+).

## Typography

Geist, loaded as a file with `next/font` (variable `--font-geist-sans` on `<html>`), like the other
App shell apps, so every platform renders the same face. Durations use tabular numbers. Nothing is smaller than 12px.

## Layout

Top bar, then lists (All sessions, Today) in a sidebar that becomes a pill row on phones, then the
head (list title, total and count), the timer card, the history list or its empty state, a note and
the footer. On phones the timer card and its Start button sit in the first screen.

## Components

- Timer card: visible label "What are you working on?", the clock, a status pill (Ready grey,
  Running green: text and tint, not colour alone) and the one filled button (Start or Stop).
- History rows: label, start and end time, a duration pill (green while running), and Remove,
  named after the session.
- Clear list: plain danger button under the list. Remove and Clear show an Undo toast for six
  seconds instead of a confirm dialog.
- Empty states: "No sessions yet" and "Nothing logged today".

## Do's and Don'ts

- Do make elapsed time and the running session unmistakable.
- Do keep browser-only persistence visible and honest.
- Don't imply payroll, sync, or team reporting.
