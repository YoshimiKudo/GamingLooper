import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const waveformSource = readFileSync(new URL("./components/WaveformView.tsx", import.meta.url), "utf8");

describe("scan animation", () => {
  it("does not animate the small green scan label dot", () => {
    const dotRule = styleSource.match(/\.scan-label-dot\s*\{[^}]*\}/)?.[0] ?? "";
    expect(dotRule).toContain("fill: rgba(94, 225, 185, 0.92);");
    expect(dotRule).not.toContain("animation:");
  });

  it("keeps the scanning label tall enough to avoid a squashed look", () => {
    const labelRule = styleSource.match(/\.scan-label\s*\{[^}]*\}/)?.[0] ?? "";
    expect(labelRule).toContain("font-size: 16px;");
    expect(labelRule).toContain("transform: scaleY(1.16);");
    expect(labelRule).toContain("transform-box: fill-box;");
    expect(waveformSource).toContain('y="84"');
    expect(waveformSource).toContain('height="50"');
    expect(waveformSource).toContain('rx="25"');
  });
});
