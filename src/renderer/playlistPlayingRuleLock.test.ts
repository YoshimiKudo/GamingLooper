import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("currently playing playlist rule lock", () => {
  it("disables Build Sequencer rule controls only for the currently playing playlist item", () => {
    expect(appSource).toContain('const isPlaylistItemPlaying = playback.mode === "playlist" && playback.itemId === item.id;');
    expect(appSource).toContain("const ruleControlsDisabled = isPlaylistItemPlaying;");
    expect(appSource).toContain('ruleControlsDisabled ? "rule-edit-locked" : ""');
    expect(appSource).toContain("disabled={ruleControlsDisabled || !previousRuleMode}");
    expect(appSource).toContain("disabled={ruleControlsDisabled || !nextRuleMode}");
    expect(appSource).toContain("disabled={!canUseLoopRules || ruleControlsDisabled}");
    expect(appSource).toContain('disabled={!canUseLoopRules || displayRuleMode === "straight" || ruleControlsDisabled}');
    expect(appSource).toContain('className="builder-now-playing-card"');
    expect(appSource).toContain("<span>Now Playing</span>");
    expect(styleSource).toContain(".builder-song-row.rule-edit-locked .builder-rule-panel");
    expect(styleSource).toContain(".builder-now-playing-card {");
    expect(styleSource).toContain("pointer-events: none;");
    expect(styleSource).toContain("cursor: not-allowed;");
  });

  it("guards playlist rule updates through non-row paths while a playlist item is playing", () => {
    expect(appSource).toContain("function isPlaylistItemRuleLocked(itemId: string): boolean");
    expect(appSource).toContain('return currentPlayback.mode === "playlist" && currentPlayback.itemId === itemId;');
    expect(appSource).toContain("if (patch.rule && isPlaylistItemRuleLocked(item.id)) return item;");
    expect(appSource).toContain("if (isPlaylistItemRuleLocked(selectedPlaylistItem.id))");
    expect(appSource).toContain("再生中の曲は遷移条件を変更できません。");
    expect(appSource.match(/if \(isPlaylistItemRuleLocked\(item\.id\)\) return item;/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
