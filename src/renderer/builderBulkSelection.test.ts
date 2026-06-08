import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("Build Sequencer bulk selection", () => {
  it("selects multiple sequencer cards with shift-click", () => {
    expect(appSource).toContain("const [selectedPlaylistItemIds, setSelectedPlaylistItemIds] = useState<Set<string>>(() => new Set());");
    expect(appSource).toContain("function handlePlaylistRowClick");
    expect(appSource).toContain("if (event.shiftKey)");
    expect(appSource).toContain("setSelectedPlaylistItemIds(new Set(playlistTracks.slice(start, end + 1).map(({ item }) => item.id)))");
    expect(appSource).toContain("onClick={(event) => handlePlaylistRowClick(event, item.id, track.id)}");
  });

  it("switches from all-track edit to selected bulk edit when multiple sequencer cards are selected", () => {
    expect(appSource).toContain("const bulkPlaylistTargets = selectedPlaylistTracks.length > 1 ? selectedPlaylistTracks : playlistTracks;");
    expect(appSource).toContain('hasBulkPlaylistSelection ? "一括変更" : "全曲変更"');
    expect(appSource).toContain("`対象: 選択中 ${bulkPlaylistTargets.length}曲`");
    expect(appSource).toContain("`対象: 全${playlistTracks.length}曲`");
  });

  it("applies loop, duration, and fade bulk changes only to selected sequencer item ids", () => {
    expect(appSource).toContain("const bulkPlaylistTargetItemIds = selectedPlaylistTracks.length > 1 ? selectedPlaylistTracks.map(({ item }) => item.id) : undefined;");
    expect(appSource).toContain("onApplyPlaylistLoopCountToAll(safeValue, bulkPlaylistTargetItemIds)");
    expect(appSource).toContain("onApplyPlaylistDurationToAll(safeValue, bulkPlaylistTargetItemIds)");
    expect(appSource).toContain("onApplyPlaylistFadeToAll(safeValue * 1000, bulkPlaylistTargetItemIds)");
    expect(appSource).toContain("if (targetItemIds && !targetItemIds.has(item.id)) return item;");
  });

  it("keeps bulk edit controls collapsed until hover or focus", () => {
    expect(appSource).toContain('className="builder-bulk-action-row"');
    expect(appSource).toContain("tabIndex={0}");
    expect(appSource).toContain('className="builder-bulk-action-handle"');
    expect(styleSource).toContain(".builder-bulk-action-row:hover .builder-bulk-action-buttons");
    expect(styleSource).toContain(".builder-bulk-action-row:focus-within .builder-bulk-action-buttons");
    expect(styleSource).toContain("max-height: 0;");
    expect(styleSource).toContain("visibility: hidden;");
    expect(styleSource).toContain("max-height: 44px;");
    expect(styleSource).toContain("grid-template-columns: minmax(0, 1fr);");
  });

  it("highlights multi-selected sequencer cards", () => {
    expect(appSource).toContain('selectedPlaylistItemIds.has(item.id) ? "multi-selected" : ""');
    expect(styleSource).toContain(".builder-song-row.multi-selected");
  });
});
