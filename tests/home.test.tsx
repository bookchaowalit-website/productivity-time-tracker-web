import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("home page (server render)", () => {
  it("renders the shell, a ready timer with a labelled field, the empty state and the hub footer", () => {
    const html = renderToString(<Home />);
    expect(html).toContain("Time tracker");
    expect(html).toContain("What are you working on?");
    expect(html).toContain("00:00:00");
    expect(html).toContain(">Ready<");
    expect(html).toContain(">Start<");
    expect(html).toContain("No sessions yet");
    expect(html).toContain("Saved in this browser only");
    expect(html).toContain('placeholder="e.g. Deep work" value=""');
    // No clock on the server: the list counts are hidden until it runs.
    expect(html).toContain('data-pending="true"');
    expect(html).toContain('href="https://bookchaowalit.com/"');
  });
});

describe("robots and sitemap", () => {
  it("point at the app's own domain", () => {
    expect(robots().sitemap).toBe("https://time-tracker.bookchaowalit.com/sitemap.xml");
    expect(sitemap()[0].url).toBe("https://time-tracker.bookchaowalit.com");
  });
});
