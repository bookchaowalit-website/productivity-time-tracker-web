// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { STORE_KEY, type Session } from "@/lib/time-tracker";

// Mounted tests for the time tracker on the App shell. The clock is pinned to 18 Nov 2026 09:00 local.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 10, 18, 9, 0).getTime();
const HOUR = 3_600_000;
const yesterday: Session = { id: "y", label: "Write report", start: NOW - 20 * HOUR, end: NOW - 19 * HOUR };
const earlier: Session = { id: "e", label: "Email", start: NOW - HOUR, end: NOW - HOUR / 2 };

let root: Root;
let host: HTMLDivElement;
const $ = <T extends Element = HTMLElement>(selector: string) => host.querySelector(selector) as T | null;
const button = (text: string, scope: ParentNode = host) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const rows = () => [...host.querySelectorAll(".as-row h3")].map((h) => h.textContent);
const press = (el: Element, detail = 1) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail })); });
const submit = () => act(() => { $<HTMLFormElement>(".as-timer")!.requestSubmit(); });
const clock = () => $(".as-timer-clock")!.textContent;
const stored = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Session[] | null;
const labelInput = () => $<HTMLInputElement>(".as-timer input")!;
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function mount(seed: Session[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(seed));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Home />));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("timer", () => {
  it("starts a labelled session, counts up, and stops it into the history", () => {
    mount([]);
    expect(host.textContent).toContain("No sessions yet");
    expect($("label.as-field")!.textContent).toContain("What are you working on?");
    type(labelInput(), "Design review");
    press(button("Start"));
    expect(stored()![0]).toMatchObject({ label: "Design review", start: NOW, end: null });
    expect(host.textContent).toContain("Working on");
    expect($(".as-timer .as-pill")!.textContent).toBe("Running");

    act(() => { vi.advanceTimersByTime(65_000); });
    expect(clock()).toBe("00:01:05");
    expect(rows()).toEqual(["Design review"]);
    expect($(".as-row p")!.textContent).toContain("still running");

    press(button("Stop"));
    expect(stored()![0].end).toBe(NOW + 65_000);
    expect(clock()).toBe("00:00:00");
    expect($(".as-timer .as-pill")!.textContent).toBe("Ready");
    expect($(".as-head p")!.textContent).toBe("00:01:05 logged · 1 session");
    expect($(".as-row p")!.textContent).toContain("→");
  });

  it("Enter in the label field starts; keyboard focus follows Start to Stop and back", () => {
    mount([]);
    type(labelInput(), "  ");
    labelInput().focus();
    submit();
    expect(stored()![0].label).toBe("Untitled");
    expect(document.activeElement?.textContent).toBe("Stop");
    press(button("Stop"));

    const start = button("Start");
    start.focus();
    press(start, 0);
    expect(document.activeElement?.textContent).toBe("Stop");
    press(document.activeElement!, 0);
    expect(document.activeElement?.textContent).toBe("Start");
  });

  it("restores a running session after a reload", () => {
    mount([{ id: "r", label: "Long task", start: NOW - 90_000, end: null }, earlier]);
    expect(clock()).toBe("00:01:30");
    expect(host.textContent).toContain("Long task");
    expect($(".as-timer input")).toBeNull();
  });
});

describe("lists", () => {
  it("Today hides sessions from earlier days and has its own empty state", () => {
    mount([earlier, yesterday]);
    expect(rows()).toEqual(["Email", "Write report"]);
    press(button("Today", $(".as-side")!));
    expect($("h1")!.textContent).toBe("Today");
    expect(rows()).toEqual(["Email"]);
    expect($(".as-head p")!.textContent).toBe("00:30:00 logged · 1 session");
  });

  it("Today says nothing is logged when only older sessions exist", () => {
    mount([yesterday]);
    press(button("Today", $(".as-side")!));
    expect(host.textContent).toContain("Nothing logged today");
    expect([...host.querySelectorAll(".as-lists .as-count")].map((c) => c.textContent)).toEqual(["1", "0", "1"]);
  });

  it("This week starts on Monday (18 Nov 2026 is a Wednesday) and has its own empty state", () => {
    const lastWeek: Session = { id: "w", label: "Old sprint", start: NOW - 3 * 24 * HOUR, end: NOW - 3 * 24 * HOUR + HOUR };
    mount([earlier, yesterday, lastWeek]);
    press(button("This week", $(".as-side")!));
    expect($("h1")!.textContent).toBe("This week");
    expect(rows()).toEqual(["Email", "Write report"]);
    act(() => root.unmount());
    host.remove();
    mount([lastWeek]);
    press(button("This week", $(".as-side")!));
    expect(host.textContent).toContain("Nothing logged this week");
    expect($(".as-head p")!.textContent).toBe("Nothing logged this week");
  });
});

describe("review 2026-11-18", () => {
  it("the task field starts empty with an example placeholder and empties again after Start", () => {
    mount([]);
    expect(labelInput().value).toBe("");
    expect(labelInput().placeholder).toBe("e.g. Deep work");
    type(labelInput(), "Design review");
    press(button("Start"));
    press(button("Stop"));
    expect(labelInput().value).toBe("");
    expect(stored()![0].label).toBe("Design review");
  });

  it("the browser-only note sits right after the timer card", () => {
    mount([earlier]);
    expect($(".as-timer")!.nextElementSibling!.className).toContain("as-note");
    expect($(".as-timer")!.nextElementSibling!.textContent).toContain("Saved in this browser only");
  });

  it("Clear in Today keeps the running session and says so", () => {
    mount([{ id: "r", label: "Running", start: NOW - 60_000, end: null }, earlier]);
    press(button("Today", $(".as-side")!));
    const clear = button("Clear finished");
    expect(clear.getAttribute("aria-label")).toBe("Clear list: 1 session in Today, the running timer stays");
    press(clear);
    expect(stored()!.map((s) => s.id)).toEqual(["r"]);
    expect($(".as-timer .as-pill")!.textContent).toBe("Running");
    expect(button("Clear")).toBeUndefined();
  });

  it("Edit renames a session and fixes a forgotten Stop; bad times show an inline error", () => {
    mount([earlier, yesterday]);
    press($('[aria-label^="Edit Email"]')!);
    const form = $<HTMLFormElement>(".as-edit")!;
    const [name, startField, endField] = [...form.querySelectorAll("input")] as HTMLInputElement[];
    expect(document.activeElement).toBe(name);
    expect(startField.type).toBe("datetime-local");
    type(name, "Inbox zero");
    type(endField, "2026-11-18T07:00");
    act(() => { form.requestSubmit(); });
    expect($(".as-edit-error")!.textContent).toBe("End must be after start.");
    expect(endField.getAttribute("aria-invalid")).toBe("true");
    expect(stored()![0].label).toBe("Email");
    type(endField, "2026-11-18T08:15");
    act(() => { $<HTMLFormElement>(".as-edit")!.requestSubmit(); });
    expect($(".as-edit")).toBeNull();
    expect(stored()![0]).toMatchObject({ id: "e", label: "Inbox zero", start: NOW - HOUR, end: NOW - 45 * 60_000 });
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Edit Inbox zero/);
  });

  it("Edit on a running session shows no End field; Cancel and Escape close without saving", () => {
    mount([{ id: "r", label: "Running", start: NOW - 60_000, end: null }]);
    press($('[aria-label^="Edit Running"]')!);
    expect($(".as-edit")!.querySelectorAll("input")).toHaveLength(2);
    type($<HTMLInputElement>(".as-edit input")!, "Changed");
    press(button("Cancel", $(".as-edit")!));
    expect($(".as-edit")).toBeNull();
    expect(stored()![0].label).toBe("Running");
    press($('[aria-label^="Edit Running"]')!);
    act(() => { $(".as-edit input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect($(".as-edit")).toBeNull();
  });

  it("Export CSV downloads the visible list", () => {
    const create = vi.fn(() => "blob:csv");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const clicks: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); });
    mount([earlier, yesterday]);
    press(button("Export CSV"));
    expect(create).toHaveBeenCalledOnce();
    expect(clicks).toEqual(["time-tracker-all.csv"]);
    expect(revoke).toHaveBeenCalledWith("blob:csv");
    click.mockRestore();
  });

  it("list counts are hidden until the clock runs", () => {
    mount([earlier]);
    expect($(".as-lists")!.hasAttribute("data-pending")).toBe(false);
  });
});

describe("remove, clear and undo", () => {
  it("Remove names the item, and Undo puts it back", () => {
    mount([earlier, yesterday]);
    const remove = $('[aria-label^="Remove Email"]')!;
    press(remove, 0);
    expect(rows()).toEqual(["Write report"]);
    expect(document.activeElement?.textContent).toBe("Undo");
    press(button("Undo"));
    expect(rows()).toEqual(["Email", "Write report"]);
    expect(stored()!.map((s) => s.id)).toEqual(["e", "y"]);
  });

  it("Clear list empties the visible list with an Undo; the toast times out after six seconds", () => {
    mount([earlier, yesterday]);
    press($('[aria-label="Clear list: 2 sessions in All sessions"]')!);
    expect(stored()).toEqual([]);
    expect(host.textContent).toContain("No sessions yet");
    expect($(".as-toast")!.textContent).toContain("Cleared 2 sessions");
    act(() => { vi.advanceTimersByTime(6000); });
    expect($(".as-toast")).toBeNull();
    expect(stored()).toEqual([]);
  });

  it("Clear in Today keeps older sessions; Escape dismisses the toast without restoring", () => {
    mount([earlier, yesterday]);
    press(button("Today", $(".as-side")!));
    press($('[aria-label="Clear list: 1 session in Today"]')!, 0);
    act(() => { $(".as-toast")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect($(".as-toast")).toBeNull();
    expect(stored()!.map((s) => s.id)).toEqual(["y"]);
    expect(document.activeElement).toBe(labelInput());
  });

  it("undoing a removed running session after starting another ends it at the removal time", () => {
    mount([{ id: "r", label: "Old run", start: NOW - HOUR, end: null }]);
    press($('[aria-label^="Remove Old run"]')!);
    act(() => { vi.advanceTimersByTime(1000); });
    press(button("Start"));
    act(() => { vi.advanceTimersByTime(1000); });
    press(button("Undo"));
    const list = stored()!;
    expect(list.filter((s) => s.end === null)).toHaveLength(1);
    expect(list.find((s) => s.id === "r")!.end).toBe(NOW);
  });

  it("does not bring it back running when the session in between was already stopped", () => {
    mount([{ id: "r", label: "Old run", start: NOW - HOUR, end: null }]);
    press($('[aria-label^="Remove Old run"]')!);
    act(() => { vi.advanceTimersByTime(1000); });
    press(button("Start"));
    act(() => { vi.advanceTimersByTime(1000); });
    press(button("Stop"));
    press(button("Undo"));
    const list = stored()!;
    expect(list.filter((s) => s.end === null)).toHaveLength(0);
    expect(list.find((s) => s.id === "r")!.end).toBe(NOW);
    expect(clock()).toBe("00:00:00");
  });

  it("remove running A, start/stop/remove B, Undo: A ends at its removal time, no double-counted time", () => {
    mount([{ id: "a", label: "Task A", start: NOW - HOUR, end: null }]);
    press($('[aria-label^="Remove Task A"]')!);
    act(() => { vi.advanceTimersByTime(1000); });
    type(labelInput(), "Task B");
    press(button("Start"));
    act(() => { vi.advanceTimersByTime(2000); });
    press(button("Stop"));
    press($('[aria-label^="Remove Task B"]')!);
    press(button("Undo"));
    const list = stored()!;
    expect(list.map((s) => s.label)).toEqual(["Task B", "Task A"]);
    expect(list.filter((s) => s.end === null)).toHaveLength(0);
    expect(list.find((s) => s.label === "Task A")!.end).toBe(NOW);
    expect(list.find((s) => s.label === "Task B")).toMatchObject({ start: NOW + 1000, end: NOW + 3000 });
  });

  it("a second removal inside the Undo window joins the first; Undo restores both", () => {
    mount([earlier, yesterday]);
    press($('[aria-label^="Remove Email"]')!);
    act(() => { vi.advanceTimersByTime(3000); });
    press($('[aria-label="Clear list: 1 session in All sessions"]')!);
    expect(stored()).toEqual([]);
    expect($(".as-toast")!.textContent).toContain("Removed 2 sessions");
    act(() => { vi.advanceTimersByTime(4000); });
    expect($(".as-toast")).not.toBeNull();
    press(button("Undo"));
    expect(stored()!.map((s) => s.id)).toEqual(["e", "y"]);
  });

  it("reserves the toast's height at the page bottom while it shows, then gives it back", () => {
    mount([earlier, yesterday]);
    const html = document.documentElement;
    expect(html.hasAttribute("data-toast")).toBe(false);
    press($('[aria-label^="Remove Email"]')!, 0);
    expect(html.hasAttribute("data-toast")).toBe(true);
    // happy-dom has no layout, so the measured height falls back to the 52px toast: 52 + 24 + 16.
    expect(html.style.getPropertyValue("--as-toast-space")).toBe("92px");
    act(() => { $(".as-toast")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(html.hasAttribute("data-toast")).toBe(false);
    expect(html.style.getPropertyValue("--as-toast-space")).toBe("");
  });

  it("Undo of the running session keeps it running when a stopped one shares its start time", () => {
    mount([{ id: "l", label: "Latest", start: NOW, end: null }, { id: "o", label: "Older", start: NOW, end: NOW }]);
    press($('[aria-label^="Remove Latest"]')!, 0);
    press(button("Undo"));
    expect(stored()!.map((s) => [s.id, s.end])).toEqual([["l", null], ["o", NOW]]);
  });

  it("each start saves a growing seq, so same-ms starts keep their real order through Undo", () => {
    mount([]);
    type(labelInput(), "A");
    press(button("Start"));
    press($('[aria-label^="Remove A"]')!, 0); // removed while running, the clock has not moved
    type(labelInput(), "B");
    press(button("Start"));
    press(button("Stop"));
    const b = stored()![0];
    expect(b.start).toBe(NOW);
    press(button("Undo"));
    const after = stored()!;
    expect(after.map((s) => s.label)).toEqual(["B", "A"]);
    expect(after[1].seq).toBeLessThan(after[0].seq!);
    expect(after.every((s) => s.end !== null)).toBe(true);
  });

  it("Start still works when the browser blocks localStorage entirely", () => {
    mount([]);
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => { throw new DOMException("denied", "SecurityError"); } });
    try {
      type(labelInput(), "Offline");
      press(button("Start"));
      expect(host.textContent).toContain("Working on");
      expect($('[role="status"]')!.textContent).toBe("Started “Offline”.");
    } finally {
      Object.defineProperty(window, "localStorage", descriptor);
    }
    press(button("Stop")); // storage is back: saving resyncs the shared store for the next test
    expect(stored()![0]).toMatchObject({ label: "Offline" });
  });

  it("Undo brings a running session back stopped when another tab started (and removed) a newer one", () => {
    mount([]);
    type(labelInput(), "A");
    press(button("Start"));
    vi.setSystemTime(NOW + 60_000);
    press($('[aria-label^="Remove A"]')!, 0);
    // Another tab starts B (taking the next start number), then removes it; no storage event arrives here.
    const seq = Number(localStorage.getItem("time-tracker-seq"));
    localStorage.setItem("time-tracker-seq", String(seq + 1));
    vi.setSystemTime(NOW + 10 * 60_000);
    press(button("Undo"));
    expect(stored()).toEqual([expect.objectContaining({ label: "A", start: NOW, end: NOW + 60_000 })]);
    expect(host.textContent).not.toContain("Working on");
  });

  it("does not announce a start that another tab already beat", () => {
    mount([]);
    type(labelInput(), "Mine");
    const start = button("Start");
    // Another tab starts a session; no storage event has reached this tab, so Start still shows.
    localStorage.setItem(STORE_KEY, JSON.stringify([{ id: "x", label: "Other tab", start: NOW - 60_000, end: null }]));
    press(start);
    expect($('[role="status"]')!.textContent).toBe("Not started: “Other tab” is already running.");
    expect(stored()!.map((s) => s.id)).toEqual(["x"]);
  });

  it("Undo puts back the session as it is in the store, not as this tab last rendered it", () => {
    mount([{ id: "a", label: "Task A", start: NOW - HOUR, end: null }]);
    // Another tab stops A; no storage event reaches this tab, so it still renders A as running.
    localStorage.setItem(STORE_KEY, JSON.stringify([{ id: "a", label: "Task A", start: NOW - HOUR, end: NOW - 60_000 }]));
    press($('[aria-label^="Remove Task A"]')!);
    press(button("Undo"));
    expect(stored()).toEqual([{ id: "a", label: "Task A", start: NOW - HOUR, end: NOW - 60_000 }]);
  });

  it("the Clear list label starts with its visible text", () => {
    mount([earlier, yesterday]);
    const clear = button("Clear list");
    expect(clear.getAttribute("aria-label")).toBe("Clear list: 2 sessions in All sessions");
  });

  it("finished rows keep their date text across clock ticks while the running row counts up", () => {
    mount([{ id: "r", label: "Live", start: NOW - 1000, end: null }, earlier]);
    const finished = host.querySelectorAll(".as-row")[1];
    act(() => { vi.advanceTimersByTime(2000); });
    expect(host.querySelectorAll(".as-row")[1]).toBe(finished);
    expect(host.querySelector(".as-row .as-pill")!.textContent).toContain("00:00:03");
  });

  it("Clear list then Undo leaves the saved history byte-identical, pre-existing overlap included", () => {
    const x: Session = { id: "x", label: "X", start: NOW - 3 * HOUR, end: NOW - HOUR };
    const y: Session = { id: "y", label: "Y", start: NOW - 2 * HOUR, end: NOW - HOUR / 2 }; // overlaps X
    mount([y, x, yesterday]);
    const before = localStorage.getItem(STORE_KEY);
    press(button("Clear list"));
    expect(stored()).toEqual([]);
    press(button("Undo"));
    expect(localStorage.getItem(STORE_KEY)).toBe(before);
  });

  it("closing the toast while a session runs moves focus to Stop", () => {
    mount([{ id: "r", label: "Running now", start: NOW - HOUR, end: null }, earlier]);
    press($('[aria-label^="Remove Email"]')!, 0);
    act(() => { $(".as-toast")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.activeElement?.textContent).toBe("Stop");
    press($('[aria-label^="Remove Running now"]')!, 0);
    press(button("Undo"), 0);
    expect(rows()).toEqual(["Running now"]);
    expect(document.activeElement?.textContent).toBe("Stop");
  });
});
