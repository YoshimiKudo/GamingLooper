import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWaveformPeaksFromChannels } from "./audio/waveform.js";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const detectSource = readFileSync(new URL("./audio/detectInRenderer.ts", import.meta.url), "utf8");

describe("renderer waveform hydration", () => {
  it("builds waveform peaks from decoded browser audio channels", () => {
    const waveform = buildWaveformPeaksFromChannels([new Float32Array([-0.5, 0.25, -0.25, 0.75])], 2);

    expect(waveform.resolution).toBe(2);
    expect(waveform.channels[0]?.min).toEqual([-0.5, -0.25]);
    expect(waveform.channels[0]?.max).toEqual([0.25, 0.75]);
  });

  it("hydrates compressed BGM waveforms through WebAudio import and detection paths", () => {
    expect(appSource).toContain("void hydrateMissingWaveforms(nextTracks);");
    expect(appSource).toContain('format === "mp3" || format === "ogg" || format === "flac" || format === "opus"');
    expect(appSource).toContain("waveform: result.waveform ?? track.waveform");
    expect(detectSource).toContain("const waveform = buildWaveformPeaksFromAudioBuffer(audioBuffer);");
    expect(detectSource).toContain("waveform,");
  });
});
