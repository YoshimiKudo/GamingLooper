import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const audioSource = readFileSync(new URL("./audio/AudioEngine.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("BGM fade stop handling", () => {
  it("keeps loop playback crossfades short so loop checks stay close to marker timing", () => {
    expect(audioSource).toContain("const LOOP_CROSSFADE_SEC = 0.008;");
    expect(audioSource).toContain("fadeInSec: loopState.crossfadeSec / this.debugPlaybackRate");
    expect(audioSource).toContain("fadeOutSec: loopState.crossfadeSec / this.debugPlaybackRate");
  });

  it("keeps fading BGM sources tracked so the transport stop can interrupt the fade", () => {
    const stopBgmBody = audioSource.slice(audioSource.indexOf("  stopBgm("), audioSource.indexOf("  async playSe("));
    const fadeOutBgmBody = audioSource.slice(audioSource.indexOf("  fadeOutBgm("), audioSource.indexOf("  async playSe("));
    const fadeSourceBody = audioSource.slice(audioSource.indexOf("  private fadeBgmSourceToStop("), audioSource.indexOf("  private getBgmSourceGainAt("));
    const sourceEndBody = audioSource.slice(audioSource.indexOf("    source.onended = () => {"), audioSource.indexOf("    source.start(startAtSec"));

    expect(stopBgmBody).toContain("this.fadeOutBgm(fadeMs);");
    expect(fadeOutBgmBody).toContain("const sources = [...this.bgmSources];");
    expect(fadeOutBgmBody).not.toContain("this.bgmSources = [];");
    expect(fadeSourceBody).toContain("item.stopping = true;");
    expect(fadeSourceBody).toContain("const currentGain = this.getBgmSourceGainAt(item, now);");
    expect(fadeSourceBody).toContain("item.gain.gain.cancelScheduledValues(now);");
    expect(sourceEndBody).toContain("this.bgmSources = this.bgmSources.filter((entry) => entry !== item);");
  });

  it("uses BGM fade-out instead of transport stop for scheduled playlist fades", () => {
    const scheduleBody = appSource.slice(appSource.indexOf("  function schedulePlaylistTimers("), appSource.indexOf("  async function seekSelectedBgm("));

    expect(scheduleBody).toContain("audioRef.current.fadeOutBgm(Math.max(1, (plannedMs - safeElapsedMs) / safeRate));");
    expect(scheduleBody).toContain("audioRef.current.fadeOutBgm(Math.max(1, fadeMs / safeRate));");
    expect(scheduleBody).not.toContain("audioRef.current.stopBgm(Math.max(1, fadeMs / safeRate));");
  });
});
