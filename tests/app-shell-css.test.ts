import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/app-shell.css", import.meta.url), "utf8");

describe("app shell phone list row", () => {
  it("pads the scrolling list row so the 3px focus ring (+2px offset) is not clipped", () => {
    const rule = css.match(/\.as-lists \{ display: flex;[^}]*overflow-x: auto;[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("padding: 6px");
    expect(rule).toContain("margin: -6px");
  });
});

describe("skip link target", () => {
  it("clears the sticky top bar", () => {
    expect(css).toMatch(/#main \{ scroll-margin-top: 64px; \}/);
  });
});

describe("Undo toast space", () => {
  it("reserves the toast's height at the bottom while it shows", () => {
    expect(css).toMatch(/html\[data-toast\] \{ scroll-padding-bottom: var\(--as-toast-space/);
    expect(css).toMatch(/html\[data-toast\] body \{ padding-bottom: var\(--as-toast-space/);
  });
});

describe("review 2026-11-18", () => {
  it("phone list pills wrap instead of hiding one past the right edge", () => {
    expect(css).toMatch(/@media \(max-width: 760px\) \{ \.as-lists \{ flex-wrap: wrap; overflow-x: visible; \} \}/);
  });
  it("the dark toast is a raised surface with a visible edge", () => {
    expect(css).toMatch(/prefers-color-scheme: dark\) \{ \.as-toast \{ background: #2c2c2e; border: 1px solid #636366; \} \}/);
  });
});
