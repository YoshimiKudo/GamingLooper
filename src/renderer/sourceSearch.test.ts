import { describe, expect, it } from "vitest";
import type { BgmTrack } from "../shared/types.js";
import { filterAndSortSourceTracks } from "./sourceSearch.js";

describe("BGM Source search", () => {
  it("returns every source track in the same order when the search is blank", () => {
    const tracks = [makeTrack("1", "AAB.wav", "C:\\bgm\\AAB.wav"), makeTrack("2", "Gaming Slug.wav", "C:\\bgm\\Gaming Slug.wav")];

    expect(filterAndSortSourceTracks(tracks, "   ")).toBe(tracks);
  });

  it("filters tracks by file name or path tokens", () => {
    const tracks = [
      makeTrack("1", "AAB.wav", "C:\\bgm\\AAB.wav"),
      makeTrack("2", "Gaming Slug.wav", "C:\\bgm\\Gaming Slug.wav"),
      makeTrack("3", "Raining Pale Blood.wav", "C:\\samples\\blood\\Raining Pale Blood.wav")
    ];

    expect(filterAndSortSourceTracks(tracks, "slug").map((track) => track.id)).toEqual(["2"]);
    expect(filterAndSortSourceTracks(tracks, "samples blood").map((track) => track.id)).toEqual(["3"]);
  });

  it("ranks direct file-name matches before path-only matches without changing the source list", () => {
    const tracks = [
      makeTrack("1", "Intro.wav", "C:\\loop\\blood\\Intro.wav"),
      makeTrack("2", "Blood Theme.wav", "C:\\loop\\Blood Theme.wav"),
      makeTrack("3", "Pale Blood.wav", "C:\\loop\\Pale Blood.wav")
    ];

    expect(filterAndSortSourceTracks(tracks, "blood").map((track) => track.id)).toEqual(["2", "3", "1"]);
    expect(tracks.map((track) => track.id)).toEqual(["1", "2", "3"]);
  });

  it("returns an empty visible list without mutating the backing source tracks", () => {
    const tracks = [makeTrack("1", "AAB.wav", "C:\\bgm\\AAB.wav")];

    expect(filterAndSortSourceTracks(tracks, "missing")).toEqual([]);
    expect(tracks).toHaveLength(1);
  });
});

function makeTrack(id: string, fileName: string, filePath: string): BgmTrack {
  return {
    id,
    fileName,
    filePath,
    file: { path: filePath, name: fileName, size: 1, mtimeMs: 1, sha256: id },
    format: "wav",
    sampleRate: 48000,
    bitDepth: 16,
    channels: 2,
    durationSamples: 48000,
    durationMs: 1000,
    volume: 1,
    loop: null,
    status: "pending",
    validation: "",
    waveform: null
  };
}
