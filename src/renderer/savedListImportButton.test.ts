import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("saved list action buttons", () => {
  it("keeps sequence import and removes the stored list load button", () => {
    expect(appSource).toContain('className="load-list-button" type="button" onClick={onImportSequenceFile}');
    expect(appSource).toContain('t("importSequence")');
    expect(appSource).not.toContain('t("loadList")');
    expect(appSource).not.toContain("loadSelectedSavedPlaylist");
    expect(appSource).not.toContain("onLoadSavedPlaylist");
    expect(appSource).not.toContain("onLoadStoredProject");
  });

  it("shows saved list total time only on the right side of the card", () => {
    const savedListCardBlock = appSource.slice(appSource.indexOf('className={`saved-list-card'), appSource.indexOf('className="thin-button saved-list-file-button"'));
    const savedListStyleBlock = styleSource.slice(styleSource.indexOf(".saved-list-card {"), styleSource.indexOf(".saved-list-file-button"));

    expect(savedListCardBlock).toContain('className="saved-list-song-count"');
    expect(savedListCardBlock).toContain('className="saved-list-total-time"');
    expect(savedListCardBlock).toContain('{t("total")} {formatTimeSeconds(totalMs)}');
    expect(savedListCardBlock).not.toContain('{t("cumulative")}');
    expect(savedListCardBlock).not.toContain('<span>{t("total")}');
    expect(savedListStyleBlock).toContain('grid-template-areas:');
    expect(savedListStyleBlock).toContain('"name count"');
    expect(savedListStyleBlock).toContain('". total"');
    expect(styleSource).toContain(".saved-list-total-time");
    expect(styleSource).toContain("justify-self: end;");
  });
});
