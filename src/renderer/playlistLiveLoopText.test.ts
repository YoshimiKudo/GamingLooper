import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("playlist live loop text", () => {
  it("uses playlist elapsed time for the current loop count", () => {
    expect(appSource).toContain("getLiveRuleText(track, item, playback, elapsedMs, project.ui.language)");
    expect(appSource).toContain("function getLiveRuleText(track: BgmTrack, item: PlaylistItem, playback: PlaybackState, elapsedMs: number");
    expect(appSource).toContain("Math.floor(Math.max(0, elapsedMs - introMs) / loopMs) + 1");
    expect(appSource).not.toContain("Math.floor(Math.max(0, positionMs - introMs) / loopMs) + 1");
  });
});
