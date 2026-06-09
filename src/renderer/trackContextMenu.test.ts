import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("track row context actions", () => {
  it("plays a Build Sequencer track directly on row double click", () => {
    expect(appSource).toContain("async function playTrack(trackId?: string | null): Promise<void>");
    expect(appSource).toContain("function handlePlaylistRowDoubleClick(event: ReactMouseEvent<HTMLElement>, itemId: string, trackId: string): void");
    expect(appSource).toContain("onDoubleClick={(event) => handlePlaylistRowDoubleClick(event, item.id, track.id)}");
    expect(appSource).toContain("onPlayTrack(trackId);");
  });

  it("shows row context menus for Build Sequencer and BGM Source rows", () => {
    expect(appSource).toContain("type TrackContextMenuState =");
    expect(appSource).toContain('kind: "builder"');
    expect(appSource).toContain('kind: "source"');
    expect(appSource).toContain('kind: "saved-list"');
    expect(appSource).toContain("onContextMenu={(event) => handlePlaylistRowContextMenu(event, item.id, track.id)}");
    expect(appSource).toContain("onContextMenu={(event) => handleSourceTrackContextMenu(event, track.id)}");
    expect(appSource).toContain("onContextMenu={(event) => handleSavedPlaylistContextMenu(event, playlist.id)}");
    expect(appSource).toContain("BGM Sourceへ戻す");
    expect(appSource).toContain("Build Sequencerへ送る");
    expect(appSource).toContain("複製");
    expect(appSource).toContain("Loop Scan");
    expect(appSource).toContain("onDuplicatePlaylistItem(state.itemId)");
    expect(appSource).toContain("onDuplicateSavedPlaylist(state.playlistId)");
    expect(appSource).toContain("onRenameSavedPlaylist(state.playlistId)");
    expect(appSource).toContain("onDeleteSavedPlaylist(state.playlistId)");
    expect(appSource).toContain("onDeletePlaylistItem(state.itemId)");
    expect(appSource).toContain("onDeleteSourceTrack(state.trackId)");
    expect(styleSource).toContain(".track-context-menu {");
    expect(styleSource).toContain(".track-context-menu-item.danger");
  });

  it("removes single tracks without deleting external audio files", () => {
    expect(appSource).toContain("function deleteSourceTrack(trackId: string): void");
    expect(appSource).toContain("function deletePlaylistItem(itemId: string): void");
    expect(appSource).toContain("const referencedByCurrentPlaylist = playlist.some((candidate) => candidate.trackId === track.id)");
    expect(appSource).toContain("clearVisibleSourceTracks(projectRef.current, [trackId])");
    expect(appSource).toContain("保存済みList用のデータは保持");
    expect(appSource).not.toContain("fs.unlink");
    expect(appSource).not.toContain("deleteFile");
  });

  it("duplicates Build Sequencer rows without duplicating BGM source data", () => {
    expect(appSource).toContain("function duplicatePlaylistItem(itemId: string): void");
    expect(appSource).toContain("...makePlaylistItem(sourceItem.trackId, index + 1)");
    expect(appSource).toContain("rule: clonePlaylistRule(sourceItem.rule)");
  });

  it("manages saved Seq List cards from their context menu", () => {
    expect(appSource).toContain("function loadSavedPlaylistFromCard(id: string): void");
    expect(appSource).toContain("function activateSavedPlaylistFromCard(event: ReactMouseEvent<HTMLElement>, id: string): void");
    expect(appSource).toContain("onClick={() => loadSavedPlaylistFromCard(playlist.id)}");
    expect(appSource).toContain("onDoubleClick={(event) => activateSavedPlaylistFromCard(event, playlist.id)}");
    expect(appSource).toContain("async function deleteSavedPlaylist(id: string): Promise<void>");
    expect(appSource).toContain("function duplicateSavedPlaylist(id: string): void");
    expect(appSource).toContain("async function renameSavedPlaylist(id: string): Promise<void>");
    expect(appSource).toContain("function getUniqueSavedPlaylistName(baseName: string, playlists: SavedPlaylist[], ignoreId?: string): string");
    expect(appSource).toContain("savedPlaylists: draft.savedPlaylists.filter((item) => item.id !== id)");
    expect(appSource).toContain("savedPlaylists: [...draft.savedPlaylists, duplicate]");
    expect(appSource).toContain("savedPlaylists: draft.savedPlaylists.map((item) => (item.id === id ? { ...item, name: safeName } : item))");
  });
});
