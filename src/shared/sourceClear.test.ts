import { describe, expect, it } from "vitest";
import type { BgmTrack, GamingProject } from "./types.js";
import { createEmptyProject, makePlaylistItem } from "./project.js";
import { clearVisibleSourceTracks } from "./sourceClear.js";

describe("BGM Source clear", () => {
  it("clears only requested source tracks and keeps the build sequence intact", () => {
    const source = makeTrack("source", "Source.wav");
    const sequenced = makeTrack("sequenced", "Sequenced.wav");
    const project: GamingProject = {
      ...createEmptyProject(),
      selectedTrackId: source.id,
      bgmTracks: [source, sequenced],
      playlistCreated: true,
      activePlaylistId: "active",
      playlist: [makePlaylistItem(sequenced.id, 0)]
    };

    const result = clearVisibleSourceTracks(project, [source.id]);

    expect(result.clearedIds).toEqual([source.id]);
    expect(result.project.bgmTracks.map((track) => track.id)).toEqual([sequenced.id]);
    expect(result.project.sourceHiddenTrackIds).toEqual([]);
    expect(result.project.playlist).toEqual(project.playlist);
    expect(result.project.playlistCreated).toBe(true);
    expect(result.project.activePlaylistId).toBe("active");
    expect(result.project.selectedTrackId).toBe(sequenced.id);
  });

  it("keeps tracks referenced by saved lists so Sequence List data is not damaged", () => {
    const source = makeTrack("source", "Source.wav");
    const savedOnly = makeTrack("saved", "Saved.wav");
    const project: GamingProject = {
      ...createEmptyProject(),
      bgmTracks: [source, savedOnly],
      savedPlaylists: [{ id: "saved-list", name: "Saved List", rating: 0, cumulativePlayMs: 0, items: [makePlaylistItem(savedOnly.id, 0)] }]
    };

    const result = clearVisibleSourceTracks(project, [source.id, savedOnly.id]);

    expect(result.clearedIds).toEqual([source.id]);
    expect(result.skippedReferencedIds).toEqual([savedOnly.id]);
    expect(result.project.bgmTracks.map((track) => track.id)).toEqual([savedOnly.id]);
    expect(result.project.sourceHiddenTrackIds).toEqual([savedOnly.id]);
    expect(result.project.savedPlaylists).toEqual(project.savedPlaylists);
  });

  it("unmounts a saved-list referenced source track without damaging the saved list", () => {
    const movedBack = makeTrack("moved", "Moved Back.wav");
    const sequenced = makeTrack("sequenced", "Sequenced.wav");
    const project: GamingProject = {
      ...createEmptyProject(),
      selectedTrackId: movedBack.id,
      bgmTracks: [movedBack, sequenced],
      playlistCreated: true,
      playlist: [makePlaylistItem(sequenced.id, 0)],
      savedPlaylists: [{ id: "saved-list", name: "Saved List", rating: 0, cumulativePlayMs: 0, items: [makePlaylistItem(movedBack.id, 0)] }]
    };

    const result = clearVisibleSourceTracks(project, [movedBack.id]);

    expect(result.clearedIds).toEqual([]);
    expect(result.skippedReferencedIds).toEqual([movedBack.id]);
    expect(result.project.bgmTracks.map((track) => track.id)).toEqual([movedBack.id, sequenced.id]);
    expect(result.project.sourceHiddenTrackIds).toEqual([movedBack.id]);
    expect(result.project.savedPlaylists).toEqual(project.savedPlaylists);
    expect(result.project.selectedTrackId).toBe(sequenced.id);
  });
});

function makeTrack(id: string, fileName: string): BgmTrack {
  return {
    id,
    fileName,
    filePath: `C:\\bgm\\${fileName}`,
    file: { path: `C:\\bgm\\${fileName}`, name: fileName, size: 1, mtimeMs: 1, sha256: id },
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
