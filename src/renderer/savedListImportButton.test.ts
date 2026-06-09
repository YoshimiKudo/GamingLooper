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

  it("keeps the Sequence import button inside the saved-list column at narrow widths", () => {
    const savedListZoneStyle = styleSource.slice(styleSource.indexOf(".saved-list-zone {"), styleSource.indexOf(".saved-list-zone.list-not-loaded"));
    const savedListActionsStyle = styleSource.slice(styleSource.indexOf(".saved-list-actions {"), styleSource.indexOf(".load-list-button {"));
    const loadListButtonStyle = styleSource.slice(styleSource.indexOf(".load-list-button {"), styleSource.indexOf(".load-list-button:hover"));

    expect(savedListZoneStyle).toContain("container-type: inline-size;");
    expect(savedListZoneStyle).toContain("max-width: 100%;");
    expect(savedListZoneStyle).toContain("overflow: hidden;");
    expect(savedListActionsStyle).toContain("box-sizing: border-box;");
    expect(savedListActionsStyle).toContain("justify-self: stretch;");
    expect(savedListActionsStyle).toContain("width: 100cqw;");
    expect(savedListActionsStyle).toContain("max-width: 100%;");
    expect(savedListActionsStyle).toContain("min-width: 0;");
    expect(savedListActionsStyle).toContain("overflow: hidden;");
    expect(savedListActionsStyle).toContain("padding: 10px 8px 0;");
    expect(loadListButtonStyle).toContain("box-sizing: border-box;");
    expect(loadListButtonStyle).toContain("justify-self: stretch;");
    expect(loadListButtonStyle).toContain("max-width: 100%;");
    expect(loadListButtonStyle).toContain("min-width: 0;");
    expect(loadListButtonStyle).toContain("text-overflow: ellipsis;");
  });

  it("shows editable Fav and total time on saved list cards", () => {
    const savedListCardBlock = appSource.slice(appSource.indexOf('className={`saved-list-card'), appSource.indexOf('className="thin-button saved-list-file-button"'));
    const savedListStyleBlock = styleSource.slice(styleSource.indexOf(".saved-list-card {"), styleSource.indexOf(".saved-list-file-button"));

    expect(savedListCardBlock).toContain('className="saved-list-song-count"');
    expect(savedListCardBlock).toContain('className="saved-list-stars"');
    expect(savedListCardBlock).toContain("<SequenceStars rating={playlist.rating}");
    expect(savedListCardBlock).toContain("onSavedPlaylistRatingChange(playlist.id, rating)");
    expect(savedListCardBlock).toContain("onClick={stopSavedPlaylistRatingEvent}");
    expect(savedListCardBlock).toContain('className="saved-list-total-time"');
    expect(savedListCardBlock).toContain('{t("total")} {formatTimeSeconds(totalMs)}');
    expect(savedListCardBlock).not.toContain('{t("cumulative")}');
    expect(savedListCardBlock).not.toContain('<span>{t("total")}');
    expect(savedListStyleBlock).toContain('grid-template-areas:');
    expect(savedListStyleBlock).toContain('"name count"');
    expect(savedListStyleBlock).toContain('"stars total"');
    expect(styleSource).toContain(".saved-list-stars");
    expect(styleSource).toContain(".saved-list-total-time");
    expect(styleSource).toContain("justify-self: end;");
  });
});
