import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const waveformSource = readFileSync(new URL("./components/WaveformView.tsx", import.meta.url), "utf8");
const analyzerSource = readFileSync(new URL("./components/AnalyzerPanel.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("waveform playhead gamingness styling", () => {
  it("exports stronger playhead glow variables from Gaming-ness visual values", () => {
    expect(appSource).toContain("const legacyPlayheadCapValue =");
    expect(appSource).toContain("const extendedPlayheadProgress =");
    expect(appSource).toContain("const extendedPlayheadMultiplier = 1 + extendedPlayheadProgress");
    expect(appSource).toContain("const playheadGlowScale = clampUnit(value / baseGamingnessMax);");
    expect(appSource).toContain("const playheadIntensity =");
    expect(appSource).toContain("const playheadGlowAlpha =");
    expect(appSource).toContain("const playheadAuraAlpha =");
    expect(appSource).toContain("* playheadGlowScale");
    expect(appSource).toContain("const playheadGlowSpread =");
    expect(appSource).toContain("const playheadAuraWidth =");
    expect(appSource).toContain("const playheadAuraBlur =");
    expect(appSource).toContain("const playheadCoreWidth =");
    expect(appSource).toContain("const playheadAxisAlpha =");
    expect(appSource).toContain("const playheadAxisWidth =");
    expect(appSource).toContain("\"--playhead-glow-alpha\"");
    expect(appSource).toContain("\"--playhead-glow-spread\"");
    expect(appSource).toContain("\"--playhead-aura-alpha\"");
    expect(appSource).toContain("\"--playhead-aura-width\"");
    expect(appSource).toContain("\"--playhead-aura-blur\"");
    expect(appSource).toContain("\"--playhead-core-width\"");
    expect(appSource).toContain("\"--playhead-axis-alpha\"");
    expect(appSource).toContain("\"--playhead-axis-width\"");
    expect(appSource).toContain("\"--waveform-breathe-alpha\"");
    expect(appSource).toContain("\"--waveform-breathe-glow\"");
    expect(appSource).toContain("\"--waveform-breathe-state\"");
  });

  it("renders the playhead as a core line with diffuse aura and a center axis", () => {
    expect(waveformSource).toContain("className=\"playhead-stack\"");
    expect(waveformSource).toContain("className=\"playhead-aura playhead-aura-outer\"");
    expect(waveformSource).toContain("className=\"playhead-aura playhead-aura-inner\"");
    expect(waveformSource).toContain("className=\"playhead\"");
    expect(waveformSource).toContain("className=\"playhead-axis\"");
    expect(waveformSource).toContain("applyWaveformPlayheadPosition(outerAura, current, durationMs)");
    expect(waveformSource).toContain("applyWaveformPlayheadPosition(aura, current, durationMs)");
    expect(waveformSource).toContain("applyWaveformPlayheadPosition(node, current, durationMs)");
    expect(waveformSource).toContain("applyWaveformPlayheadPosition(axis, current, durationMs)");
  });

  it("cycles the playhead and aura through gaming colors", () => {
    expect(styleSource).toContain("animation: playhead-gaming-color-cycle 352s linear infinite;");
    expect(styleSource).toContain("animation: playhead-aura-color-cycle 5.6s linear infinite;");
    expect(styleSource).toContain("@keyframes playhead-gaming-color-cycle");
    expect(styleSource).toContain("@keyframes playhead-aura-color-cycle");
    expect(styleSource).toContain("#ff5b5b");
    expect(styleSource).toContain("#ffb058");
    expect(styleSource).toContain("#ffea5c");
    expect(styleSource).toContain("#8fff64");
    expect(styleSource).toContain("#62fff3");
    expect(styleSource).toContain("#73bdff");
    expect(styleSource).toContain("#eb6dff");
  });

  it("adds a low-cost waveform breathe glow above Gaming-ness 100", () => {
    expect(appSource).toContain("const gamingnessEffectMaxValue = 240;");
    expect(appSource).toContain("const gamingnessEffectStrength = getGamingnessEffectStrength(effectiveGamingness);");
    expect(appSource).toContain("function getGamingnessEffectStrength(value: number): number");
    expect(appSource).toContain("if (value < baseGamingnessMax) return 0;");
    expect(appSource).toContain("return 0.1 + progress * 0.9;");
    expect(appSource).toContain("const waveformBreatheMaxAlpha = 0.58;");
    expect(appSource).toContain("const waveformBreatheMaxGlow = 42;");
    expect(waveformSource).toContain("waveformGlowActive={showPlayhead}");
    expect(waveformSource).toContain("className={`wave-path-glow ${waveformGlowActive ? \"active\" : \"\"}`}");
    expect(waveformSource).toContain("className={`wave-path ${waveformGlowActive ? \"active\" : \"\"}`}");
    expect(waveformSource).toContain("className={`wave-path-color ${waveformGlowActive ? \"active\" : \"\"}`}");
    expect(waveformSource).toContain("waveColorGradientId");
    expect(styleSource).toContain(".wave-path-glow");
    expect(styleSource).toContain(".wave-path-glow.active");
    expect(styleSource).toContain(".wave-path-color");
    expect(styleSource).toContain(".wave-path-color.active");
    expect(styleSource).toContain(".wave-path.active");
    expect(styleSource).toContain("animation: waveform-gaming-breathe 3.8s ease-in-out infinite;");
    expect(styleSource).toContain("animation: waveform-gaming-color-drift 13.5s ease-in-out infinite;");
    expect(styleSource).toContain("waveform-gaming-color-pulse 3.8s ease-in-out infinite");
    expect(styleSource).toContain("animation: none;");
    expect(styleSource).toContain("animation-play-state: var(--waveform-breathe-state, paused);");
    expect(styleSource).toContain("@keyframes waveform-gaming-breathe");
    expect(styleSource).toContain("@keyframes waveform-gaming-color-drift");
    expect(styleSource).toContain("@keyframes waveform-gaming-color-pulse");
  });

  it("shares the same Gaming-ness expression strength with the analyzer", () => {
    expect(appSource).toContain("gamingnessEffectStrength={gamingnessEffectStrength}");
    expect(analyzerSource).toContain("gamingnessEffectStrength: number;");
    expect(analyzerSource).toContain("gamingnessEffectStrength,");
    expect(analyzerSource).toContain("const gamingness = clamp(gamingnessEffectStrength, 0, 1);");
    expect(analyzerSource).toContain("const gamingnessPulse = gamingness > 0 ? gamingness * (0.78 + Math.sin(now / 520) * 0.22) : 0;");
    expect(analyzerSource).toContain("ctx.shadowColor = `hsla(${hue}, 96%, 66%, ${0.1 + gamingnessPulse * 0.26})`;");
  });

  it("uses only Gaming-ness glow on the playhead without a dark outline", () => {
    expect(styleSource).toContain("var(--playhead-glow-alpha");
    expect(styleSource).toContain("var(--playhead-glow-spread");
    expect(styleSource).toContain("var(--playhead-aura-alpha");
    expect(styleSource).toContain("var(--playhead-aura-width");
    expect(styleSource).toContain("var(--playhead-aura-blur");
    expect(styleSource).toContain("var(--playhead-core-width");
    expect(styleSource).toContain("var(--playhead-axis-alpha");
    expect(styleSource).toContain("var(--playhead-axis-width");
    expect(styleSource).toContain(".playhead-aura-outer");
    expect(styleSource).toContain(".playhead-aura-inner");
    expect(styleSource).toContain(".playhead-axis");
    expect(styleSource).toContain("stroke-linecap: butt;");
    expect(styleSource).toContain(".app.potato-mode");
    expect(styleSource).toContain("--playhead-aura-alpha: 0 !important;");
    expect(styleSource).toContain("--waveform-breathe-state: paused !important;");
    expect(styleSource).not.toContain("drop-shadow(0 0 2px rgba(0, 0, 0, 0.85))");
  });
});
