"use client";

import { memo, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { AppFoot, AppTop, ListButton, Pill } from "@/components/app-shell";
import {
  activeSession,
  clockStore,
  currentTimeZone,
  formatDate,
  formatDuration,
  listSessions,
  removeSessions,
  latestStartSeq,
  restoreSessions,
  sessionDuration,
  editSession,
  fromLocalInput,
  sessionsCsv,
  sessionStore,
  startSession,
  toLocalInput,
  takeStartSeq,
  stopSession,
  totalDuration,
  type Session,
  type SessionEdit,
  type SessionList,
} from "@/lib/time-tracker";

const LISTS: { value: SessionList; label: string }[] = [
  { value: "all", label: "All sessions" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
];

const plural = (count: number) => `${count} ${count === 1 ? "session" : "sessions"}`;

type RowProps = {
  session: Session;
  duration: string;
  zone: string;
  editing: boolean;
  onRemove: (session: Session, viaKeyboard: boolean) => void;
  onEdit: (session: Session) => void;
  onSave: (id: string, edit: SessionEdit) => string | null;
  onCancel: () => void;
};

/**
 * Inline editor for one saved session. The times are datetime-local (minutes); a field left as it
 * was keeps the saved timestamp, seconds included. A running session edits its name and start only.
 */
function EditForm({ session, onSave, onCancel }: { session: Session; onSave: RowProps["onSave"]; onCancel: () => void }) {
  const initialStart = toLocalInput(session.start);
  const initialEnd = session.end === null ? "" : toLocalInput(session.end);
  const [label, setLabel] = useState(session.label);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);
  const errorId = `edit-error-${session.id}`;
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const edit: SessionEdit = {
      label,
      start: start === initialStart ? session.start : fromLocalInput(start),
      end: session.end === null ? null : end === initialEnd ? session.end : fromLocalInput(end),
    };
    setError(onSave(session.id, edit));
  }
  return (
    <form className="as-edit" onSubmit={save} aria-label={`Edit ${session.label}`} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}>
      <label className="as-field">Task
        <input ref={firstRef} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} autoComplete="off" />
      </label>
      <div className="as-edit-times">
        <label className="as-field">Start
          <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined} />
        </label>
        {session.end === null ? null : (
          <label className="as-field">End
            <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined} />
          </label>
        )}
      </div>
      {error ? <p id={errorId} className="as-edit-error" role="alert">{error}</p> : null}
      <div className="as-composer-actions">
        <button type="submit" className="as-button">Save</button>
        <button type="button" className="as-plain" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/**
 * One history row. The clock ticks twice a second, so finished rows (whose duration text never
 * changes) skip re-rendering unless the viewer's time zone or edit state changes. The handlers are left out of the comparison on purpose: the page's
 * handlers read only the store and refs, so an older copy behaves the same.
 */
const SessionRow = memo(function SessionRow({ session, duration, zone, editing, onRemove, onEdit, onSave, onCancel }: RowProps) {
  const live = session.end === null;
  const started = formatDate(session.start, zone);
  if (editing) {
    return <li className="as-row as-row-edit"><EditForm session={session} onSave={onSave} onCancel={onCancel} /></li>;
  }
  return (
    <li className="as-row as-row-session">
      <div>
        <h3>{session.label}</h3>
        <p>{started}{live ? " · still running" : ` → ${formatDate(session.end!, zone)}`}</p>
      </div>
      <Pill tone={live ? "green" : "grey"}><span className="as-sr">{live ? "Running, " : "Duration "}</span>{duration}</Pill>
      <div className="as-row-actions">
        <button type="button" className="as-plain" data-edit={session.id} aria-label={`Edit ${session.label}, ${started}`} onClick={() => onEdit(session)}>Edit</button>
        <button type="button" className="as-plain as-danger" aria-label={`Remove ${session.label}, ${started}`} onClick={(event) => onRemove(session, event.detail === 0)}>Remove</button>
      </div>
    </li>
  );
}, (before, after) => before.session === after.session && before.duration === after.duration && before.zone === after.zone && before.editing === after.editing);

export default function Home() {
  const sessions = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  // 0 on the server and during hydration, so no visitor clock is baked into the HTML.
  const now = useSyncExternalStore(clockStore.subscribe, clockStore.getSnapshot, clockStore.getServerSnapshot);
  const [list, setList] = useState<SessionList>("all");
  const [label, setLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // After Save or Cancel, focus returns to that row's Edit button.
  const focusEditOf = useRef<string | null>(null);
  // Every removal still inside its Undo window, oldest first. Undo restores all of them.
  const [removed, setRemoved] = useState<{ batches: { sessions: Session[]; at: number }[]; message: string; viaKeyboard: boolean } | null>(null);
  const [toastFocused, setToastFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const labelRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const focusAfterToggle = useRef<"start" | "stop" | null>(null);
  const focusAfterToast = useRef(false);
  // The committed Undo state, for handlers that may come from an older render (memoized rows).
  const removedRef = useRef(removed);
  useEffect(() => { removedRef.current = removed; }, [removed]);
  const editingIdRef = useRef(editingId);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);

  const active = activeSession(sessions);
  const visible = listSessions(sessions, list, now);
  // Read per render (one cheap lookup), so rows re-render if the device time zone changes.
  const zone = currentTimeZone();
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
  // While the toast shows, reserve its height (plus its 24px offset and a gap) at the page bottom,
  // so the footer links can scroll clear of it and focus scrolling keeps the focused link above it.
  const toastShown = removed !== null;
  useEffect(() => {
    if (!toastShown) return;
    const root = document.documentElement;
    const height = toastRef.current?.getBoundingClientRect().height || 52;
    root.style.setProperty("--as-toast-space", `${Math.ceil(height) + 24 + 16}px`);
    root.setAttribute("data-toast", "");
    return () => {
      root.removeAttribute("data-toast");
      root.style.removeProperty("--as-toast-space");
    };
  }, [toastShown]);
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
    const id = crypto.randomUUID();
    sessionStore.update((current) => (activeSession(current) ? current : startSession(current, label, id, Date.now(), takeStartSeq(current))));
    // The store re-reads storage, so another tab may already be timing: only claim a start that happened.
    const running = activeSession(sessionStore.getSnapshot());
    if (running?.id === id) setLabel("");
    setAnnouncement(running?.id === id ? `Started “${name}”.` : `Not started: “${running?.label ?? name}” is already running.`);
  }
  useEffect(() => {
    if (editingId !== null || !focusEditOf.current) return;
    const id = focusEditOf.current;
    focusEditOf.current = null;
    document.querySelector<HTMLButtonElement>(`[data-edit="${CSS.escape(id)}"]`)?.focus();
  }, [editingId]);
  function openEdit(session: Session) {
    setEditingId(session.id);
  }
  function closeEdit() {
    focusEditOf.current = editingIdRef.current;
    setEditingId(null);
  }
  function saveEdit(id: string, edit: SessionEdit): string | null {
    let error: string | null = null;
    sessionStore.update((current) => {
      const result = editSession(current, id, edit, Date.now());
      if (!result.ok) {
        error = result.error;
        return current;
      }
      return result.sessions;
    });
    if (error) return error;
    const saved = sessionStore.getSnapshot().find((session) => session.id === id);
    setAnnouncement(`Saved “${saved?.label ?? edit.label}”.`);
    closeEdit();
    return null;
  }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([sessionsCsv(visible, now)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `time-tracker-${list}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setAnnouncement(`Exported ${plural(visible.length)} as CSV.`);
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
    // Each batch goes back exactly as removed; restoreSessions then leaves only the newest session running.
    sessionStore.update((current) => {
      const latestSeq = latestStartSeq();
      return batches.reduceRight((rest, batch) => restoreSessions(rest, batch.sessions, batch.at, Date.now(), latestSeq), current);
    });
    setAnnouncement(`Restored ${plural(batches.reduce((sum, batch) => sum + batch.sessions.length, 0))}.`);
    closeToast();
  }

  const listTotal = totalDuration(visible, now);
  const finished = visible.filter((session) => session.end !== null);
  const running = active !== null;

  return (
    <div className="as">
      <a className="as-skip" href="#main">Skip to content</a>
      <AppTop name="Time tracker" tagline="Saved in this browser" />

      <div className="as-body">
        <aside className="as-side" aria-label="Lists">
          <h2>Lists</h2>
          {/* Counts wait for the clock (now 0 on the server and during hydration), so Today never shows 0 first. */}
          <ul className="as-lists" data-pending={now ? undefined : "true"}>
            {LISTS.map(({ value, label: name }) => (
              <ListButton key={value} label={name} count={listSessions(sessions, value, now).length} current={list === value} onSelect={() => setList(value)} />
            ))}
          </ul>
        </aside>

        <main id="main" className="as-main">
          <div className="as-head">
            <div>
              <h1>{title}</h1>
              <p>{visible.length ? `${formatDuration(listTotal)} logged · ${plural(visible.length)}` : list === "today" ? "Nothing logged today" : list === "week" ? "Nothing logged this week" : "Nothing logged yet"}</p>
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
          <p className="as-note as-note-top">Saved in this browser only: no account and no sync, so another device or browser starts empty.</p>

          {visible.length ? (
            <>
              <ul className="as-list" aria-label={`${title}, newest first`}>
                {visible.map((session) => (
                  <SessionRow key={session.id} session={session} duration={formatDuration(sessionDuration(session, now))} zone={zone} editing={editingId === session.id} onRemove={removeOne} onEdit={openEdit} onSave={saveEdit} onCancel={closeEdit} />
                ))}
              </ul>
              <div className="as-actions-row">
                <button type="button" className="as-plain" onClick={exportCsv}>Export CSV</button>
                {/* Clear list leaves a running session alone: it stops only with Stop (or its own Remove). */}
                {finished.length ? (
                  <button type="button" className="as-plain as-danger" aria-label={`Clear list: ${plural(finished.length)} in ${title}${running ? ", the running timer stays" : ""}`} onClick={(event) => discard(finished, `Cleared ${plural(finished.length)}`, event.detail === 0)}>{running && finished.length < visible.length ? "Clear finished" : "Clear list"}</button>
                ) : null}
              </div>
            </>
          ) : (
            <div className="as-list as-empty">
              {sessions.length === 0 ? (
                <><strong>No sessions yet</strong>Name what you are working on and press Start.</>
              ) : (
                <><strong>{list === "today" ? "Nothing logged today" : "Nothing logged this week"}</strong>{list === "today" ? "Sessions you start today appear here." : "Sessions you start from Monday appear here."} Older ones are in All sessions.</>
              )}
            </div>
          )}

        </main>
      </div>

      <p className="as-sr" role="status" aria-live="polite">{announcement}</p>
      {removed ? (
        <div
          ref={toastRef}
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
