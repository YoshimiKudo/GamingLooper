import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const waveformSource = readFileSync(new URL("./components/WaveformView.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("BGM Monitor waveform seek", () => {
  it("turns a double click on the waveform into an onSeek callback", () => {
    expect(waveformSource).toContain("onSeek?: (ms: number) => void;");
    expect(waveformSource).toContain("function handleWaveformDoubleClick");
    expect(waveformSource).toContain("clientXToMs(event.clientX, svgRef.current, activeTrack.durationMs)");
    expect(waveformSource).toContain("onDoubleClick={handleWaveformDoubleClick}");
    expect(styleSource).toContain(".waveform-canvas.seek-enabled");
    expect(styleSource).toContain("cursor: var(--play-seek-cursor);");
    expect(waveformSource).not.toContain("data-seek-tooltip");
    expect(waveformSource).not.toContain("seekFromPointer");
    expect(styleSource).not.toContain(".waveform-canvas.seek-enabled::after");
  });

  it("wires waveform seek through both BGM Monitor views", () => {
    expect(appSource).toContain("async function seekSelectedBgm(offsetMs: number): Promise<void>");
    expect(appSource).toContain("onBgmSeek={(ms) => void seekSelectedBgm(ms)}");
    expect(appSource).toContain("onSeek={onBgmSeek}");
    expect(appSource).toContain("schedulePlaylistTimers(playlistContext, index, track, plannedMs, debugRate, elapsedMs)");
  });
});
