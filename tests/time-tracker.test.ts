import { describe, expect, it, vi } from "vitest";
import {
  activeSession,
  currentTimeZone,
  formatDate,
  formatDuration,
  parseSessions,
  listSessions,
  removeSession,
  removeSessions,
  restoreSessions,
  startOfDay,
  sessionDuration,
  startSession,
  stopSession,
  totalDuration,
  type Session,
} from "@/lib/time-tracker";

const done: Session = { id: "a", label: "Write", start: 1_000, end: 61_000 };
const running: Session = { id: "b", label: "Code", start: 100_000, end: null };

describe("formatting", () => {
  it("formats hours, minutes and seconds with padding", () => {
    expect(formatDuration(0)).toBe("00:00:00");
    expect(formatDuration(3_723_999)).toBe("01:02:03");
    expect(formatDuration(100 * 3600 * 1000)).toBe("100:00:00");
  });

  it("never shows a negative duration", () => {
    expect(formatDuration(-5_000)).toBe("00:00:00");
  });

  it("formats a timestamp in the given time zone", () => {
    expect(formatDate(Date.UTC(2026, 9, 23, 5, 7), "UTC")).toBe("Oct 23, 05:07 AM");
  });
});

describe("durations", () => {
  it("counts a running session up to now and a stopped one to its end", () => {
    expect(sessionDuration(running, 130_000)).toBe(30_000);
    expect(sessionDuration(done, 999_999)).toBe(60_000);
    expect(totalDuration([running, done], 130_000)).toBe(90_000);
  });

  it("treats a clock one tick behind the start as zero, not negative", () => {
    expect(sessionDuration(running, 99_500)).toBe(0);
  });
});

describe("session edits", () => {
  it("starts a labelled session on top, defaulting a blank label", () => {
    expect(startSession([done], "  Read ", "n", 5)[0]).toEqual({ id: "n", label: "Read", start: 5, end: null });
    expect(startSession([], "   ", "n", 5)[0].label).toBe("Untitled");
  });

  it("refuses a second running session", () => {
    const list = [running, done];
    expect(startSession(list, "More", "n", 5)).toBe(list);
  });

  it("stops the running session and leaves the rest", () => {
    const stopped = stopSession([running, done], 160_000);
    expect(stopped[0]).toEqual({ ...running, end: 160_000 });
    expect(stopped[1]).toBe(done);
    expect(activeSession(stopped)).toBeNull();
    expect(stopSession([done], 5)).toEqual([done]);
  });

  it("removes by id", () => {
    expect(removeSession([running, done], "b")).toEqual([done]);
  });
});

describe("parseSessions", () => {
  it("returns null for nothing saved, bad JSON or a non-array", () => {
    expect(parseSessions(null)).toBeNull();
    expect(parseSessions("{")).toBeNull();
    expect(parseSessions('{"id":"a"}')).toBeNull();
  });

  it("drops entries of the wrong shape, an end before the start, and extra running sessions", () => {
    const raw = JSON.stringify([
      running,
      { ...running, id: "c" },
      done,
      { id: "d", label: "Back", start: 50, end: 10 },
      { id: "e", label: "Bad", start: "x", end: null },
    ]);
    expect(parseSessions(raw)).toEqual([running, done]);
  });
});

describe("restore and lists", () => {
  it("restores removed sessions newest first and skips ones already present", () => {
    expect(restoreSessions([done], [running, done], 200_000)).toEqual([{ ...running, removedAt: 200_000 }, done]);
  });

  it("ends a restored running session at its removal time when another one is running", () => {
    const fresh: Session = { id: "c", label: "New", start: 300_000, end: null };
    const back = restoreSessions([fresh], [running], 250_000);
    expect(back).toEqual([fresh, { ...running, end: 250_000 }]);
  });

  it("ends it at its removal time when a session started and stopped in between (no overlap)", () => {
    const between: Session = { id: "c", label: "Between", start: 260_000, end: 280_000 };
    const back = restoreSessions([between], [running], 250_000);
    expect(back).toEqual([between, { ...running, end: 250_000 }]);
    expect(activeSession(back)).toBeNull();
  });

  it("keeps it running when nothing was started after the removal", () => {
    expect(restoreSessions([done], [running], 250_000)).toEqual([{ ...running, removedAt: 250_000 }, done]);
  });

  it("Today keeps sessions since local midnight and the running one; no clock means none", () => {
    const now = new Date(2026, 10, 18, 9, 0).getTime();
    const today: Session = { id: "t", label: "T", start: startOfDay(now) + 1, end: startOfDay(now) + 2 };
    const old: Session = { id: "o", label: "O", start: startOfDay(now) - 10, end: startOfDay(now) - 5 };
    const oldRunning: Session = { id: "r", label: "R", start: startOfDay(now) - 10, end: null };
    expect(listSessions([today, old, oldRunning], "today", now)).toEqual([today, oldRunning]);
    expect(listSessions([today, old], "all", now)).toEqual([today, old]);
    expect(listSessions([today], "today", 0)).toEqual([]);
  });
});

describe("removeSessions", () => {
  it("drops every given session in one pass and keeps the order of the rest", () => {
    const many: Session[] = Array.from({ length: 5000 }, (_, i) => ({ id: `s${i}`, label: "x", start: i, end: i }));
    const kept = removeSessions(many, many.slice(0, 4999));
    expect(kept).toEqual([many[4999]]);
    expect(removeSessions([running, done], [done])).toEqual([running]);
  });
});

// Two tabs share one store. Tab 1 removes running A at t1; tab 2 then starts B at t2, stops it at t3 and
// removes it at t4. Each tab then presses Undo; the result must not depend on which goes first.
describe("cross-tab undo", () => {
  const A: Session = { id: "a", label: "A", start: 0, end: null };
  const B: Session = { id: "b", label: "B", start: 2_000, end: 3_000 };
  const t1 = 1_000;
  const t4 = 4_000;
  const overlaps = (list: Session[]) => {
    const sorted = [...list].sort((x, y) => x.start - y.start);
    return sorted.some((entry, i) => i > 0 && (sorted[i - 1].end ?? Infinity) > entry.start);
  };

  it("gives the same history in either order: A ends at its removal time, B is intact", () => {
    const afterTab1 = restoreSessions([], [A], t1);
    expect(afterTab1).toEqual([{ ...A, removedAt: t1 }]);
    const tab1First = restoreSessions(afterTab1, [B], t4);
    const tab2First = restoreSessions(restoreSessions([], [B], t4), [A], t1);
    expect(tab1First).toEqual(tab2First);
    expect(tab1First).toEqual([B, { ...A, end: t1 }]);
    expect(totalDuration(tab1First, 10_000)).toBe(totalDuration(tab2First, 10_000));
    expect(overlaps(tab1First)).toBe(false);
    expect(activeSession(tab1First)).toBeNull();
  });
});

describe("restore only adjusts the restored sessions", () => {
  it("leaves an unrelated pre-existing overlap unchanged", () => {
    const x: Session = { id: "x", label: "x", start: 100, end: 500 };
    const y: Session = { id: "y", label: "y", start: 300, end: 700 }; // overlaps x, e.g. after a clock change
    const z: Session = { id: "z", label: "z", start: 900, end: 1_000 };
    const back = restoreSessions([y, x], [z], 2_000);
    expect(back).toEqual([z, y, x]);
  });

  it("ends a restored running session at its removal time while another runs; the running one is untouched", () => {
    const live: Session = { id: "l", label: "l", start: 5_000, end: null };
    const back = restoreSessions([live], [{ id: "r", label: "r", start: 1_000, end: null }], 3_000);
    expect(back).toEqual([live, { id: "r", label: "r", start: 1_000, end: 3_000 }]);
  });

  it("clips a restored session to the next existing start, trims a covered start, drops a fully covered one", () => {
    const existing: Session = { id: "e", label: "e", start: 1_000, end: 2_000 };
    expect(restoreSessions([existing], [{ id: "a", label: "a", start: 500, end: 1_500 }], 9_000)).toEqual([existing, { id: "a", label: "a", start: 500, end: 1_000 }]);
    expect(restoreSessions([existing], [{ id: "b", label: "b", start: 1_500, end: 2_500 }], 9_000)).toEqual([{ id: "b", label: "b", start: 2_000, end: 2_500 }, existing]);
    expect(restoreSessions([existing], [{ id: "c", label: "c", start: 1_200, end: 1_800 }], 9_000)).toEqual([existing]);
  });

  it("stopping a session brought back by Undo clears its removal mark", () => {
    expect(stopSession([{ ...running, removedAt: 120_000 }], 160_000)).toEqual([{ ...running, end: 160_000 }]);
  });
});

describe("formatDate formatter cache", () => {
  it("builds one Intl.DateTimeFormat per time zone, not one per call", () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat");
    for (let i = 0; i < 50; i++) formatDate(Date.UTC(2026, 0, 1, 0, i), "Asia/Tokyo");
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockClear();
    formatDate(Date.UTC(2026, 0, 1, 0, 5), "Europe/London");
    expect(spy.mock.calls.length).toBe(1); // a different zone gets its own formatter
    expect(formatDate(Date.UTC(2026, 0, 1, 0, 5), "Asia/Tokyo")).toBe("Jan 1, 09:05 AM");
    spy.mockRestore();
  });
});

describe("currentTimeZone", () => {
  it("is the resolved zone and the default for formatDate", () => {
    const zone = currentTimeZone();
    expect(zone).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(formatDate(Date.UTC(2026, 0, 1), zone)).toBe(formatDate(Date.UTC(2026, 0, 1)));
  });
});
