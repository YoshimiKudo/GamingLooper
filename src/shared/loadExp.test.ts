import { describe, expect, it } from "vitest";
import {
  calculateListBuildExpAward,
  calculateLoadExpOverflowStepBonus,
  calculateLoadExpOverflowTotalBonus,
  calculateSePlaybackExpAward,
  listRegistrationExpAward,
  loadExpOverflowBonusMax,
  sePlaybackMajorExpAward
} from "./loadExp.js";

describe("LOAD EXP overflow bonus", () => {
  it("calculates each overflow bonus step with the requested exponential formula", () => {
    expect(calculateLoadExpOverflowStepBonus(1)).toBe(1);
    expect(calculateLoadExpOverflowStepBonus(2)).toBe(1.5);
    expect(calculateLoadExpOverflowStepBonus(3)).toBe(2.25);
    expect(calculateLoadExpOverflowStepBonus(4)).toBe(3.375);
    expect(calculateLoadExpOverflowStepBonus(5)).toBe(5.0625);
  });

  it("returns the cumulative upper-limit bonus by adding each overflow step", () => {
    expect(calculateLoadExpOverflowTotalBonus(1)).toBe(1);
    expect(calculateLoadExpOverflowTotalBonus(2)).toBe(2.5);
    expect(calculateLoadExpOverflowTotalBonus(3)).toBe(4.7);
    expect(calculateLoadExpOverflowTotalBonus(4)).toBe(8.1);
    expect(calculateLoadExpOverflowTotalBonus(5)).toBe(13.1);
  });

  it("caps very high overflow counts at the extreme gaming-ness ceiling", () => {
    expect(calculateLoadExpOverflowTotalBonus(0x203b)).toBe(loadExpOverflowBonusMax);
  });
});

describe("List Build EXP award", () => {
  it("uses the requested duration bracket award", () => {
    expect(calculateListBuildExpAward(29 * 60 * 1000)).toBe(0);
    expect(calculateListBuildExpAward(30 * 60 * 1000)).toBe(50);
    expect(calculateListBuildExpAward(60 * 60 * 1000)).toBe(25);
    expect(calculateListBuildExpAward(90 * 60 * 1000)).toBe(12);
    expect(calculateListBuildExpAward(179 * 60 * 1000)).toBe(12);
    expect(calculateListBuildExpAward(180 * 60 * 1000)).toBe(7);
  });

  it("keeps a fixed EXP bonus for each list registration", () => {
    expect(listRegistrationExpAward).toBe(5);
  });
});

describe("SE Pad playback EXP award", () => {
  it("returns the major award on the 1/64 range", () => {
    expect(calculateSePlaybackExpAward(0, 0.5)).toBe(sePlaybackMajorExpAward);
  });

  it("returns 1 to 8 EXP on the 1/16 minor range", () => {
    expect(calculateSePlaybackExpAward(1 / 64, 0)).toBe(1);
    expect(calculateSePlaybackExpAward(1 / 64 + 1 / 32, 0.999)).toBe(8);
  });

  it("returns no award outside the configured chance ranges", () => {
    expect(calculateSePlaybackExpAward(1 / 64 + 1 / 16, 0)).toBe(0);
  });
});
