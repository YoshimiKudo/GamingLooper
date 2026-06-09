import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("Main View playlist row double click", () => {
  it("jumps playback to the double-clicked enabled playlist item", () => {
    expect(appSource).toContain("onPlayPlaylistIndex={(index, startElapsedMs) => void playPlaylistAt(index, startElapsedMs)}");
    expect(appSource).toContain("const enabledRows = playlistCreated ? getEnabledPlaylistItems(project.playlist) : [];");
    expect(appSource).toContain("const enabledIndex = enabledRows.findIndex((candidate) => candidate.id === item.id);");
    expect(appSource).toContain("onDoubleClick={() => {");
    expect(appSource).toContain("if (enabledIndex >= 0) onPlayPlaylistIndex(enabledIndex);");
  });

  it("seeks to the double-clicked point on the expanded playlist progress bar", () => {
    expect(appSource).toContain("async function playPlaylistAt(index: number, startElapsedMs = 0): Promise<void>");
    expect(appSource).toContain("const safeStartElapsedMs = Math.max(0, Math.min(plannedMs, startElapsedMs));");
    expect(appSource).toContain("const audioOffsetMs = getPlaylistAudioOffsetMs(track, item.rule, safeStartElapsedMs);");
    expect(appSource).toContain("startedAt: playlistStartedAt - safeStartElapsedMs / sanitizePlaybackRate(debugRate)");
    expect(appSource).toContain("schedulePlaylistTimers(item, index, track, plannedMs, debugRate, safeStartElapsedMs)");
    expect(appSource).toContain("onSeek?.(ratio * safePlannedMs)");
    expect(appSource).toContain("event.stopPropagation();");
  });

  it("uses a play cursor on the expanded playlist progress bar", () => {
    const progressStyle = styleSource.slice(styleSource.indexOf(".playlist-progress {"), styleSource.indexOf(".playlist-progress-loop,"));
    expect(styleSource).toContain("--play-seek-cursor: url(\"data:image/svg+xml");
    expect(progressStyle).toContain("cursor: var(--play-seek-cursor);");
    expect(appSource).not.toContain("data-seek-tooltip");
    expect(styleSource).not.toContain(".playlist-progress-anchor::after");
    expect(progressStyle).not.toContain("cursor: crosshair;");
    expect(progressStyle).not.toContain("cursor: ew-resize;");
  });

  it("maps expanded loop playback time back to the audio file offset", () => {
    expect(appSource).toContain("function getPlaylistAudioOffsetMs(track: BgmTrack, rule: PlaylistRule, elapsedMs: number): number");
    expect(appSource).toContain("const loopElapsedMs = (safeElapsedMs - introMs) % loopMs;");
    expect(appSource).toContain("return Math.max(0, Math.min(track.durationMs, introMs + loopElapsedMs));");
  });
});
