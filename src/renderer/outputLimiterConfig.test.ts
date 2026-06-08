import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const audioEngineSource = readFileSync(new URL("./audio/AudioEngine.ts", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("0dB output limiter config", () => {
  it("normalizes old projects to limiter enabled unless explicitly disabled", () => {
    expect(appSource).toContain("function sanitizeMixSettings");
    expect(appSource).toContain("outputLimiterEnabled: settings?.outputLimiterEnabled === false ? false : true");
  });

  it("routes the final master output through a fixed limiter when enabled", () => {
    expect(audioEngineSource).toContain("this.context.createDynamicsCompressor()");
    expect(audioEngineSource).toContain("configureOutputLimiter(this.outputLimiter)");
    expect(audioEngineSource).toContain("this.updateOutputLimiterRouting(settings.outputLimiterEnabled !== false)");
    expect(audioEngineSource).toContain("this.masterGain.connect(this.outputLimiter)");
    expect(audioEngineSource).toContain("limiter.threshold.value = -1");
    expect(audioEngineSource).toContain("limiter.ratio.value = 20");
  });

  it("exposes only an on/off switch in the Mix UI", () => {
    expect(appSource).toContain('t("outputLimiter")');
    expect(appSource).toContain('className="limiter-checkbox-tooltip config-tooltip-anchor"');
    expect(appSource).toContain('data-config-tooltip={t("outputLimiterCopy")}');
    expect(appSource).toContain("project.mix.outputLimiterEnabled");
    expect(appSource).toContain("outputLimiterEnabled: event.target.checked");
    expect(i18nSource).toContain('outputLimiter: "Limiter"');
    expect(appSource).not.toContain('<small>{t("outputLimiterCopy")}</small>');
    expect(appSource).not.toContain("limiterThreshold");
    expect(appSource).not.toContain("limiterRatio");
  });

  it("aligns the Limiter tooltip to the right of the checkbox", () => {
    expect(styleSource).toContain(".limiter-checkbox-tooltip.config-tooltip-anchor::after");
    expect(styleSource).toContain(".output-limiter-toggle:hover .limiter-checkbox-tooltip.config-tooltip-anchor::after");
    expect(styleSource).toContain("left: calc(100% + 10px);");
    expect(styleSource).toContain("top: 50%;");
    expect(styleSource).toContain("bottom: auto;");
    expect(styleSource).toContain("transform: translate(0, -50%);");
  });
});
