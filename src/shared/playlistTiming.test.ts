import { describe, expect, it } from "vitest";
import type { BgmTrack, PlaylistRule } from "./types.js";
import {
  getNextPlaylistIndex,
  getPlaylistDurationInputMs,
  getPlaylistFadeMs,
  getPlaylistFadeStartMs,
  getPlaylistMinimumDurationMs,
  getPlaylistPlayMs,
  getPlaylistTransitionDelayMs
} from "./playlistTiming.js";

const sampleFixtureNames = ["AAB.wav", "Gaiming Slug.wav", "Raining Pale Blood.wav"];
const samples: SampleWavInfo[] = [
  { name: "AAB.wav", durationMs: 40851, sampleRate: 48000, channels: 2, bitDepth: 16 },
  { name: "Gaiming Slug.wav", durationMs: 124419, sampleRate: 48000, channels: 2, bitDepth: 16 },
  { name: "Raining Pale Blood.wav", durationMs: 30500, sampleRate: 48000, channels: 2, bitDepth: 16 }
];

describe("Build Sequencer timing with sample BGM fixtures", () => {
  it("loads the expected three sample BGM metadata fixtures used for sequence validation", () => {
    expect(samples.map((sample) => sample.name).sort()).toEqual(sampleFixtureNames);
    expect(samples.find((sample) => sample.name === "AAB.wav")?.durationMs).toBeCloseTo(40851, 0);
    expect(samples.find((sample) => sample.name === "Gaiming Slug.wav")?.durationMs).toBeCloseTo(124419, 0);
    expect(samples.find((sample) => sample.name === "Raining Pale Blood.wav")?.durationMs).toBeCloseTo(30500, 0);
  });

  it("uses full track duration and no fade for sample tracks without loop markers", () => {
    const track = makeTrack(samples.find((sample) => sample.name === "AAB.wav")!);
    const rule: PlaylistRule = { mode: "loop-count", loopCount: 4, fadeOutMs: 8000 };

    expect(getPlaylistPlayMs(track, rule)).toBeCloseTo(track.durationMs, 0);
    expect(getPlaylistFadeMs(track, rule)).toBe(0);
  });

  it("starts Loop mode fade after the requested loop-count end", () => {
    const track = withLoop(makeTrack(samples.find((sample) => sample.name === "Gaiming Slug.wav")!), 10000, 25000);
    const rule: PlaylistRule = { mode: "loop-count", loopCount: 3, fadeOutMs: 8000 };

    expect(getPlaylistPlayMs(track, rule)).toBe(63000);
    expect(getPlaylistDurationInputMs(track, rule)).toBe(63000);
    expect(getPlaylistFadeMs(track, rule)).toBe(8000);
    expect(getPlaylistFadeStartMs(getPlaylistPlayMs(track, rule), getPlaylistFadeMs(track, rule))).toBe(55000);
  });

  it("requires Time mode to be longer than fade without adding the loop marker offset", () => {
    const track = withLoop(makeTrack(samples.find((sample) => sample.name === "Raining Pale Blood.wav")!), 5000, 15000);
    const rule: PlaylistRule = { mode: "duration", durationMs: 12000, fadeOutMs: 20000 };

    expect(getPlaylistMinimumDurationMs(track, rule)).toBe(21000);
    expect(getPlaylistPlayMs(track, rule)).toBe(21000);
    expect(getPlaylistDurationInputMs(track, rule)).toBe(12000);
    expect(getPlaylistFadeMs(track, rule)).toBe(20000);
    expect(getPlaylistFadeStartMs(getPlaylistPlayMs(track, rule), getPlaylistFadeMs(track, rule))).toBe(1000);
  });

  it("allows Time 10 and Fade 8 even when fade starts before the loop marker", () => {
    const track = withLoop(makeTrack(samples.find((sample) => sample.name === "Gaiming Slug.wav")!), 5000, 25000);
    const rule: PlaylistRule = { mode: "duration", durationMs: 10000, fadeOutMs: 8000 };

    expect(getPlaylistMinimumDurationMs(track, rule)).toBe(9000);
    expect(getPlaylistPlayMs(track, rule)).toBe(10000);
    expect(getPlaylistFadeStartMs(getPlaylistPlayMs(track, rule), getPlaylistFadeMs(track, rule))).toBe(2000);
  });

  it("keeps Time 12 and Fade 8 as 4 seconds of normal playback followed by 8 seconds of fade when the loop starts at 0", () => {
    const track = withLoop(makeTrack(samples.find((sample) => sample.name === "Gaiming Slug.wav")!), 0, 104704);
    const rule: PlaylistRule = { mode: "duration", durationMs: 12000, fadeOutMs: 8000 };

    expect(getPlaylistMinimumDurationMs(track, rule)).toBe(9000);
    expect(getPlaylistPlayMs(track, rule)).toBe(12000);
    expect(getPlaylistFadeMs(track, rule)).toBe(8000);
    expect(getPlaylistFadeStartMs(getPlaylistPlayMs(track, rule), getPlaylistFadeMs(track, rule))).toBe(4000);
  });

  it("plays a looped track straight through when Straight mode is selected", () => {
    const track = withLoop(makeTrack(samples.find((sample) => sample.name === "Gaiming Slug.wav")!), 10000, 25000);
    const rule: PlaylistRule = { mode: "straight", fadeOutMs: 8000, loopCount: 3, durationMs: 18000 };

    expect(getPlaylistPlayMs(track, rule)).toBeCloseTo(track.durationMs, 0);
    expect(getPlaylistDurationInputMs(track, rule)).toBe(18000);
    expect(getPlaylistFadeMs(track, rule)).toBe(0);
  });

  it("keeps playlist transition delay separate and computes stop/repeat next indices", () => {
    expect(getPlaylistTransitionDelayMs(55000)).toBe(55120);
    expect(getNextPlaylistIndex(0, 3, "repeat")).toBe(1);
    expect(getNextPlaylistIndex(2, 3, "repeat")).toBe(0);
    expect(getNextPlaylistIndex(2, 3, "stop")).toBeNull();
  });
});

interface SampleWavInfo {
  name: string;
  durationMs: number;
  sampleRate: number;
  channels: number;
  bitDepth: number;
}

function makeTrack(sample: SampleWavInfo): BgmTrack {
  return {
    id: sample.name,
    filePath: `asset/bgm/${sample.name}`,
    fileName: sample.name,
    file: {
      path: `asset/bgm/${sample.name}`,
      name: sample.name,
      size: 0,
      mtimeMs: 0,
      sha256: sample.name
    },
    format: "wav",
    sampleRate: sample.sampleRate,
    bitDepth: sample.bitDepth,
    channels: sample.channels,
    durationSamples: Math.round((sample.durationMs / 1000) * sample.sampleRate),
    durationMs: sample.durationMs,
    volume: 1,
    loop: null,
    status: "pending",
    validation: "",
    waveform: null
  };
}

function withLoop(track: BgmTrack, startMs: number, endMs: number): BgmTrack {
  const startSample = Math.round((startMs / 1000) * track.sampleRate);
  const endSample = Math.round((endMs / 1000) * track.sampleRate);
  return {
    ...track,
    loop: {
      startSample,
      endSample,
      lengthSamples: endSample - startSample,
      confidence: 50,
      source: "manual"
    }
  };
}
