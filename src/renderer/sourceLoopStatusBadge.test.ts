import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");

describe("BGM Source loop status badge", () => {
  it("shows looped or non-looped status on normal source cards", () => {
    expect(appSource).toContain('source-scan-badge loop-status');
    expect(appSource).toContain('track.loop ? t("looped") : t("nonLooped")');
    expect(appSource).toContain("!isScanningTrack && !isWaitingTrack");
    expect(i18nSource).toContain('looped: "Looped"');
    expect(i18nSource).toContain('nonLooped: "Non Looped"');
  });

  it("uses the scan badge shape while preserving room for the badge", () => {
    expect(styleSource).toContain(".source-track-row .source-scan-badge.loop-status.looped");
    expect(styleSource).toContain(".source-track-row .source-scan-badge.loop-status.non-looped");
    expect(styleSource).toContain("padding: 9px 118px 9px 10px;");
  });
});
