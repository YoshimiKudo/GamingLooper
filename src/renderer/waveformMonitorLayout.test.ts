import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const waveformSource = readFileSync(new URL("./components/WaveformView.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("BGM monitor editor layout", () => {
  it("places loop unit switching and transport actions in the loop editor row", () => {
    expect(appSource).toContain("showLoopUnitToggle");
    expect(appSource).toContain("footerActions={");
    expect(appSource).toContain("monitor-transport-button");
    expect(waveformSource).toContain('type LoopInputUnit = "time" | "sample"');
    expect(waveformSource).toContain("const [loopInputUnit, setLoopInputUnit] = useState<LoopInputUnit>(\"time\")");
    expect(waveformSource).toContain("function updateLoopSamples(");
    expect(waveformSource).toContain("className=\"loop-unit-toggle\"");
    expect(waveformSource).toContain("className=\"loop-editor-actions\"");
    expect(styleSource).toContain(".list-builder-waveform .loop-editor-row");
    expect(styleSource).toContain(".loop-unit-toggle");
    expect(styleSource).toContain(".loop-editor-actions");
  });
});
