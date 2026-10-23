import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("home page", () => {
  it("renders the ready clock, the empty register and the local-only notice", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("Clock in.");
    expect(html).toContain("READY TO CLOCK IN");
    expect(html).toContain("00:00:00");
    expect(html).toContain("No sessions yet. Start the first card above.");
    expect(html).toContain("The register stays on this device.");
    expect(html).toContain("BROWSER STATE · DEMO-GRADE");
  });
});
