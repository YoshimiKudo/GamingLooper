import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main/main.ts", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../preload/index.ts", import.meta.url), "utf8");

describe("Sequence update guard", () => {
  it("shows an active Main View update button only when the active Sequence differs from its saved List", () => {
    expect(appSource).toContain("canUpdateSequenceData={Boolean(project.activePlaylistId) && hasCurrentPlaylistChanges(project)}");
    expect(appSource).toContain("onUpdateSequenceData={overwriteActivePlaylist}");
    expect(appSource).toContain('className={`thin-button sequence-update-button ${canUpdateSequenceData ? "active" : ""}`}');
    expect(i18nSource).toContain('updateSequenceData: "Seqデータ更新"');
  });

  it("checks pending Sequence updates before window close, including close-without-save paths", () => {
    expect(appSource).toContain("window.gamingLooper.setSequenceUpdatePending(hasCurrentPlaylistChanges(project))");
    expect(appSource).toContain("window.gamingLooper.onBeforeCloseCheckRequested");
    expect(appSource).toContain("confirmSequenceUpdateBeforeClose()");
    expect(preloadSource).toContain('ipcRenderer.send("app:set-sequence-update-pending", pending);');
    expect(preloadSource).toContain('ipcRenderer.on("app:before-close-check", listener);');
    expect(mainSource).toContain("sequenceUpdatePendingByWebContents");
    expect(mainSource).toContain("requestBeforeCloseCheck(window)");
    expect(mainSource.indexOf("requestBeforeCloseCheck(window)")).toBeLessThan(mainSource.indexOf('message: "アプリ状態を保存しますか？"'));
  });
});
