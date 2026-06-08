import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sePadSource = readFileSync(new URL("./components/SePad.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function ruleBody(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] ?? "";
}

describe("SE Pad interaction spec", () => {
  it("uses assigned-key right click for per-key stop", () => {
    expect(sePadSource).toContain("onStopKey: (key: SeKey) => void;");
    expect(sePadSource).toContain("function stopKeyFromContext");
    expect(sePadSource).toContain("event.preventDefault();\n    event.stopPropagation();\n    if (!assigned) return;");
    expect(sePadSource).toContain("onStopKey(key);");
    expect(appSource).toContain("function stopSe(key: SeKey): void");
    expect(appSource).toContain("audioRef.current.stopSeByPlaybackKey(key)");
    expect(appSource).toContain("onStopSe={handleStopSe}");
    expect(appSource).toContain("onStopKey={onStopSe}");
  });

  it("uses icon stepper right click as the icon menu entry and keeps red lamp right click inert", () => {
    expect(sePadSource).toContain("function openIconMenu");
    expect(sePadSource).toContain("const position = clampOverlayPosition(event.clientX, event.clientY, ICON_MENU_WIDTH_PX, ICON_MENU_HEIGHT_PX);");
    expect(sePadSource).toContain("setSettingsPopup(null);");
    expect(sePadSource).toContain("setIconMenu({ key, x: position.x, y: position.y });");
    expect(sePadSource).toContain("onContextMenu={(event) => {\n                      stopKeyFromContext(key, assigned, event);");
    expect(sePadSource).toContain("onContextMenu={(event) => {\n                          event.preventDefault();\n                          event.stopPropagation();\n                        }}");
    expect(sePadSource).toContain("onContextMenu={(event) => {\n                              openIconMenu(key, event);\n                            }}");
  });

  it("keeps the red lamp as the settings entry without making it a drag source", () => {
    expect(sePadSource).toContain('className={`assign-lamp ${assigned ? "lit" : ""}`}');
    expect(sePadSource).toContain("draggable={false}");
    expect(sePadSource).toContain("onPointerDown={stopNestedControlPointer}");
    expect(sePadSource).toContain("onMouseDown={stopNestedControlPointer}");
    expect(sePadSource).toContain("onDragStart={cancelNestedControlDrag}");
    expect(sePadSource).toContain("const position = getSettingsPopoverPosition(event.currentTarget);");
    expect(sePadSource).toContain("setIconMenu(null);\n                          setSettingsPopup({ key, x: position.x, y: position.y });");
    expect(sePadSource).not.toContain('window.alert("TEST")');
    expect(sePadSource).toContain("左クリックでVolume、PAN、割り当てSEを編集");
    expect(sePadSource).toContain("Left-click to edit volume, PAN, or assigned SE file.");
    expect(sePadSource).toContain("Right-click stops this key.");
  });

  it("puts close and unload controls in the SE settings popover", () => {
    expect(sePadSource).toContain('className="se-settings-close"');
    expect(sePadSource).toContain("onClose={() => setSettingsPopup(null)}");
    expect(sePadSource).toContain("onUnload={(key) => {\n                setSettingsPopup(null);\n                onUnload(key);\n              }}");
    expect(sePadSource).toContain('className="se-settings-actions"');
    expect(sePadSource).toContain('className="thin-button se-unload-button"');
    expect(sePadSource).toContain("disabled={!assignment?.file}");
    expect(ruleBody(".se-settings-close")).toContain("right: 8px");
    expect(ruleBody(".se-settings-close")).toContain("top: 8px");
    expect(ruleBody(".se-settings-head")).toContain("padding-right: 28px");
    expect(ruleBody(".se-settings-actions")).toContain("grid-template-columns: 1fr 1fr");
  });

  it("renders SE Pad overlays outside contained panels and clamps them to the viewport", () => {
    expect(sePadSource).toContain('import { createPortal } from "react-dom";');
    expect(sePadSource).toContain("getSePadOverlayRoot()");
    expect(sePadSource).toContain('document.querySelector(".app") ?? document.body');
    expect(sePadSource).toContain("function clampOverlayPosition");
    expect(sePadSource).toContain("viewportWidth - width - OVERLAY_MARGIN_PX");
    expect(sePadSource).toContain("viewportHeight - height - OVERLAY_MARGIN_PX");
    expect(ruleBody(".se-settings-popover")).toContain("max-height: calc(100vh - 16px)");
    expect(ruleBody(".se-settings-popover")).toContain("overflow: auto");
    expect(ruleBody(".se-settings-popover")).not.toContain("transform");
  });

  it("offers a Main View shortcut from SE Pad to edit the SE Set", () => {
    expect(sePadSource).toContain("onEditSeSet?: () => void;");
    expect(sePadSource).toContain('className="thin-button se-edit-set-button"');
    expect(sePadSource).toContain("EDIT SE SET");
    expect(ruleBody(".se-edit-set-button")).toContain("position: absolute");
    expect(ruleBody(".se-edit-set-button")).toContain("right: 8px");
    expect(ruleBody(".se-edit-set-button")).toContain("bottom: 8px");
  });

  it("lets assignment drag start from the visible full-key hit area", () => {
    expect(sePadSource).toContain('className="key-hit-area"');
    expect(sePadSource).toContain("draggable={assigned && Boolean(onTransferAssignment)}");
    expect(sePadSource).toContain("onPointerDownCapture={captureAssignmentDragModifiers}");
    expect(sePadSource).toContain("onMouseDownCapture={captureAssignmentDragModifiers}");
    expect(sePadSource).toContain("event.stopPropagation();\n                        beginAssignmentDrag(key, assigned, event);");
    expect(sePadSource).not.toMatch(/data-assigned=\{assigned \? "true" : "false"\}\s+draggable=\{assigned && Boolean\(onTransferAssignment\)\}/);
    expect(sePadSource).not.toMatch(/data-assigned=\{assigned \? "true" : "false"\}[\s\S]*?onDragStart=\{\(event\) => beginAssignmentDrag\(key, assigned, event\)\}[\s\S]*?<button\s+className="key-hit-area"/);
    expect(styles).toContain('.key-hit-area[draggable="true"]');
    expect(sePadSource).toContain("const shiftAtDragStart = isShiftModifierActive(event) || dragStartShiftRef.current || shiftPressedRef.current;");
  });

  it("makes the red lamp hit target large enough to confirm the clickable spec", () => {
    const lampRule = ruleBody(".assign-lamp");
    expect(lampRule).toContain("width: 14px");
    expect(lampRule).toContain("height: 14px");
    expect(ruleBody(".assign-lamp::before")).toContain("width: 6.4px");
    expect(ruleBody(".assign-lamp::before")).toContain("height: 6.4px");
  });

  it("reserves enough Main View height for SE Pad hit testing", () => {
    const stackRule = ruleBody(".main-right-stack");
    expect(stackRule).toContain("--main-se-pad-min: 220px");
    expect(stackRule).toContain("calc(100% - 8px - var(--main-se-pad-min))");
    expect(stackRule).toContain("minmax(var(--main-se-pad-min), 1fr)");
    expect(ruleBody(".main-right-stack > .se-panel")).toContain("min-height: var(--main-se-pad-min)");
    expect(styles).toContain("@media (max-height: 760px)");
    expect(styles).toContain("--main-se-pad-min: 220px");
    expect(styles).toContain("--se-key-h: clamp(44px, calc((100cqh - 30px) / 3), 50px)");
    expect(styles).toContain("min(var(--analyzer-pane, 156px), 116px)");
  });

  it("keeps a localhost-only assigned-key probe for browser verification", () => {
    expect(appSource).toContain("function isSePadProbeMode");
    expect(appSource).toContain('new URLSearchParams(window.location.search).has("sepad-probe")');
    expect(appSource).toContain("createSePadProbeProject()");
    expect(appSource).toContain("SE Pad Probe.wav");
  });
});
