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
