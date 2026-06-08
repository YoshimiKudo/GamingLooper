import { describe, expect, it } from "vitest";
import { getEnabledPlaylistItems, insertPlaylistItemAt, reorderPlaylistItems } from "./playlistOrder.js";

describe("Build Sequencer order", () => {
  it("inserts dropped tracks at the requested position", () => {
    expect(insertPlaylistItemAt(["a", "c"], "b", 1)).toEqual(["a", "b", "c"]);
    expect(insertPlaylistItemAt(["a"], "b")).toEqual(["a", "b"]);
    expect(insertPlaylistItemAt(["b"], "a", -10)).toEqual(["a", "b"]);
  });

  it("reorders cards using the same target-index semantics as drag drop", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

    expect(reorderPlaylistItems(items, "a", 3).map((item) => item.id)).toEqual(["b", "c", "a", "d"]);
    expect(reorderPlaylistItems(items, "d", 1).map((item) => item.id)).toEqual(["a", "d", "b", "c"]);
    expect(reorderPlaylistItems(items, "b", 2)).toBe(items);
  });

  it("uses only enabled sequence items for playlist playback", () => {
    const items = [
      { id: "a", enabled: true },
      { id: "b", enabled: false },
      { id: "c", enabled: true }
    ];

    expect(getEnabledPlaylistItems(items).map((item) => item.id)).toEqual(["a", "c"]);
  });
});
