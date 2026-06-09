import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function ruleBody(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] ?? "";
}

describe("Auto Loop preset descriptions", () => {
  it("renders a selected-preset design intent panel below the segmented control", () => {
    expect(appSource).toContain('const presetDescriptionKey = getDetectionPresetDescriptionKey(settings);');
    expect(appSource).toContain('className="preset-description-row"');
    expect(appSource).toContain('className="preset-description-card"');
    expect(appSource).toContain('{t("presetDesignIntent")}');
    expect(appSource).toContain("{t(presetDescriptionKey)}");
  });

  it("maps every preset state to a user-facing design intent description", () => {
    expect(appSource).toContain('return "vgostPresetDescription";');
    expect(appSource).toContain('return "normalPresetDescription";');
    expect(appSource).toContain('return "deepPresetDescription";');
    expect(appSource).toContain('return "customPresetDescription";');
    expect(i18nSource).toContain('presetDesignIntent: "Design intent"');
    expect(i18nSource).toContain('presetDesignIntent: "設計志向"');
    expect(i18nSource).toContain("VGTDEEP for video game soundtracks");
    expect(i18nSource).toContain("ゲームOST向けのVGTDEEP");
    expect(i18nSource).toContain("Your current manual detection values");
    expect(i18nSource).toContain("現在の手動調整値");
  });

  it("keeps the description aligned with the preset segmented control without overcrowding the segments", () => {
    expect(ruleBody(".preset-description-row")).toContain("grid-template-columns: minmax(96px, 130px) minmax(360px, 1fr)");
    expect(ruleBody(".preset-description-card")).toContain("min-height: 74px");
    expect(ruleBody(".preset-description-card p")).toContain("line-height: 1.55");
    expect(appSource).not.toContain('className="segmented preset-segmented preset-description');
  });
});
