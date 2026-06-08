import { describe, expect, it } from "vitest";
import {
  createEmptyProject,
  deepDetectionSettings,
  defaultDetectionSettings,
  defaultPlaylistDurationMs,
  defaultPlaylistFadeOutMs,
  defaultPlaylistLoopCount,
  makePlaylistItem,
  normalDetectionSettings,
  vgostDetectionSettings
} from "./project.js";

describe("project defaults", () => {
  it("uses VGOST as the default Auto Loop preset", () => {
    expect(defaultDetectionSettings).toEqual(vgostDetectionSettings);
    expect(createEmptyProject().detection).toEqual({
      mode: "normal",
      matchWindowMs: 5000,
      matchThreshold: 88,
      minimumLoopMs: 10000,
      loopCheckPrerollMs: 1000,
      autoDetectOnImport: true
    });
  });

  it("keeps Normal and Deep presets on the original timing values", () => {
    expect(normalDetectionSettings).toEqual({
      mode: "normal",
      matchWindowMs: 1500,
      matchThreshold: 88,
      minimumLoopMs: 3000,
      loopCheckPrerollMs: 1000,
      autoDetectOnImport: true
    });
    expect(deepDetectionSettings).toEqual({ ...normalDetectionSettings, mode: "deep" });
  });

  it("uses 2 loops and 180 seconds as the default sequence rule values", () => {
    expect(makePlaylistItem("track-1", 0).rule).toEqual({
      mode: "loop-count",
      loopCount: defaultPlaylistLoopCount,
      fadeOutMs: defaultPlaylistFadeOutMs,
      durationMs: defaultPlaylistDurationMs
    });
    expect(defaultPlaylistLoopCount).toBe(2);
    expect(defaultPlaylistDurationMs).toBe(180000);
  });

  it("keeps Big Font Mode off by default", () => {
    expect(createEmptyProject().ui.bigFontMode).toBe(false);
  });

  it("keeps the output limiter on by default", () => {
    expect(createEmptyProject().mix.outputLimiterEnabled).toBe(true);
  });

  it("starts sequence star rating empty by default", () => {
    expect(createEmptyProject().playlistRating).toBe(0);
    expect(createEmptyProject().playlistCumulativePlayMs).toBe(0);
  });

  it("starts with no source-hidden BGM tracks", () => {
    expect(createEmptyProject().sourceHiddenTrackIds).toEqual([]);
  });

  it("starts the implicit No SE Set loaded EXP total at zero", () => {
    expect(createEmptyProject().activeSeSetId).toBeNull();
    expect(createEmptyProject().activeSeSetName).toBeNull();
    expect(createEmptyProject().noActiveSeSetExpTotal).toBe(0);
  });
});
