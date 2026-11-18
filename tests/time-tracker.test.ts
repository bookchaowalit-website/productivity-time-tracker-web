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
  oneRunning,
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
  it("restores removed sessions newest first, skips ones already present, marks a running one", () => {
    expect(restoreSessions([done], [running, done], 200_000, 210_000)).toEqual([{ ...running, removedAt: 200_000 }, done]);
  });

  it("ends a restored running session at its removal time when a newer one is running", () => {
    const fresh: Session = { id: "c", label: "New", start: 300_000, end: null };
    expect(restoreSessions([fresh], [running], 250_000, 400_000)).toEqual([fresh, { ...running, end: 250_000 }]);
  });

  it("ends it at its removal time when a session started and stopped in between (no double count)", () => {
    const between: Session = { id: "c", label: "Between", start: 260_000, end: 280_000 };
    const back = restoreSessions([between], [running], 250_000, 400_000);
    expect(back).toEqual([between, { ...running, end: 250_000 }]);
    expect(activeSession(back)).toBeNull();
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

// Two tabs share one store. Tab 1 removes running A at t1; tab 2 then starts B at t2 and removes it
// while it runs at t3. Each tab then presses Undo; the result must not depend on which goes first.
describe("cross-tab undo", () => {
  const A: Session = { id: "a", label: "A", start: 0, end: null };
  const B: Session = { id: "b", label: "B", start: 2_000, end: null };
  const t1 = 1_000;
  const t3 = 3_000;
  const now = 5_000;

  it("either order ends with B running and A ended at its removal time", () => {
    const tab1First = restoreSessions(restoreSessions([], [A], t1, now), [B], t3, now);
    const tab2First = restoreSessions(restoreSessions([], [B], t3, now), [A], t1, now);
    expect(tab1First).toEqual(tab2First);
    expect(tab1First).toEqual([{ ...B, removedAt: t3 }, { ...A, end: t1 }]);
    expect(tab1First.filter((session) => session.end === null)).toHaveLength(1);
  });

  it("a stopped B in between still ends a restored A at its removal time", () => {
    const stoppedB: Session = { ...B, end: 2_500 };
    expect(restoreSessions(restoreSessions([], [A], t1, now), [stoppedB], t3, now)).toEqual([stoppedB, { ...A, end: t1 }]);
    expect(restoreSessions([stoppedB], [A], t1, now)).toEqual([stoppedB, { ...A, end: t1 }]);
  });
});

describe("restore keeps history exactly", () => {
  it("Clear list then Undo gives back the same history, pre-existing overlap included", () => {
    const x: Session = { id: "x", label: "x", start: 100, end: 500 };
    const y: Session = { id: "y", label: "y", start: 300, end: 700 }; // overlaps x, e.g. after a clock change
    const z: Session = { id: "z", label: "z", start: 900, end: 1_000 };
    const history = [z, y, x];
    const cleared = removeSessions(history, history);
    expect(JSON.stringify(restoreSessions(cleared, history, 2_000, 2_000))).toBe(JSON.stringify(history));
    expect(restoreSessions([y, x], [z], 2_000, 2_000)).toEqual([z, y, x]);
  });

  it("never ends a running session earlier than its start, and caps at now", () => {
    const late: Session = { id: "l", label: "l", start: 900, end: null };
    const newer: Session = { id: "n", label: "n", start: 950, end: null };
    expect(oneRunning([newer, late], 920)).toEqual([newer, { ...late, end: 920 }]);
    expect(oneRunning([newer, { ...late, removedAt: 100 }], 2_000)).toEqual([newer, { ...late, end: 900 }]);
  });

  it("restores 20,000 sessions in well under 50 ms", () => {
    const many: Session[] = Array.from({ length: 20_000 }, (_, i) => ({ id: `s${i}`, label: "x", start: 40_000 - i * 2, end: 40_001 - i * 2 }));
    const kept = many.filter((_, i) => i % 2 === 0);
    const gone = many.filter((_, i) => i % 2 === 1);
    restoreSessions(kept, gone, 50_000, 50_000); // warm up
    const t0 = performance.now();
    const back = restoreSessions(kept, gone, 50_000, 50_000);
    expect(performance.now() - t0).toBeLessThan(50);
    expect(back).toEqual(many);
  });

  it("a second removal stamps its own time: remove A, Undo, let it run, remove again, start B, Undo", () => {
    const A: Session = { id: "a", label: "A", start: 0, end: null };
    const firstUndo = restoreSessions([], [A], 1_000, 1_500); // removed at 1 s, back running
    expect(firstUndo).toEqual([{ ...A, removedAt: 1_000 }]);
    const again = firstUndo[0]; // removed again at 10 s, still carrying the old mark
    const B: Session = { id: "b", label: "B", start: 11_000, end: null };
    const back = restoreSessions([B], [again], 10_000, 12_000);
    expect(back).toEqual([B, { ...A, end: 10_000 }]);
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
