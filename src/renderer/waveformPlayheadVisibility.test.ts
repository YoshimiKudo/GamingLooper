import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const waveformSource = readFileSync(new URL("./components/WaveformView.tsx", import.meta.url), "utf8");

describe("waveform playhead visibility", () => {
  it("lets callers hide the playhead for waveforms that are not currently playing", () => {
    expect(waveformSource).toContain("showPlayhead?: boolean;");
    expect(waveformSource).toContain("showPlayhead = true");
    expect(waveformSource).toContain("waveformPlayheadEnabled && showPlayhead");
    expect(appSource).toContain("const isSelectedBgmPlaying = Boolean(selectedTrack && playback.mode !== \"stopped\" && playback.trackId === selectedTrack.id);");
    expect(appSource).toContain("showPlayhead={isSelectedBgmPlaying}");
  });
});
