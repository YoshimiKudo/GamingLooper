import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");

describe("playlist play time guard", () => {
  it("allows draft typing and validates Play time only when the input is committed", () => {
    expect(appSource).toContain("const [playTimeDrafts, setPlayTimeDrafts] = useState<Record<string, string>>({});");
    expect(appSource).toContain("function commitPlayTimeDraft(item: PlaylistItem, track: BgmTrack, rawValue: string): void");
    expect(appSource).toContain("formatPlayTimeMinimumStatus(minimumSeconds, language, reason)");
    expect(appSource).toContain('min="1"');
    expect(appSource).toContain("onChange={(event) => updatePlayTimeDraft(item.id, event.target.value)}");
    expect(appSource).toContain("onBlur={(event) => commitPlayTimeDraft(item, track, event.target.value)}");
    expect(appSource).toContain('if (event.key === "Enter" || event.code === "NumpadEnter")');
    expect(appSource).toContain("event.preventDefault();");
    expect(appSource).toContain("event.stopPropagation();");
    expect(appSource).toContain("commitPlayTimeDraft(item, track, event.currentTarget.value);");
    expect(appSource).toContain("if (!canUsePlayTimeSeconds(playTimeSeconds, track, rule))");
    expect(appSource).toContain('function showInvalidPlayTimeWarning(minimumSeconds: number, reason: PlayTimeMinimumReason = "fade"): void');
    expect(appSource).toContain("const message = formatPlayTimeMinimumStatus(minimumSeconds, language, reason);");
    expect(appSource).toContain("alertOnly: true");
    expect(appSource).toContain("onInvalidPlayTime={showInvalidPlayTimeWarning}");
    expect(appSource).toContain("onInvalidPlayTime(minimumSeconds, getPlayTimeMinimumReason(track, rule));");
    expect(appSource).toContain("resetPlayTimeDraft(item.id);");
    expect(appSource).toContain("Play時間はフェードアウトより長く設定してください（最小:");
    expect(appSource).toContain("Play時間はループ開始位置＋フェードアウトより長く設定してください（最小:");
    expect(appSource).not.toContain("builder-field-hint");
    expect(appSource).not.toContain("builder-field-warning");
    expect(appSource).not.toContain("playTimeWarnings");
    expect(appSource).not.toContain("formatPlayTimeMinimumHint");
    expect(i18nSource).toContain('playTimeMustExceedFade: "Play時間はフェードアウトより長く設定してください"');
  });

  it("validates Time mode against the loop marker when Fade changes", () => {
    expect(appSource).toContain("getPlaylistMinimumDurationMs(track, rule)");
    expect(appSource).toContain('type PlayTimeMinimumReason = "fade" | "loop-marker";');
    expect(appSource).toContain("function getPlayTimeMinimumReason(track: BgmTrack, rule: PlaylistRule): PlayTimeMinimumReason");
    expect(appSource).toContain("displayRuleMode === \"duration\" &&");
    expect(appSource).toContain("!canUsePlayTimeSeconds(Math.round(getPlaylistDurationInputMs(track, rule) / 1000), track, nextRule)");
    expect(appSource).toContain("onInvalidPlayTime(getMinimumPlayTimeSeconds(track, nextRule), getPlayTimeMinimumReason(track, nextRule));");
    expect(appSource).toContain('function getBulkPlayTimeViolation(kind: "loop-count" | "duration" | "fade", safeValue: number)');
    expect(appSource).toContain("const playTimeViolation = getBulkPlayTimeViolation(kind, safeValue);");
    expect(appSource).toContain("onInvalidPlayTime(playTimeViolation.minimumSeconds, playTimeViolation.reason);");
  });
});
