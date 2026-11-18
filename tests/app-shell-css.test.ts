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
