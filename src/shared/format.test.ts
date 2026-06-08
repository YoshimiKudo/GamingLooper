import { describe, expect, it } from "vitest";
import { formatTimeSeconds, roundDownToSecondMs } from "./format.js";

describe("time display helpers", () => {
  it("rounds real-time display values down to whole seconds", () => {
    expect(roundDownToSecondMs(45_566)).toBe(45_000);
    expect(roundDownToSecondMs(170_300)).toBe(170_000);
  });

  it("formats display times without milliseconds", () => {
    expect(formatTimeSeconds(45_566)).toBe("00:45");
    expect(formatTimeSeconds(170_300)).toBe("02:50");
  });
});
