// Time tracker: session rules, formatting and the browser-local stores. Pure apart from the stores at the end.
import { browserStorage, createLocalStore, type StorageLike } from "@/lib/local-store";

/**
 * `removedAt` is set only on a session that was removed while running and brought back running by
 * Undo: it records when it was removed, so a later Undo in another tab can end it there.
 */
export type Session = { id: string; label: string; start: number; end: number | null; removedAt?: number; seq?: number };
/**
 * `seq` is the start order: a counter taken when the session starts (see takeStartSeq). Two sessions
 * can share a `start` (coarse Date.now()), so Undo uses `seq` to tell which began later. Sessions
 * saved before `seq` existed have none and fall back to the end-time rule in newestFirst.
 */

export const STORE_KEY = "time-tracker-v2";

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours, minutes, remaining].map((part) => String(part).padStart(2, "0")).join(":");
}

// One formatter per time zone, created once: building an Intl.DateTimeFormat is slow, and a long
// history formats every row on each clock tick. The key is the resolved zone, so a changed device
// zone gets its own formatter instead of a stale one.
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** The viewer's current time zone (pass it to formatDate; rows re-render when it changes). */
export function currentTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatDate(timestamp: number, timeZone: string = currentTimeZone()): string {
  const key = timeZone;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone });
    dateFormatters.set(key, formatter);
  }
  return formatter.format(timestamp);
}

export function activeSession(sessions: Session[]): Session | null {
  return sessions.find((session) => session.end === null) ?? null;
}

/** A running session counts up to `now`; never negative (the clock may lag the start by one tick). */
export function sessionDuration(session: Session, now: number): number {
  return Math.max(0, (session.end ?? now) - session.start);
}

export function totalDuration(sessions: Session[], now: number): number {
  return sessions.reduce((sum, session) => sum + sessionDuration(session, now), 0);
}

/** Starts a session on top; refused (same array back) while another one is running. */
export function startSession(sessions: Session[], label: string, id: string, now: number, seq?: number): Session[] {
  if (activeSession(sessions)) return sessions;
  const session: Session = { id, label: label.trim() || "Untitled", start: now, end: null };
  if (seq !== undefined) session.seq = seq;
  return [session, ...sessions];
}

export const SEQ_KEY = "time-tracker-seq";
let memorySeq = 0;

/**
 * The next start order number. The counter lives under its own key, so removing a session never
 * lets a later start reuse its number; it is also kept above every `seq` in `sessions`. If storage
 * is blocked, an in-memory counter keeps it increasing for this visit.
 */
export function takeStartSeq(sessions: Session[], getStorage: () => StorageLike | undefined = browserStorage): number {
  // Every storage touch is inside a try, the window.localStorage getter included: a browser that
  // blocks storage throws a SecurityError there, and Start must still work on the in-memory counter.
  let saved = 0;
  try {
    saved = Number(getStorage()?.getItem(SEQ_KEY) ?? 0) || 0;
  } catch {
    // Blocked storage: the in-memory counter below still increases.
  }
  const highest = sessions.reduce((max, session) => (hasSeq(session) ? Math.max(max, session.seq) : max), 0);
  const seq = Math.max(saved, highest, memorySeq) + 1;
  memorySeq = seq;
  try {
    getStorage()?.setItem(SEQ_KEY, String(seq));
  } catch {
    // Storage is full or blocked: memorySeq carries the order.
  }
  return seq;
}

/** The highest start number handed out so far (shared storage counter or this visit's memory); never throws. */
export function latestStartSeq(getStorage: () => StorageLike | undefined = browserStorage): number {
  let saved = 0;
  try {
    saved = Number(getStorage()?.getItem(SEQ_KEY) ?? 0) || 0;
  } catch {
    // Blocked storage: this visit's counter is all there is.
  }
  return Math.max(saved, memorySeq);
}

function hasSeq(session: Session): session is Session & { seq: number } {
  return typeof session.seq === "number" && Number.isFinite(session.seq);
}

export function stopSession(sessions: Session[], now: number): Session[] {
  const active = activeSession(sessions);
  if (!active) return sessions;
  return sessions.map((session) => (session.id === active.id ? ended(session, Math.max(now, session.start)) : session));
}

export function removeSession(sessions: Session[], id: string): Session[] {
  return sessions.filter((session) => session.id !== id);
}

/** Removes several sessions in one pass (Clear list); a Set keeps it linear for long histories. */
export function removeSessions(sessions: Session[], gone: Session[]): Session[] {
  const ids = new Set(gone.map((session) => session.id));
  return sessions.filter((session) => !ids.has(session.id));
}

/** A copy of a session ended at `end` (and no longer marked as brought back by Undo). */
function ended(session: Session, end: number): Session {
  const copy: Session = { ...session, end };
  delete copy.removedAt;
  return copy;
}

/**
 * Undo: puts the sessions removed at `removedAt` back exactly as they were (no trimming, dropping or
 * moved starts), merged by id, newest first. A session that was running when removed comes back
 * marked with this removal's `removedAt` (kept until it ends). Then one rule keeps time from being counted twice:
 * only the newest session may be running. Any other running session ends at the earliest of its
 * removal time, the start of the next session after it, and `now`. Finished sessions are never changed.
 * `latestSeq` (from latestStartSeq) is the start counter now: a running session whose seq is below it
 * was overtaken by a later start, so it comes back ended at its removal time.
 */
export function restoreSessions(sessions: Session[], removed: Session[], removedAt: number, now: number, latestSeq = 0): Session[] {
  const ids = new Set(sessions.map((session) => session.id));
  const back = removed
    .filter((session) => !ids.has(session.id))
    .map((session) => {
      if (session.end !== null) return session;
      // A newer session started after this one (the start counter moved past its seq), even if that
      // one was removed since and is not in the list: come back stopped at the removal, never resumed.
      if (hasSeq(session) && latestSeq > session.seq) return ended(session, Math.max(session.start, Math.min(removedAt, now)));
      // Stamp this removal's time, replacing an older mark from an earlier remove + Undo of the same session.
      return { ...session, removedAt };
    });
  return oneRunning(newestFirst([...sessions, ...back]), now);
}

/**
 * Newest first by start. Equal starts (a coarse Date.now()) are ordered by their real start order:
 * `seq` when both have one; otherwise (sessions saved before `seq`) a running or later-ended one
 * counts as newer. Remaining ties keep their list order (original index).
 */
function newestFirst(sessions: Session[]): Session[] {
  const endKey = (session: Session) => session.end ?? Infinity;
  const bySeq = (a: Session, b: Session) => (hasSeq(a) && hasSeq(b) ? b.seq - a.seq : 0);
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) => b.session.start - a.session.start || bySeq(a.session, b.session) || endKey(b.session) - endKey(a.session) || a.index - b.index)
    .map(({ session }) => session);
}

/** `sessions` newest first. Only the newest may run; see restoreSessions. Linear in the list length. */
export function oneRunning(sessions: Session[], now: number): Session[] {
  let nextStart = Infinity; // start of the nearest session that starts later than the current one
  let laterStart = Infinity; // start of the session just before in the list (may equal the current start)
  return sessions.map((session, index) => {
    if (session.start < laterStart) nextStart = laterStart;
    laterStart = session.start;
    if (index === 0 || session.end !== null) return session;
    const removedAt = typeof session.removedAt === "number" ? session.removedAt : Infinity;
    return ended(session, Math.max(session.start, Math.min(removedAt, nextStart, now)));
  });
}

/** Local midnight of the day `now` falls on. */
export function startOfDay(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** Local midnight of the Monday that starts the week `now` falls in. */
export function startOfWeek(now: number): number {
  const day = new Date(startOfDay(now));
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}

export type SessionList = "all" | "today" | "week";

/**
 * Sessions shown in a list. Today = started since local midnight, This week = since Monday's local
 * midnight; both include a running one. `now` 0 = no clock yet.
 */
export function listSessions(sessions: Session[], list: SessionList, now: number): Session[] {
  if (list === "all") return sessions;
  if (!now) return [];
  const from = list === "today" ? startOfDay(now) : startOfWeek(now);
  return sessions.filter((session) => session.start >= from || session.end === null);
}

export type SessionEdit = { label: string; start: number; end: number | null };
export type EditResult = { ok: true; sessions: Session[] } | { ok: false; error: string };

/**
 * Changes a saved session's label, start and (for a finished one) end. A running session keeps
 * running: its end stays null. Times must be real, not in the future, and end after start.
 * The list is re-sorted newest first, since a new start can move the row.
 */
export function editSession(sessions: Session[], id: string, edit: SessionEdit, now: number): EditResult {
  const session = sessions.find((entry) => entry.id === id);
  if (!session) return { ok: false, error: "This session was removed in another tab." };
  const end = session.end === null ? null : edit.end;
  if (!Number.isFinite(edit.start) || (end !== null && !Number.isFinite(end))) return { ok: false, error: "Enter a full date and time." };
  if (edit.start > now || (end !== null && end > now)) return { ok: false, error: "Times cannot be in the future." };
  if (end !== null && end < edit.start) return { ok: false, error: "End must be after start." };
  const changed: Session = { ...session, label: edit.label.trim() || "Untitled", start: edit.start, end };
  return { ok: true, sessions: newestFirst(sessions.map((entry) => (entry.id === id ? changed : entry))) };
}

/** "YYYY-MM-DDTHH:mm" in local time, the value format of <input type="datetime-local">. */
export function toLocalInput(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses a datetime-local value as local time; NaN when empty or malformed. */
export function fromLocalInput(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  const [, y, mo, d, h, mi] = match.map(Number);
  return new Date(y, mo - 1, d, h, mi).getTime();
}

function csvCell(value: string): string {
  const safe = /^[=+\-@\t]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The sessions as CSV, oldest first: task, ISO start and end (empty while running), duration as
 * hh:mm:ss and in decimal hours. Cells that start like a formula are prefixed with ' so a
 * spreadsheet shows them as text.
 */
export function sessionsCsv(sessions: Session[], now: number): string {
  const lines = ["Task,Start,End,Duration,Hours"];
  for (const session of [...sessions].reverse()) {
    const duration = sessionDuration(session, now);
    lines.push([
      csvCell(session.label),
      new Date(session.start).toISOString(),
      session.end === null ? "" : new Date(session.end).toISOString(),
      formatDuration(duration),
      (duration / 3_600_000).toFixed(2),
    ].join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  return (
    typeof entry.id === "string" &&
    typeof entry.label === "string" &&
    finite(entry.start) &&
    (entry.end === null || (finite(entry.end) && (entry.end as number) >= (entry.start as number)))
  );
}

/** Saved sessions, or null when nothing usable is saved. Bad entries are dropped and at most one stays running. */
export function parseSessions(raw: string | null): Session[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    let running = false;
    return value.filter(isSession).filter((session) => {
      if (session.end !== null) return true;
      if (running) return false;
      running = true;
      return true;
    });
  } catch {
    return null;
  }
}

export const NO_SESSIONS: Session[] = [];

export const sessionStore = createLocalStore<Session[]>({
  key: STORE_KEY,
  fallback: NO_SESSIONS,
  parse: parseSessions,
  serialize: (sessions) => JSON.stringify(sessions),
  getStorage: browserStorage,
});

/** Wall clock for useSyncExternalStore, ticking twice a second. The server snapshot is 0 (no visitor clock). */
export const clockStore = {
  getSnapshot: () => Math.floor(Date.now() / 500) * 500,
  getServerSnapshot: () => 0,
  subscribe: (listener: () => void) => {
    const timer = setInterval(listener, 500);
    return () => clearInterval(timer);
  },
};
