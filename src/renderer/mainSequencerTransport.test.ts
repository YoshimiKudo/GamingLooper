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
    expect(i18nSource).not.toContain('sequencerRepeat: "Repeat Sequencer"');
  });

  it("uses the existing repeat or stop playlist end behavior from Main View", () => {
    expect(appSource).toContain("function updatePlaylistEndBehavior(playlistEndBehavior: PlaylistEndBehavior): void");
    expect(appSource).toContain("const sequencerRepeats = project.playlistEndBehavior === \"repeat\";");
    expect(appSource).toContain('onClick={() => onPlaylistEndBehaviorChange("repeat")}');
    expect(appSource).toContain('onClick={() => onPlaylistEndBehaviorChange("stop")}');
  });

  it("places the repeat and one-shot mode control with the transport controls", () => {
    const transport = appSource.slice(appSource.indexOf('className="transport-buttons"'), appSource.indexOf('className="now-playing sequence-now-playing"'));
    expect(transport).toContain('className="sequencer-end-mode-toggle"');
    expect(transport.indexOf('t("playlist")')).toBeLessThan(transport.indexOf('className="sequencer-end-mode-toggle"'));
    expect(transport).toContain('t("sequencerRepeat")');
    expect(styleSource).toContain(".sequencer-end-mode-toggle");
    expect(styleSource).toContain("grid-template-columns: minmax(680px, 0.92fr) minmax(320px, 1fr) minmax(188px, 240px);");
    expect(styleSource).toContain("flex: 0 0 220px;");
    expect(styleSource).toContain("flex: 0 0 250px;");
    expect(styleSource).toContain("flex-basis: 250px;");
    expect(styleSource).toContain("white-space: nowrap;");
    expect(styleSource).toContain("width: 250px;");
  });
});
