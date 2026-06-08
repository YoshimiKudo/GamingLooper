export const SE_ASSIGNMENT_DRAG_TYPE = "application/x-gaminglooper-se-assignment";
export const SE_ASSIGNMENT_DRAG_COPY_TYPE = "application/x-gaminglooper-se-assignment-copy";

export interface SeAssignmentDragState {
  eventShiftKey?: boolean;
  nativeShiftKey?: boolean;
  dragCopy?: boolean;
  dragStartShift?: boolean;
  shiftPressed?: boolean;
  payloadCopy?: boolean;
}

export function shouldCopySeAssignmentDrag({
  eventShiftKey,
  nativeShiftKey,
  dragCopy,
  dragStartShift,
  shiftPressed,
  payloadCopy
}: SeAssignmentDragState): boolean {
  return Boolean(eventShiftKey || nativeShiftKey || dragCopy || dragStartShift || shiftPressed || payloadCopy);
}
