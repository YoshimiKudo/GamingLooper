import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const analyzerSource = readFileSync(new URL("./components/AnalyzerPanel.tsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main/main.ts", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../preload/index.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("Analyzer timing", () => {
  it("drives spectrum drawing from renderer requestAnimationFrame instead of a 60Hz IPC timer", () => {
    expect(analyzerSource).toContain("frameId = window.requestAnimationFrame(tick);");
    expect(analyzerSource).toContain("window.cancelAnimationFrame(frameId);");
    expect(analyzerSource).not.toContain("window.gamingLooper.onAnalyzerFrame");
    expect(preloadSource).not.toContain("onAnalyzerFrame");
    expect(appSource).not.toContain("onAnalyzerFrame");
    expect(mainSource).not.toContain("startAnalyzerFrameTicker(window)");
    expect(mainSource).not.toContain('webContents.send("app:analyzer-frame"');
  });

  it("reports frame gaps so smoothness regressions are visible even when average FPS is unchanged", () => {
    expect(analyzerSource).toContain("spectrumFrameGapMaxMs");
    expect(analyzerSource).toContain("tickFrameGapMaxMs");
    expect(analyzerSource).toContain("measuredTickFrameGapMaxMs");
  });
});
