import { describe, expect, it } from "vitest";
import { createPositionStore } from "./positionStore.js";
import { applyWaveformPlayheadPosition, getWaveformPlayheadX } from "./waveformPlayhead.js";

describe("Waveform playhead", () => {
  it("maps playback time to SVG coordinates", () => {
    expect(getWaveformPlayheadX(0, 1000)).toBe(0);
    expect(getWaveformPlayheadX(500, 1000)).toBe(600);
    expect(getWaveformPlayheadX(1500, 1000)).toBe(1200);
    expect(getWaveformPlayheadX(-100, 1000)).toBe(0);
  });

  it("updates SVG line coordinates from a shared position store subscription", () => {
    const attributes = new Map<string, string>();
    const node = {
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      }
    };
    const store = createPositionStore(0);
    const unsubscribe = store.subscribe(() => applyWaveformPlayheadPosition(node, store.getSnapshot(), 2000));

    applyWaveformPlayheadPosition(node, store.getSnapshot(), 2000);
    expect(attributes.get("x1")).toBe("0");
    expect(attributes.get("x2")).toBe("0");

    store.set(500);
    expect(attributes.get("x1")).toBe("300");
    expect(attributes.get("x2")).toBe("300");

    unsubscribe();
    store.set(1000);
    expect(attributes.get("x1")).toBe("300");
  });
});
