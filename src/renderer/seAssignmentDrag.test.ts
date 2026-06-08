import { describe, expect, it } from "vitest";
import { shouldCopySeAssignmentDrag } from "./seAssignmentDrag.js";

describe("SE assignment drag modifiers", () => {
  it("keeps copy mode when Shift was held before the drag started", () => {
    expect(
      shouldCopySeAssignmentDrag({
        eventShiftKey: false,
        nativeShiftKey: false,
        dragStartShift: true,
        shiftPressed: false
      })
    ).toBe(true);
  });

  it("keeps copy mode from the drag payload even if Shift is released before drop", () => {
    expect(
      shouldCopySeAssignmentDrag({
        eventShiftKey: false,
        nativeShiftKey: false,
        dragCopy: false,
        dragStartShift: false,
        shiftPressed: false,
        payloadCopy: true
      })
    ).toBe(true);
  });

  it("uses move mode when no Shift state was captured", () => {
    expect(
      shouldCopySeAssignmentDrag({
        eventShiftKey: false,
        nativeShiftKey: false,
        dragCopy: false,
        dragStartShift: false,
        shiftPressed: false,
        payloadCopy: false
      })
    ).toBe(false);
  });
});
