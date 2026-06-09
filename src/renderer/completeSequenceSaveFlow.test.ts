import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../preload/index.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main/main.ts", import.meta.url), "utf8");

describe("Complete & Save Sequence flow", () => {
  it("labels the completion action as saving a Sequence file", () => {
    expect(i18nSource).toContain('completeSequence: "Complete & Save Sequence"');
    expect(appSource).not.toContain('t("completeSequenceHelp")');
  });

  it("adds a guarded Reset Sequence action that only empties the builder sequence", () => {
    expect(i18nSource).toContain('clearSequence: "Reset Sequence"');
    expect(i18nSource).toContain("BGM Sourceと保存済みListは削除されません。Build Sequencer内の曲だけを取り除きます。");
    expect(appSource).toContain('className="thin-button danger clear-sequence-button"');
    expect(appSource).toContain('className="complete-list-button-label"');
    expect(appSource.indexOf("complete-list-button")).toBeLessThan(appSource.indexOf("clear-sequence-button"));

    const clearFlow = appSource.slice(appSource.indexOf("async function clearCurrentSequence"), appSource.indexOf("async function savePlaylistAs"));
    expect(clearFlow).toContain("requestConfirm");
    expect(clearFlow).toContain("stopPlayback();");
    expect(clearFlow).toContain("playlist: []");
    expect(clearFlow).not.toContain("bgmTracks:");
    expect(clearFlow).not.toContain("savedPlaylists:");
  });

  it("exports the Sequence file before mounting it into the saved list", () => {
    const buildFlow = appSource.slice(appSource.indexOf("async function buildCurrentList"));
    expect(buildFlow).toContain("await window.gamingLooper.exportSequenceFile(payload)");
    expect(buildFlow).toContain("if (!exportResult) return;");
    expect(buildFlow.indexOf("await window.gamingLooper.exportSequenceFile(payload)")).toBeLessThan(buildFlow.indexOf("setProjectState((draft) =>"));
    expect(buildFlow).toContain("sanitizePlaylistName(exportResult.playlistName, fallbackName)");
  });

  it("returns and writes the saved file name as the Sequence name", () => {
    expect(preloadSource).toContain("playlistName: string");
    expect(mainSource).toContain("const playlistName = sequenceNameFromFilePath(result.filePath, payload.playlist.name || \"sequence\");");
    expect(mainSource).toContain("name: playlistName");
    expect(mainSource).toContain("return { path: result.filePath, playlistName };");
  });

  it("uses the .glseq extension for Sequence files while keeping legacy JSON readable", () => {
    expect(mainSource).toContain('`${safeJsonBaseName(payload.playlist.name || "sequence")}.glseq`');
    expect(mainSource).toContain('{ name: "GamingLooper Sequence", extensions: ["glseq"] }');
    expect(mainSource).toContain('{ name: "Legacy GamingLooper Sequence JSON", extensions: ["json"] }');
    expect(mainSource).toContain('replace(/\\.glseq$/i, "")');
  });
});
