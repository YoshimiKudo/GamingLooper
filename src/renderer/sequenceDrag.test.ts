import { describe, expect, it } from "vitest";
import {
  SOURCE_TRACK_DRAG_TYPE,
  SOURCE_TRACKS_DRAG_TYPE,
  filterSourceDragDropIds,
  hasSourceTrackDragType,
  parseSourceTrackDragIds,
  selectSourceDragTrackIds,
  shouldLockSourceDragToCardMove,
  shouldSwitchSourceDragToRangeSelection
} from "./sequenceDrag.js";

describe("Sequence Builder source drag", () => {
  it("detects BGM Source drag payloads without relying on React state", () => {
    expect(hasSourceTrackDragType([SOURCE_TRACKS_DRAG_TYPE])).toBe(true);
    expect(hasSourceTrackDragType([SOURCE_TRACK_DRAG_TYPE])).toBe(true);
    expect(hasSourceTrackDragType(["text/plain"])).toBe(false);
  });

  it("parses multi-track payloads and falls back to a single track id", () => {
    expect(parseSourceTrackDragIds(JSON.stringify(["a", "b", 3, ""]), "", "")).toEqual(["a", "b"]);
    expect(parseSourceTrackDragIds("", "single", "")).toEqual(["single"]);
    expect(parseSourceTrackDragIds("", "", "fallback")).toEqual(["fallback"]);
  });

  it("keeps scan-finished selected tracks draggable while excluding the currently scanning track", () => {
    expect(selectSourceDragTrackIds("done-1", ["done-1", "scanning", "done-2"], ["done-1", "scanning", "done-2"], "scanning")).toEqual([
      "done-1",
      "done-2"
    ]);
  });

  it("prevents dragging the currently scanning source card itself", () => {
    expect(selectSourceDragTrackIds("scanning", ["scanning", "done"], ["scanning", "done"], "scanning")).toEqual([]);
  });

  it("prevents dragging source cards that are not in the allowed drag set", () => {
    expect(selectSourceDragTrackIds("waiting", ["waiting", "done"], ["done"], null)).toEqual([]);
    expect(selectSourceDragTrackIds("done", ["waiting", "done"], ["done"], null)).toEqual(["done"]);
  });

  it("keeps drag-start payloads valid at drop time without scan-state filtering", () => {
    expect(filterSourceDragDropIds(["done-1", "done-2", "done-1", "missing"], ["done-1", "done-2"])).toEqual(["done-1", "done-2"]);
  });

  it("switches card drag to range selection only after a mostly vertical two-row drag", () => {
    expect(shouldSwitchSourceDragToRangeSelection({ deltaX: 10, deltaY: 128, rowHeightPx: 60 })).toBe(true);
    expect(shouldSwitchSourceDragToRangeSelection({ deltaX: 10, deltaY: 90, rowHeightPx: 60 })).toBe(false);
    expect(shouldSwitchSourceDragToRangeSelection({ deltaX: 64, deltaY: 128, rowHeightPx: 60 })).toBe(false);
  });

  it("locks source card dragging before range selection when horizontal movement wins first", () => {
    expect(shouldLockSourceDragToCardMove({ deltaX: 124, deltaY: 72, rowHeightPx: 60, rowWidthPx: 420 })).toBe(true);
    expect(shouldLockSourceDragToCardMove({ deltaX: 124, deltaY: 128, rowHeightPx: 60, rowWidthPx: 420 })).toBe(false);
    expect(shouldLockSourceDragToCardMove({ deltaX: 90, deltaY: 72, rowHeightPx: 60, rowWidthPx: 420 })).toBe(false);
  });
});
