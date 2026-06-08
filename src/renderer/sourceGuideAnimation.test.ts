import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

function ruleBody(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] ?? "";
}

function ruleBodies(selector: string): string[] {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(styles.matchAll(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, "g"))).map((match) => match[1]);
}

function keyframeBody(name: string): string {
  const start = styles.indexOf(`@keyframes ${name}`);
  if (start < 0) return "";
  const bodyStart = styles.indexOf("{", start);
  if (bodyStart < 0) return "";
  let depth = 0;
  for (let index = bodyStart; index < styles.length; index += 1) {
    const char = styles[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return styles.slice(bodyStart + 1, index);
  }
  return "";
}

function opacityKeyframes(name: string): Array<{ percent: number; opacity: number }> {
  const body = keyframeBody(name);
  const entries: Array<{ percent: number; opacity: number }> = [];
  for (const match of body.matchAll(/([0-9%,\s]+)\s*\{([^}]*)\}/g)) {
    const opacityMatch = match[2].match(/opacity:\s*(\d+(?:\.\d+)?)/);
    if (!opacityMatch) continue;
    const opacity = Number(opacityMatch[1]);
    for (const percentText of match[1].split(",")) {
      const percent = Number(percentText.trim().replace("%", ""));
      if (Number.isFinite(percent)) entries.push({ percent, opacity });
    }
  }
  return entries.sort((a, b) => a.percent - b.percent);
}

function opacityAtPercent(points: Array<{ percent: number; opacity: number }>, percent: number): number {
  const exact = points.find((point) => point.percent === percent);
  if (exact) return exact.opacity;
  const previous = [...points].reverse().find((point) => point.percent < percent) ?? points[0];
  const next = points.find((point) => point.percent > percent) ?? points[points.length - 1];
  if (!previous || !next || previous.percent === next.percent) return previous?.opacity ?? 0;
  const progress = (percent - previous.percent) / (next.percent - previous.percent);
  return previous.opacity + (next.opacity - previous.opacity) * progress;
}

function peakPercent(name: string): number {
  const points = opacityKeyframes(name);
  return points.reduce((peak, point) => (point.opacity > peak.opacity ? point : peak), points[0]).percent;
}

const chevrons = [
  { className: "source-guide-chevron-right", keyframes: "source-guide-chevron-right" },
  { className: "source-guide-chevron-middle", keyframes: "source-guide-chevron-middle" },
  { className: "source-guide-chevron-left", keyframes: "source-guide-chevron-left" },
];

describe("Sequence Builder source guide animation", () => {
  it("renders the guide as active only when BGM Source has a selected add target", () => {
    expect(appSource).toContain('source-to-sequence-guide ${hasSelectedSourceForAdd ? "active" : "idle"}');
    expect(appSource).toContain('tabIndex={hasSelectedSourceForAdd ? 0 : -1}');
    expect(appSource).toContain('className="source-guide-chevron-left"');
    expect(appSource).toContain('className="source-guide-chevron-middle"');
    expect(appSource).toContain('className="source-guide-chevron-right"');

    const leftIndex = appSource.indexOf('className="source-guide-chevron-left"');
    const middleIndex = appSource.indexOf('className="source-guide-chevron-middle"');
    const rightIndex = appSource.indexOf('className="source-guide-chevron-right"');
    expect(leftIndex).toBeGreaterThanOrEqual(0);
    expect(leftIndex).toBeLessThan(middleIndex);
    expect(middleIndex).toBeLessThan(rightIndex);
  });

  it("keeps the idle chevrons static and reduced", () => {
    expect(ruleBodies(".source-guide-chevrons span").some((body) => body.includes("animation: none"))).toBe(true);
    expect(ruleBodies(".source-guide-chevrons span").some((body) => body.includes("scale(0.64, 1.08)"))).toBe(true);
  });

  it("centers the middle chevron on the divider with a compact 3-column grid", () => {
    expect(ruleBody(".source-to-sequence-guide.active .source-guide-chevrons")).toContain("width: 42px");
    expect(ruleBody(".source-to-sequence-guide.active .source-guide-chevrons")).toContain("grid-template-columns: repeat(3, 14px)");
  });

  it("does not rely on source-guide animation-delay or the old shared pulse keyframes", () => {
    expect(styles).not.toContain("source-guide-chevron-pulse");
    const sourceGuideDelayRules = Array.from(styles.matchAll(/\.source-(?:guide|to-sequence-guide)[^{]*\{[^}]*animation-delay\s*:/g));
    expect(sourceGuideDelayRules).toEqual([]);
    const sourceGuideRules = Array.from(styles.matchAll(/\.source-(?:guide|to-sequence-guide)[^{]*\{([^}]*)\}/g)).map((match) => match[1]).join("\n");
    const sourceGuideAnimationShorthands = Array.from(sourceGuideRules.matchAll(/(^|[\s;])animation\s*:\s*([^;]+);/g)).map((match) => match[2].trim());
    expect(sourceGuideAnimationShorthands.length).toBeGreaterThan(0);
    expect(sourceGuideAnimationShorthands.every((value) => value === "none")).toBe(true);

    const activeRule = ruleBody(".source-to-sequence-guide.active .source-guide-chevrons span");
    expect(activeRule).toContain("animation-duration: 1.55s");
    expect(activeRule).toContain("animation-timing-function: linear");
    expect(activeRule).toContain("animation-iteration-count: infinite");
    expect(activeRule).toContain("animation-fill-mode: both");
    expect(activeRule).toContain("will-change: transform, opacity, filter");
  });

  it("uses separate baked-phase keyframes so the peaks move right to left", () => {
    for (const chevron of chevrons) {
      expect(ruleBody(`.source-to-sequence-guide.active .${chevron.className}`)).toContain(`animation-name: ${chevron.keyframes}`);
      expect(keyframeBody(chevron.keyframes)).toContain("scale(0.98, 1.54)");
    }

    const rightPeak = peakPercent("source-guide-chevron-right");
    const middlePeak = peakPercent("source-guide-chevron-middle");
    const leftPeak = peakPercent("source-guide-chevron-left");

    expect(rightPeak).toBeLessThan(middlePeak);
    expect(middlePeak).toBeLessThan(leftPeak);
    expect(rightPeak).toBe(20);
    expect(middlePeak).toBe(34);
    expect(leftPeak).toBe(48);
    expect(middlePeak - rightPeak).toBeGreaterThanOrEqual(12);
    expect(middlePeak - rightPeak).toBeLessThanOrEqual(16);
    expect(leftPeak - middlePeak).toBeGreaterThanOrEqual(12);
    expect(leftPeak - middlePeak).toBeLessThanOrEqual(16);

    const rightMiddleBridge = (rightPeak + middlePeak) / 2;
    expect(opacityAtPercent(opacityKeyframes("source-guide-chevron-right"), rightMiddleBridge)).toBeGreaterThan(0.6);
    expect(opacityAtPercent(opacityKeyframes("source-guide-chevron-middle"), rightMiddleBridge)).toBeGreaterThan(0.6);

    const middleLeftBridge = (middlePeak + leftPeak) / 2;
    expect(opacityAtPercent(opacityKeyframes("source-guide-chevron-middle"), middleLeftBridge)).toBeGreaterThan(0.6);
    expect(opacityAtPercent(opacityKeyframes("source-guide-chevron-left"), middleLeftBridge)).toBeGreaterThan(0.6);
  });

  it("uses vertical emphasis without disappearing for long gaps", () => {
    expect(ruleBody(".source-to-sequence-guide.active .source-guide-chevrons span")).toContain("opacity: 0.3");
    for (const chevron of chevrons) {
      const points = opacityKeyframes(chevron.keyframes);
      expect(Math.min(...points.map((point) => point.opacity))).toBeGreaterThanOrEqual(0.38);
      expect(keyframeBody(chevron.keyframes)).not.toContain("scale(1.22, 1.42)");
      expect(keyframeBody(chevron.keyframes)).not.toContain("opacity: 0.18");
    }
  });
});
