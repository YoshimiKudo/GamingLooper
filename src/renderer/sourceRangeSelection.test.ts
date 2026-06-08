import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("BGM Source range selection", () => {
  it("starts range selection from blank source-scroll space", () => {
    expect(appSource).toContain("function beginSourceRangeSelection");
    expect(appSource).toContain("onPointerDown={beginSourceRangeSelection}");
    expect(appSource).toContain('target.closest(".source-track-row, button, input, select, textarea, label")');
  });

  it("switches mostly vertical source card drags into range selection", () => {
    expect(appSource).toContain("shouldSwitchSourceDragToRangeSelection({ deltaX, deltaY, rowHeightPx: drag.rowHeightPx })");
    expect(appSource).toContain("shouldLockSourceDragToCardMove({ deltaX, deltaY, rowHeightPx: drag.rowHeightPx, rowWidthPx: drag.rowWidthPx })");
    expect(appSource).toContain("drag.cardMoveLocked = true;");
    expect(appSource).toContain('source: "card"');
    expect(appSource).toContain("sourceSuppressClickRef.current = selection.source === \"card\";");
  });

  it("renders a visible source range selection rectangle", () => {
    expect(appSource).toContain("source-range-selection-box");
    expect(appSource).toContain("data-source-track-id={track.id}");
    expect(styleSource).toContain(".source-range-selection-box");
  });

  it("keeps scanning and waiting rows out of multi-selection reactions", () => {
    expect(appSource).toContain(".filter((id) => draggableSourceTrackIdSet.has(id))");
    expect(appSource).toContain("const isSourceSelected = selectedSourceTrackIds.has(track.id) && canDragSourceTrack;");
    expect(appSource).toContain(".filter((track) => draggableSourceTrackIdSet.has(track.id))");
  });

  it("restores the source-card drag ghost", () => {
    expect(appSource).toContain("source-track-drag-ghost");
    expect(styleSource).toContain(".source-track-drag-ghost");
  });

  it("adds a single BGM Source row to Build Sequencer on double click", () => {
    expect(appSource).toContain("function handleSourceTrackDoubleClick");
    expect(appSource).toContain("onDoubleClick={(event) => handleSourceTrackDoubleClick(event, track.id)}");
    expect(appSource).toContain("if (!draggableSourceTrackIdSet.has(trackId)) return;");
    expect(appSource).toContain("requestAddTracks([trackId], playlistTracks.length);");
  });

  it("uses blue-green styling for the active source scan card", () => {
    expect(styleSource).toContain(".source-track-row.auto-loop-processing");
    expect(styleSource).toContain("rgba(43, 215, 233, 0.095)");
    expect(styleSource).toContain("rgba(90, 212, 107, 0.055)");
    expect(styleSource).toContain("rgba(188, 247, 232, 0.94)");
  });
});
