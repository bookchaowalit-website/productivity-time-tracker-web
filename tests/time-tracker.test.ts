import { describe, expect, it } from "vitest";
import {
  activeSession,
  formatDate,
  formatDuration,
  parseSessions,
  removeSession,
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
