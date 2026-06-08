import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function ruleBody(selector: string): string {
  const start = styleSource.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = styleSource.indexOf("{", start) + 1;
  const bodyEnd = styleSource.indexOf("}", bodyStart);
  return styleSource.slice(bodyStart, bodyEnd);
}

describe("sequence now dot layout", () => {
  it("does not shrink the main view sequence status dot", () => {
    const body = ruleBody(".now-dot");
    expect(body).toContain("flex: 0 0 8px");
    expect(body).toContain("width: 8px");
    expect(body).toContain("min-width: 8px");
    expect(body).toContain("height: 8px");
    expect(body).toContain("min-height: 8px");
  });
});
