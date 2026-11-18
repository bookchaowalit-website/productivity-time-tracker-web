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
    expect([...host.querySelectorAll(".as-lists .as-count")].map((c) => c.textContent)).toEqual(["1", "0"]);
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
    press($('[aria-label="Clear 2 sessions from All sessions"]')!);
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
    press($('[aria-label="Clear 1 session from Today"]')!, 0);
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

  it("a second removal inside the Undo window joins the first; Undo restores both", () => {
    mount([earlier, yesterday]);
    press($('[aria-label^="Remove Email"]')!);
    act(() => { vi.advanceTimersByTime(3000); });
    press($('[aria-label="Clear 1 session from All sessions"]')!);
    expect(stored()).toEqual([]);
    expect($(".as-toast")!.textContent).toContain("Removed 2 sessions");
    act(() => { vi.advanceTimersByTime(4000); });
    expect($(".as-toast")).not.toBeNull();
    press(button("Undo"));
    expect(stored()!.map((s) => s.id)).toEqual(["e", "y"]);
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
