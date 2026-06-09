import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("Main View sequencer transport", () => {
  it("renames the playlist transport and playlist panel for Sequencer playback", () => {
    expect(i18nSource).toContain('playlist: "Play Sequencer"');
    expect(i18nSource).toContain('bgmPlaylist: "Sequencer Play List"');
    expect(i18nSource).toContain('sequencerRepeat: "Repeat Sequence"');
    expect(i18nSource).toContain('allListRepeat: "All List Repeat"');
    expect(i18nSource).not.toContain('sequencerRepeat: "Repeat Sequencer"');
  });

  it("uses the existing repeat or stop playlist end behavior from Main View", () => {
    expect(appSource).toContain("function updatePlaylistEndBehavior(playlistEndBehavior: PlaylistEndBehavior): void");
    expect(appSource).toContain("const sequencerRepeats = project.playlistEndBehavior === \"repeat\";");
    expect(appSource).toContain("const allListRepeatActive = project.allListRepeatEnabled;");
    expect(appSource).toContain('onClick={() => onPlaylistEndBehaviorChange("repeat")}');
    expect(appSource).toContain('onClick={() => onPlaylistEndBehaviorChange("stop")}');
    expect(appSource).toContain('disabled={allListRepeatActive}');
  });

  it("places the repeat and one-shot mode control with the transport controls", () => {
    const transport = appSource.slice(appSource.indexOf('className="transport-buttons"'), appSource.indexOf('className="now-playing sequence-now-playing"'));
    expect(transport).toContain('className={`sequencer-end-mode-toggle ${allListRepeatActive ? "all-list-repeat-locked" : ""}`}');
    expect(transport.indexOf('t("playlist")')).toBeLessThan(transport.indexOf("sequencer-end-mode-toggle"));
    expect(transport.indexOf('onClick={onStop}')).toBeLessThan(transport.indexOf("sequencer-end-mode-toggle"));
    expect(transport).toContain('t("sequencerRepeat")');
    expect(transport).toContain('className="all-list-repeat-status"');
    expect(transport).toContain('className="all-list-repeat-lamp"');
    expect(transport).not.toContain('onClick={() => onAllListRepeatChange(false)}');
    expect(styleSource).toContain(".sequencer-end-mode-toggle");
    expect(styleSource).toContain(".all-list-repeat-status");
    expect(styleSource).toContain(".all-list-repeat-lamp");
    expect(styleSource).toContain("pointer-events: none;");
    expect(styleSource).toContain("cursor: default;");
    expect(styleSource).toContain(".sequencer-end-mode-toggle.all-list-repeat-locked");
    expect(styleSource).toContain("grid-template-columns: minmax(680px, 0.92fr) minmax(320px, 1fr) minmax(188px, 240px);");
    expect(styleSource).toContain("flex: 0 0 220px;");
    expect(styleSource).toContain("flex: 0 0 250px;");
    expect(styleSource).toContain("flex-basis: 250px;");
    expect(styleSource).toContain("white-space: nowrap;");
    expect(styleSource).toContain("width: 250px;");
    const transportStyle = styleSource.slice(styleSource.indexOf(".transport-buttons {"), styleSource.indexOf(".icon-button,", styleSource.indexOf(".transport-buttons {")));
    expect(transportStyle).toContain("overflow: hidden;");
    expect(transportStyle).not.toContain("overflow-x: auto;");
  });

  it("advances to the next saved Sequence when All List Repeat reaches the current Sequence end", () => {
    expect(appSource).toContain("function updateAllListRepeatEnabled(allListRepeatEnabled: boolean): void");
    expect(appSource).toContain('const effectiveEndBehavior: PlaylistEndBehavior = latestProject.allListRepeatEnabled ? "stop" : latestProject.playlistEndBehavior;');
    expect(appSource).toContain("if (latestProject.allListRepeatEnabled && playNextSavedPlaylistForAllListRepeat(latestProject))");
    expect(appSource).toContain("function playNextSavedPlaylistForAllListRepeat(currentProject: GamingProject): boolean");
    expect(appSource).toContain("(currentIndex + 1) % currentProject.savedPlaylists.length");
    expect(appSource).toContain("void playPlaylistAt(0);");
  });

  it("keeps the Main View playlist internally scrollable without adding transport scrollbars", () => {
    expect(appSource).toContain('<div className="playlist-list">');
    const playlistStyle = styleSource.slice(styleSource.indexOf(".playlist-list {"), styleSource.indexOf(".playlist-row {"));
    expect(playlistStyle).toContain("flex: 1 1 auto;");
    expect(playlistStyle).toContain("min-height: 0;");
    expect(playlistStyle).toContain("overflow-y: auto;");
    expect(playlistStyle).toContain("align-content: start;");
    expect(playlistStyle).not.toContain("overflow: hidden;");
  });
});
