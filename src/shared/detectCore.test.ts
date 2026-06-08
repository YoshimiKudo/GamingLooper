import { describe, expect, it } from "vitest";
import type { DetectionSettings } from "./types.js";
import { findBestLoop, findBestLoopDeep, findBestLoopDeepResponsive, findBestLoopResponsive } from "./detectCore.js";

const settings: DetectionSettings = {
  autoDetectOnImport: true,
  mode: "normal",
  matchWindowMs: 120,
  matchThreshold: 55,
  minimumLoopMs: 300,
  loopCheckPrerollMs: 1000
};

describe("responsive loop detection", () => {
  it("matches normal synchronous detection while yielding", async () => {
    const mono = makeLoopedSignal(1800, 480);
    const scheduler = createAlwaysYieldScheduler();

    const sync = findBestLoop(mono, 1000, settings, null);
    const responsive = await findBestLoopResponsive(mono, 1000, settings, null, scheduler);

    expect(responsive).toEqual(sync);
    expect(scheduler.yieldCount).toBeGreaterThan(0);
  });

  it("matches deep synchronous detection while yielding", async () => {
    const mono = makeLoopedSignal(2400, 520);
    const scheduler = createAlwaysYieldScheduler();

    const deepSettings: DetectionSettings = { ...settings, mode: "deep" };
    const sync = findBestLoopDeep(mono, 1000, deepSettings, null);
    const responsive = await findBestLoopDeepResponsive(mono, 1000, deepSettings, null, scheduler);

    expect(responsive).toEqual(sync);
    expect(scheduler.yieldCount).toBeGreaterThan(0);
  });
});

function makeLoopedSignal(length: number, loopLength: number): Float32Array {
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const phase = (i % loopLength) / loopLength;
    mono[i] = Math.sin(phase * Math.PI * 2 * 4) * 0.8 + Math.sin(phase * Math.PI * 2 * 11) * 0.18;
  }
  return mono;
}

function createAlwaysYieldScheduler(): { shouldYield: () => boolean; yield: () => Promise<void>; yieldCount: number } {
  const scheduler = {
    yieldCount: 0,
    shouldYield: () => true,
    yield: async () => {
      scheduler.yieldCount += 1;
    }
  };
  return scheduler;
}
