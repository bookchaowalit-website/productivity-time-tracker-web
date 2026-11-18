"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { AppFoot, AppTop, ListButton, Pill } from "@/components/app-shell";
import {
  activeSession,
  clockStore,
  formatDate,
  formatDuration,
  listSessions,
  removeSession,
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

export default function Home() {
  const sessions = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  // 0 on the server and during hydration, so no visitor clock is baked into the HTML.
  const now = useSyncExternalStore(clockStore.subscribe, clockStore.getSnapshot, clockStore.getServerSnapshot);
  const [list, setList] = useState<SessionList>("all");
  const [label, setLabel] = useState("Deep work");
  const [removed, setRemoved] = useState<{ sessions: Session[]; message: string; viaKeyboard: boolean } | null>(null);
  const [toastFocused, setToastFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const labelRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggle = useRef<"start" | "stop" | null>(null);

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
  useEffect(() => { if (removed?.viaKeyboard) undoRef.current?.focus(); }, [removed]);
  useEffect(() => {
    if (!removed || toastFocused) return;
    const timer = window.setTimeout(() => setRemoved(null), 6000);
    return () => window.clearTimeout(timer);
  }, [removed, toastFocused]);

  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = label.trim() || "Untitled";
    if (document.activeElement === startRef.current) focusAfterToggle.current = "stop";
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
    sessionStore.update((current) => gone.reduce((rest, session) => removeSession(rest, session.id), current));
    setRemoved({ sessions: gone, message, viaKeyboard });
    setAnnouncement(`${message}. Undo is available for a few seconds.`);
  }
  function closeToast() {
    setRemoved(null);
    setToastFocused(false);
    labelRef.current?.focus();
  }
  function undo() {
    if (!removed) return;
    sessionStore.update((current) => restoreSessions(current, removed.sessions, Date.now()));
    setAnnouncement(`Restored ${plural(removed.sessions.length)}.`);
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
                {visible.map((session) => {
                  const live = session.end === null;
                  return (
                    <li className="as-row" key={session.id}>
                      <div>
                        <h3>{session.label}</h3>
                        <p>{formatDate(session.start)}{live ? " · still running" : ` → ${formatDate(session.end!)}`}</p>
                      </div>
                      <Pill tone={live ? "green" : "grey"}><span className="as-sr">{live ? "Running, " : "Duration "}</span>{formatDuration(sessionDuration(session, now))}</Pill>
                      <button type="button" className="as-plain as-danger" aria-label={`Remove ${session.label}, ${formatDate(session.start)}`} onClick={(event) => discard([session], `Removed “${session.label}”`, event.detail === 0)}>Remove</button>
                    </li>
                  );
                })}
              </ul>
              <div className="as-actions-row">
                <button type="button" className="as-plain as-danger" aria-label={`Clear ${plural(visible.length)} from ${title}`} onClick={(event) => discard(visible, `Cleared ${plural(visible.length)}`, event.detail === 0)}>Clear list</button>
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
