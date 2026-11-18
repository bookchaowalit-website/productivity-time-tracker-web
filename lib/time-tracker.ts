// Time tracker: session rules, formatting and the browser-local stores. Pure apart from the stores at the end.
import { browserStorage, createLocalStore } from "@/lib/local-store";

/**
 * `removedAt` is set only on a session that was removed while running and brought back running by
 * Undo: it records when it was removed, so a later Undo in another tab can end it there.
 */
export type Session = { id: string; label: string; start: number; end: number | null; removedAt?: number };

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
export function startSession(sessions: Session[], label: string, id: string, now: number): Session[] {
  if (activeSession(sessions)) return sessions;
  return [{ id, label: label.trim() || "Untitled", start: now, end: null }, ...sessions];
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
 */
export function restoreSessions(sessions: Session[], removed: Session[], removedAt: number, now: number): Session[] {
  const ids = new Set(sessions.map((session) => session.id));
  const back = removed
    .filter((session) => !ids.has(session.id))
    // Stamp this removal's time, replacing an older mark from an earlier remove + Undo of the same session.
    .map((session) => (session.end === null ? { ...session, removedAt } : session));
  return oneRunning(newestFirst([...sessions, ...back]), now);
}

/**
 * Newest first by start. Equal starts (a coarse Date.now()) are ordered by when they actually began:
 * only one session runs at a time, so of two with the same start the earlier one ended at that start
 * and the later one ends later or still runs. Remaining ties keep their list order (original index).
 */
function newestFirst(sessions: Session[]): Session[] {
  const endKey = (session: Session) => session.end ?? Infinity;
  return sessions
    .map((session, index) => ({ session, index }))
    .sort((a, b) => b.session.start - a.session.start || endKey(b.session) - endKey(a.session) || a.index - b.index)
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

export type SessionList = "all" | "today";

/** Sessions shown in a list. Today = started since local midnight, plus a running one. `now` 0 = no clock yet. */
export function listSessions(sessions: Session[], list: SessionList, now: number): Session[] {
  if (list === "all") return sessions;
  if (!now) return [];
  const midnight = startOfDay(now);
  return sessions.filter((session) => session.start >= midnight || session.end === null);
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
