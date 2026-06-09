import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("BGM Source action buttons", () => {
  it("asks for confirmation before clearing displayed source files", () => {
    const clearFlow = appSource.slice(appSource.indexOf("async function clearBgmSource"), appSource.indexOf("async function autoLoopSourceTracks"));
    expect(clearFlow).toContain("requestConfirm");
    expect(clearFlow).toContain('title: t("sourceClear")');
    expect(clearFlow).toContain('message: t("sourceClearConfirmMessage")');
    expect(clearFlow).toContain('detail: t("sourceClearConfirmDetail")');
    expect(i18nSource).toContain("Build Sequencerと保存済みListは変更されません。");
  });

  it("allows Auto Loop to rescan selected source cards even when they already have loop markers", () => {
    expect(appSource).not.toContain("selectedSourceAutoLoopTargets");
    expect(appSource).toContain("const canAutoLoopSelectedSource =");
    expect(appSource).toContain("selectedSourceTracks.length > 0");
    expect(appSource).toContain("disabled={!canAutoLoopSelectedSource}");
    expect(appSource).toContain('onAutoLoopSourceTracks(selectedSourceTracks.map((track) => track.id))');
    expect(appSource).toContain("projectRef.current.bgmTracks.filter((track) => targetIdSet.has(track.id))");
  });

  it("queues import-time Auto Loop requests while another scan is already active", () => {
    expect(appSource).toContain("interface DetectionQueueItem");
    expect(appSource).toContain("const detectionActiveRef = useRef(false);");
    expect(appSource).toContain("const detectionQueueRef = useRef<DetectionQueueItem[]>([]);");
    expect(appSource).toContain("function queueDetectionTargets(targets: BgmTrack[], label: string): number");
    expect(appSource).toContain("if (detectionActiveRef.current) {");
    expect(appSource).toContain("detectionQueueRef.current.push({ trackIds, label });");
    expect(appSource).toContain("request = detectionQueueRef.current.shift() ?? null;");
    expect(appSource).toContain('await runDetection(nextTracks, "Auto Loop imported BGM");');
  });

  it("places Auto Loop directly before Source Clear in the source action row", () => {
    const actions = appSource.slice(appSource.indexOf('className="source-zone-actions"'), appSource.indexOf("</section>", appSource.indexOf('className="source-zone-actions"')));
    expect(actions.indexOf('className="thin-button source-auto-loop-button"')).toBeLessThan(actions.indexOf('t("sourceClear")'));
    expect(styleSource).toContain("grid-template-columns: minmax(0, 1fr) auto auto auto;");
  });

  it("removes saved-list referenced tracks from the visible BGM Source without deleting saved list data", () => {
    expect(appSource).toContain("const sourceHiddenTrackIds = useMemo(() => new Set(project.sourceHiddenTrackIds), [project.sourceHiddenTrackIds]);");
    expect(appSource).toContain("!playlistTrackIds.has(track.id) && !sourceHiddenTrackIds.has(track.id)");
    expect(appSource).toContain("const affectedIds = [...result.clearedIds, ...result.skippedReferencedIds];");
    expect(appSource).toContain("保存済みList使用中");
    expect(appSource).toContain("sourceHiddenTrackIds: draft.sourceHiddenTrackIds.filter((trackId) => trackId !== track.id)");
    expect(appSource).toContain("sourceHiddenTrackIds: draft.sourceHiddenTrackIds.filter((id) => !restoredHiddenTrackIds.includes(id))");
  });
});
