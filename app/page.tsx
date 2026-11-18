"use client";

import { memo, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { AppFoot, AppTop, ListButton, Pill } from "@/components/app-shell";
import {
  activeSession,
  clockStore,
  formatDate,
  formatDuration,
  listSessions,
  removeSessions,
  restoreSessions,
  sessionDuration,
  sessionStore,
  startSession,
  stopSession,
  totalDuration,
  type Session,
  type SessionList,
} from "@/lib/time-tracker";

const LISTS: { value: SessionList; label: string }[] = [
  { value: "all", label: "All sessions" },
  { value: "today", label: "Today" },
];

const plural = (count: number) => `${count} ${count === 1 ? "session" : "sessions"}`;

type RowProps = { session: Session; duration: string; onRemove: (session: Session, viaKeyboard: boolean) => void };

/**
 * One history row. The clock ticks twice a second, so finished rows (whose duration text never
 * changes) skip re-rendering. onRemove is left out of the comparison on purpose: the page's remove
 * handler reads only the store and refs, so an older copy behaves the same.
 */
const SessionRow = memo(function SessionRow({ session, duration, onRemove }: RowProps) {
  const live = session.end === null;
  const started = formatDate(session.start);
  return (
    <li className="as-row">
      <div>
        <h3>{session.label}</h3>
        <p>{started}{live ? " · still running" : ` → ${formatDate(session.end!)}`}</p>
      </div>
      <Pill tone={live ? "green" : "grey"}><span className="as-sr">{live ? "Running, " : "Duration "}</span>{duration}</Pill>
      <button type="button" className="as-plain as-danger" aria-label={`Remove ${session.label}, ${started}`} onClick={(event) => onRemove(session, event.detail === 0)}>Remove</button>
    </li>
  );
}, (before, after) => before.session === after.session && before.duration === after.duration);

export default function Home() {
  const sessions = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  // 0 on the server and during hydration, so no visitor clock is baked into the HTML.
  const now = useSyncExternalStore(clockStore.subscribe, clockStore.getSnapshot, clockStore.getServerSnapshot);
  const [list, setList] = useState<SessionList>("all");
  const [label, setLabel] = useState("Deep work");
  // Every removal still inside its Undo window, oldest first. Undo restores all of them.
  const [removed, setRemoved] = useState<{ batches: { sessions: Session[]; at: number }[]; message: string; viaKeyboard: boolean } | null>(null);
  const [toastFocused, setToastFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const labelRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef<"start" | "stop" | null>(null);
  const focusAfterToast = useRef(false);
  // The committed Undo state, for handlers that may come from an older render (memoized rows).
  const removedRef = useRef(removed);
  useEffect(() => { removedRef.current = removed; }, [removed]);

  const active = activeSession(sessions);
  const visible = listSessions(sessions, list, now);
  const title = LISTS.find((entry) => entry.value === list)!.label;

  // Start and Stop swap places; keep keyboard focus on the button that replaced the one pressed.
  useEffect(() => {
    const target = focusAfterToggle.current;
    focusAfterToggle.current = null;
    if (target === "stop") stopRef.current?.focus();
    if (target === "start") startRef.current?.focus();
  }, [active]);
  useEffect(() => {
    if (removed?.viaKeyboard) undoRef.current?.focus();
    // After Undo or Escape, focus the field (Ready) or Stop (Running), whichever this render shows.
    if (!removed && focusAfterToast.current) {
      focusAfterToast.current = false;
      (labelRef.current ?? stopRef.current)?.focus();
    }
  }, [removed]);
  useEffect(() => {
    if (!removed || toastFocused) return;
    const timer = window.setTimeout(() => setRemoved(null), 6000);
    return () => window.clearTimeout(timer);
  }, [removed, toastFocused]);

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = label.trim() || "Untitled";
    // Start comes from the button or Enter in the field; either way the next useful key is Stop.
    focusAfterToggle.current = "stop";
    sessionStore.update((current) => startSession(current, label, crypto.randomUUID(), Date.now()));
    setAnnouncement(`Started “${name}”.`);
  }
  function stop() {
    if (!active) return;
    if (document.activeElement === stopRef.current) focusAfterToggle.current = "start";
    sessionStore.update((current) => stopSession(current, Date.now()));
    const ended = sessionStore.getSnapshot().find((session) => session.id === active.id) ?? active;
    setAnnouncement(`Stopped “${ended.label}” after ${formatDuration(sessionDuration(ended, ended.end ?? ended.start))}.`);
  }
  function discard(gone: Session[], message: string, viaKeyboard: boolean) {
    let at = 0;
    let taken: Session[] = [];
    sessionStore.update((current) => {
      at = Date.now();
      // Keep the sessions as they are in the store now (another tab may have stopped one since
      // this render), so Undo puts back exactly what was removed.
      const ids = new Set(gone.map((session) => session.id));
      taken = current.filter((session) => ids.has(session.id));
      return removeSessions(current, taken);
    });
    if (!taken.length) return;
    // A second removal inside the Undo window joins the first instead of replacing it.
    const batches = [...(removedRef.current?.batches ?? []), { sessions: taken, at }];
    const count = batches.reduce((sum, batch) => sum + batch.sessions.length, 0);
    const text = batches.length === 1 ? message : `Removed ${plural(count)}`;
    setRemoved({ batches, message: text, viaKeyboard });
    setAnnouncement(`${text}. Undo is available for a few seconds.`);
  }
  function removeOne(session: Session, viaKeyboard: boolean) {
    discard([session], `Removed “${session.label}”`, viaKeyboard);
  }
  function closeToast() {
    focusAfterToast.current = true;
    setRemoved(null);
    setToastFocused(false);
  }
  function undo() {
    if (!removed) return;
    const { batches } = removed;
    // Newest batch first: an older running session must see the sessions started after its removal
    // (even ones removed later) so it ends at its removal time instead of counting their time twice.
    sessionStore.update((current) => batches.reduceRight((rest, batch) => restoreSessions(rest, batch.sessions, batch.at), current));
    setAnnouncement(`Restored ${plural(batches.reduce((sum, batch) => sum + batch.sessions.length, 0))}.`);
    closeToast();
  }

  const listTotal = totalDuration(visible, now);
  const running = active !== null;

  return (
    <div className="as">
      <a className="as-skip" href="#main">Skip to content</a>
      <AppTop name="Time tracker" tagline="Saved in this browser" />

      <div className="as-body">
        <aside className="as-side" aria-label="Lists">
          <h2>Lists</h2>
          <ul className="as-lists">
            {LISTS.map(({ value, label: name }) => (
              <ListButton key={value} label={name} count={listSessions(sessions, value, now).length} current={list === value} onSelect={() => setList(value)} />
            ))}
          </ul>
        </aside>

        <main id="main" className="as-main">
          <div className="as-head">
            <div>
              <h1>{title}</h1>
              <p>{visible.length ? `${formatDuration(listTotal)} logged · ${plural(visible.length)}` : list === "today" ? "Nothing logged today" : "Nothing logged yet"}</p>
            </div>
          </div>

          <form className="as-composer as-timer" onSubmit={start} aria-label="Timer">
            {running ? (
              <div className="as-timer-now">
                <span className="as-timer-kicker">Working on</span>
                <strong>{active.label}</strong>
              </div>
            ) : (
              <label className="as-field">What are you working on?
                <input ref={labelRef} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} autoComplete="off" placeholder="e.g. Deep work" />
              </label>
            )}
            <div className="as-timer-foot">
              <div className="as-timer-read">
                <span className="as-timer-clock" data-running={running ? "true" : undefined}>{running ? formatDuration(sessionDuration(active, now)) : "00:00:00"}</span>
                {running ? <Pill tone="green">Running</Pill> : <Pill tone="grey">Ready</Pill>}
              </div>
              {running ? (
                <button ref={stopRef} type="button" className="as-button as-button-stop" onClick={stop}>Stop</button>
              ) : (
                <button ref={startRef} type="submit" className="as-button">Start</button>
              )}
            </div>
          </form>

          {visible.length ? (
            <>
              <ul className="as-list" aria-label={`${title}, newest first`}>
                {visible.map((session) => (
                  <SessionRow key={session.id} session={session} duration={formatDuration(sessionDuration(session, now))} onRemove={removeOne} />
                ))}
              </ul>
              <div className="as-actions-row">
                <button type="button" className="as-plain as-danger" aria-label={`Clear list: ${plural(visible.length)} in ${title}`} onClick={(event) => discard(visible, `Cleared ${plural(visible.length)}`, event.detail === 0)}>Clear list</button>
              </div>
            </>
          ) : (
            <div className="as-list as-empty">
              {sessions.length === 0 ? (
                <><strong>No sessions yet</strong>Name what you are working on and press Start.</>
              ) : (
                <><strong>Nothing logged today</strong>Sessions you start today appear here. Older ones are in All sessions.</>
              )}
            </div>
          )}

          <p className="as-note">Sessions are saved in this browser only. There is no account and no sync, so another device or browser starts empty.</p>
        </main>
      </div>

      <p className="as-sr" role="status" aria-live="polite">{announcement}</p>
      {removed ? (
        <div
          className="as-toast"
          role="group"
          aria-label="Undo"
          onFocus={() => setToastFocused(true)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToastFocused(false); }}
          onKeyDown={(event) => { if (event.key === "Escape") closeToast(); }}
        >
          <span>{removed.message}</span>
          <button ref={undoRef} type="button" className="as-plain" onClick={undo}>Undo</button>
        </div>
      ) : null}

      <AppFoot source="https://github.com/bookchaowalit-website/productivity-time-tracker-web" />
    </div>
  );
}
