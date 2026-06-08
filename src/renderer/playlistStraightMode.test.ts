import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const typeSource = readFileSync(new URL("../shared/types.ts", import.meta.url), "utf8");
const timingSource = readFileSync(new URL("../shared/playlistTiming.ts", import.meta.url), "utf8");

describe("playlist Straight mode", () => {
  it("stores Straight as a first-class playlist rule", () => {
    expect(typeSource).toContain('| { mode: "straight"; fadeOutMs: number; durationMs?: number; loopCount?: number }');
    expect(appSource).toContain('mode === "straight"');
    expect(appSource).toContain('return { mode: "straight", fadeOutMs, durationMs, loopCount };');
  });

  it("ignores loop playback only for Straight rows", () => {
    expect(timingSource).toContain('if (!track.loop || rule.mode === "straight")');
    expect(timingSource).toContain('if (!track.loop || rule.mode === "straight") return 0;');
    expect(appSource).toContain('function shouldLoopPlaylistPlayback(track: BgmTrack, rule: PlaylistRule): track is BgmTrack & { loop: NonNullable<BgmTrack["loop"]> }');
    expect(appSource).toContain('return Boolean(track.loop && rule.mode !== "straight");');
    expect(appSource).toContain("await audioRef.current.playBgm(track, { loop: shouldLoopPlaylistPlayback(track, item.rule), offsetMs: audioOffsetMs });");
    expect(appSource).toContain("if (!shouldLoopPlaylistPlayback(track, rule)) return Math.max(0, Math.min(track.durationMs, safeElapsedMs));");
  });

  it("uses a fixed-center mode stepper with disabled edge arrows", () => {
    expect(appSource).toContain("const playlistRuleModeOrder");
    expect(appSource).toContain('["loop-count", "duration", "straight"]');
    expect(appSource).toContain('const displayRuleMode: PlaylistRule["mode"] = canUseLoopRules ? rule.mode : "straight";');
    expect(appSource).toContain("className=\"rule-mode-stepper rule-tooltip-anchor\"");
    expect(appSource).toContain("disabled={ruleControlsDisabled || !previousRuleMode}");
    expect(appSource).toContain("disabled={ruleControlsDisabled || !nextRuleMode}");
    expect(appSource).toContain("className={`rule-mode-current mode-${displayRuleMode}`}");
    expect(styleSource).toContain(".rule-mode-stepper {");
    expect(styleSource).toContain("height: 26px;");
    expect(styleSource).toContain("grid-template-columns: 28px minmax(0, 1fr) 28px;");
    expect(styleSource).toContain(".rule-mode-arrow:disabled");
    expect(styleSource).toContain(".rule-mode-current {");
    expect(styleSource).toContain("font-size: inherit;");
    expect(styleSource).toContain(".rule-locked {\n  width: 100%;\n  height: 26px;");
    expect(styleSource).toContain(".app.big-font-mode .rule-mode-stepper {\n  height: 36px;");
  });

  it("shows Straight duration and disables fade editing for Straight rows", () => {
    expect(appSource).toContain('className="builder-field builder-straight-field"');
    expect(appSource).toContain('className="builder-straight-value"');
    expect(appSource).toContain('displayRuleMode === "straight"');
    expect(appSource).toContain("formatTimeSeconds(track.durationMs)");
    expect(appSource).toContain('disabled={!canUseLoopRules || displayRuleMode === "straight" || ruleControlsDisabled}');
    expect(styleSource).toContain("color: rgba(180, 169, 158, 0.44);");
    expect(styleSource).toContain("cursor: not-allowed;");
    expect(styleSource).toContain(".app.big-font-mode .builder-straight-value {\n  height: 36px;");
  });
});
