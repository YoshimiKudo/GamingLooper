import { describe, expect, it } from "vitest";
import { createDefaultSeAssignments, cycleSeIconId, inferNewSeAssignmentColorId, inferSeColorId, inferSeIconId, seKeys } from "./seIcons.js";

describe("SE key and icon helpers", () => {
  it("keeps a fixed 26-key QWERTY pad", () => {
    expect(seKeys).toHaveLength(26);
    expect(seKeys.slice(0, 10).join("")).toBe("QWERTYUIOP");
    expect(seKeys.slice(10, 19).join("")).toBe("ASDFGHJKL");
    expect(seKeys.slice(19).join("")).toBe("ZXCVBNM");
  });

  it("creates unassigned keys with no icon and no inferred source", () => {
    const assignments = createDefaultSeAssignments();
    expect(assignments.every((assignment) => assignment.file === null)).toBe(true);
    expect(assignments.every((assignment) => assignment.iconId === null)).toBe(true);
    expect(assignments.every((assignment) => assignment.iconSource === "none")).toBe(true);
  });

  it("infers a compact icon category from common file names", () => {
    expect(inferSeIconId("SE_sword_slash_001.wav")).toBe("slash");
    expect(inferSeIconId("ui_alert_beep.wav")).toBe("alert");
    expect(inferSeIconId("unknown_001.wav")).toBe("generic");
  });

  it("cycles icons in both directions", () => {
    expect(cycleSeIconId("generic", 1)).toBe("slash");
    expect(cycleSeIconId("slash", -1)).toBe("generic");
  });

  it("maps star and lightning-style icons to yellow", () => {
    expect(inferSeColorId("spark", "Q")).toBe("yellow");
    expect(inferSeColorId("shock", "W")).toBe("yellow");
  });

  it("randomizes generic assignment colors without changing explicit icon colors", () => {
    expect(inferNewSeAssignmentColorId("generic", "Q", () => 0)).toBe("white");
    expect(inferNewSeAssignmentColorId("generic", "Q", () => 0.5)).toBe("green");
    expect(inferNewSeAssignmentColorId("spark", "Q", () => 0)).toBe("yellow");
  });
});
