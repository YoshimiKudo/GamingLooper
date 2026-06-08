import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("waveform playhead gamingness styling", () => {
  it("exports playhead glow variables from Gaming-ness visual values", () => {
    expect(appSource).toContain("const playheadGlowAlpha =");
    expect(appSource).toContain("0.08 + Math.min(1.45, normalized) * 0.18 + gamingnessGlare * 0.08");
    expect(appSource).toContain("const playheadGlowSpread =");
    expect(appSource).toContain("\"--playhead-glow-alpha\"");
    expect(appSource).toContain("\"--playhead-glow-spread\"");
  });

  it("cycles the playhead through gaming colors slowly", () => {
    expect(styleSource).toContain("animation: playhead-gaming-color-cycle 352s linear infinite;");
    expect(styleSource).toContain("@keyframes playhead-gaming-color-cycle");
    expect(styleSource).toContain("#ff5b5b");
    expect(styleSource).toContain("#ffb058");
    expect(styleSource).toContain("#ffea5c");
    expect(styleSource).toContain("#8fff64");
    expect(styleSource).toContain("#62fff3");
    expect(styleSource).toContain("#73bdff");
    expect(styleSource).toContain("#eb6dff");
  });

  it("uses only Gaming-ness glow on the playhead without a dark outline", () => {
    expect(styleSource).toContain("var(--playhead-glow-alpha");
    expect(styleSource).toContain("var(--playhead-glow-spread");
    expect(styleSource).not.toContain("drop-shadow(0 0 2px rgba(0, 0, 0, 0.85))");
  });
});
