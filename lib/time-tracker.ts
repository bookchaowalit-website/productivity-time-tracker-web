// Time tracker: session rules, formatting and the browser-local stores. Pure apart from the stores at the end.
import { browserStorage, createLocalStore } from "@/lib/local-store";

export type Session = { id: string; label: string; start: number; end: number | null };

export const STORE_KEY = "time-tracker-v2";

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours, minutes, remaining].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatDate(timestamp: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone }).format(timestamp);
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
  return sessions.map((session) => (session.id === active.id ? { ...session, end: Math.max(now, session.start) } : session));
}

export function removeSession(sessions: Session[], id: string): Session[] {
  return sessions.filter((session) => session.id !== id);
}

/**
 * Puts sessions removed at `removedAt` back (Undo), newest first, without double-counting time. A
 * restored running session keeps running only when nothing was started after it was removed;
 * otherwise it ends at `removedAt`, so sessions never overlap and only one ever runs.
 */
export function restoreSessions(sessions: Session[], removed: Session[], removedAt: number): Session[] {
  const ids = new Set(sessions.map((session) => session.id));
  let busy = activeSession(sessions) !== null || sessions.some((session) => session.start >= removedAt);
  const back = removed
    .filter((session) => !ids.has(session.id))
    .map((session) => {
      if (session.end !== null) return session;
      if (busy) return { ...session, end: Math.max(removedAt, session.start) };
      busy = true;
      return session;
    });
  return [...sessions, ...back].sort((a, b) => b.start - a.start);
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
