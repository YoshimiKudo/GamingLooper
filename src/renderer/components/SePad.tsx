import type { SeAssignment, SeIconId, SeKey, UiLanguage } from "../../shared/types.js";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  WheelEvent as ReactWheelEvent
} from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileMusic, X } from "lucide-react";
import { compactFileName, seIconIds, seKeyRows, seKeys } from "../../shared/seIcons.js";
import { SE_ASSIGNMENT_DRAG_COPY_TYPE, SE_ASSIGNMENT_DRAG_TYPE, shouldCopySeAssignmentDrag } from "../seAssignmentDrag.js";
import { SeIcon } from "./SeIcon.js";

interface Props {
  assignments: SeAssignment[];
  activeKeys: Set<SeKey>;
  voiceCount: number;
  voiceLimit: number;
  preloadMap: SePreloadMap;
  readySummary: SeReadySummary;
  onAssign: (key: SeKey) => void;
  onTrigger: (key: SeKey) => void;
  onUnload: (key: SeKey) => void;
  onStopKey: (key: SeKey) => void;
  onIconWheel: (key: SeKey, delta: number) => void;
  onIconSelect: (key: SeKey, iconId: SeIconId) => void;
  onSettingsChange?: (key: SeKey, patch: Partial<Pick<SeAssignment, "volume" | "pan">>) => void;
  onTransferAssignment?: (sourceKey: SeKey, targetKey: SeKey, options: { copy: boolean }) => void;
  currentSeSetName?: string | null;
  onSaveSet?: () => void;
  onLoadSet?: () => void;
  onEditSeSet?: () => void;
  onStopAll: () => void;
  onVoiceLimitChange?: (value: number) => void;
  embedded?: boolean;
  language?: UiLanguage;
}

type SePreloadStatus = "loading" | "ready" | "error";

interface SePreloadViewState {
  status: SePreloadStatus;
  error?: string;
}

type SePreloadMap = Record<string, SePreloadViewState>;

interface SeReadySummary {
  ready: number;
  total: number;
  assigned: number;
  loading: number;
  error: number;
}

interface IconMenuState {
  key: SeKey;
  x: number;
  y: number;
}

interface SettingsPopupState {
  key: SeKey;
  x: number;
  y: number;
}

const OVERLAY_MARGIN_PX = 8;
const ICON_MENU_WIDTH_PX = 220;
const ICON_MENU_HEIGHT_PX = 238;
const SE_SETTINGS_POPOVER_WIDTH_PX = 226;
const SE_SETTINGS_POPOVER_HEIGHT_PX = 168;
const SE_SETTINGS_POPOVER_OFFSET_PX = 6;

interface SePadLabels {
  activeVoices: string;
  seReady: string;
  seVoiceLimit: string;
  stopAllSe: string;
  assignTitle: string;
  editSettingsTitle: string;
  assignSettingsTitle: string;
  changeIcon: string;
  previousIcon: string;
  nextIcon: string;
  loadingTitle: string;
  errorTitle: string;
  readyTitle: string;
  ready: string;
  loading: string;
  error: string;
  empty: string;
  load: string;
  unload: string;
  reset: string;
  closeSettings: string;
  noSeSetLoaded: string;
  dropSeHere: string;
}

export const SePad = memo(function SePad({
  assignments,
  activeKeys,
  voiceCount,
  voiceLimit,
  preloadMap,
  readySummary,
  onAssign,
  onTrigger,
  onUnload,
  onStopKey,
  onIconWheel,
  onIconSelect,
  onSettingsChange,
  onTransferAssignment,
  currentSeSetName = null,
  onSaveSet,
  onLoadSet,
  onEditSeSet,
  onStopAll,
  onVoiceLimitChange,
  embedded = false,
  language = "en"
}: Props): ReactElement {
  const byKey = useMemo(() => new Map(assignments.map((assignment) => [assignment.key, assignment])), [assignments]);
  const labels = useMemo(() => getSePadLabels(language), [language]);
  const hasAssignedSe = readySummary.assigned > 0;
  const [iconMenu, setIconMenu] = useState<IconMenuState | null>(null);
  const [settingsPopup, setSettingsPopup] = useState<SettingsPopupState | null>(null);
  const [draggedKey, setDraggedKey] = useState<SeKey | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<SeKey | null>(null);
  const dragClickSuppressRef = useRef(false);
  const dragCopyRef = useRef(false);
  const dragStartShiftRef = useRef(false);
  const shiftPressedRef = useRef(false);

  useEffect(() => {
    if (!iconMenu && !settingsPopup) return undefined;
    const close = () => {
      setIconMenu(null);
      setSettingsPopup(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [iconMenu, settingsPopup]);

  useEffect(() => {
    const updateShiftState = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      shiftPressedRef.current = event.type === "keydown";
    };
    const clearShiftState = () => {
      shiftPressedRef.current = false;
      dragStartShiftRef.current = false;
    };
    window.addEventListener("keydown", updateShiftState, true);
    window.addEventListener("keyup", updateShiftState, true);
    window.addEventListener("blur", clearShiftState);
    return () => {
      window.removeEventListener("keydown", updateShiftState, true);
      window.removeEventListener("keyup", updateShiftState, true);
      window.removeEventListener("blur", clearShiftState);
    };
  }, []);

  function clearAssignmentDrag(): void {
    setDraggedKey(null);
    setDropTargetKey(null);
    window.setTimeout(() => {
      dragClickSuppressRef.current = false;
      dragCopyRef.current = false;
      dragStartShiftRef.current = false;
    }, 0);
  }

  function isShiftModifierActive(event: ReactDragEvent<HTMLElement> | ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>): boolean {
    return Boolean(event.shiftKey || event.nativeEvent.shiftKey);
  }

  function captureAssignmentDragModifiers(event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>): void {
    dragStartShiftRef.current = isShiftModifierActive(event) || shiftPressedRef.current;
  }

  function stopNestedControlPointer(event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>): void {
    captureAssignmentDragModifiers(event);
    event.stopPropagation();
  }

  function cancelNestedControlDrag(event: ReactDragEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function shouldCopyAssignmentDrag(event: ReactDragEvent<HTMLElement>): boolean {
    return shouldCopySeAssignmentDrag({
      eventShiftKey: event.shiftKey,
      nativeShiftKey: event.nativeEvent.shiftKey,
      dragCopy: dragCopyRef.current,
      dragStartShift: dragStartShiftRef.current,
      shiftPressed: shiftPressedRef.current,
      payloadCopy: event.dataTransfer.getData(SE_ASSIGNMENT_DRAG_COPY_TYPE) === "1"
    });
  }

  function openIconMenu(key: SeKey, event: ReactMouseEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const position = clampOverlayPosition(event.clientX, event.clientY, ICON_MENU_WIDTH_PX, ICON_MENU_HEIGHT_PX);
    setSettingsPopup(null);
    setIconMenu({ key, x: position.x, y: position.y });
  }

  function stopKeyFromContext(key: SeKey, assigned: boolean, event: ReactMouseEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
    if (!assigned) return;
    setIconMenu(null);
    setSettingsPopup(null);
    onStopKey(key);
  }

  function beginAssignmentDrag(key: SeKey, assigned: boolean, event: ReactDragEvent<HTMLElement>): void {
    if (!assigned || !onTransferAssignment) {
      event.preventDefault();
      return;
    }
    const shiftAtDragStart = isShiftModifierActive(event) || dragStartShiftRef.current || shiftPressedRef.current;
    dragStartShiftRef.current = shiftAtDragStart;
    dragStartShiftRef.current = shouldCopySeAssignmentDrag({
      eventShiftKey: shiftAtDragStart,
      nativeShiftKey: event.nativeEvent.shiftKey,
      dragStartShift: dragStartShiftRef.current,
      shiftPressed: shiftPressedRef.current
    });
    const copyDrag = shouldCopyAssignmentDrag(event);
    dragClickSuppressRef.current = true;
    dragCopyRef.current = copyDrag;
    setIconMenu(null);
    setSettingsPopup(null);
    setDraggedKey(key);
    setDropTargetKey(null);
    event.dataTransfer.setData(SE_ASSIGNMENT_DRAG_TYPE, key);
    event.dataTransfer.setData(SE_ASSIGNMENT_DRAG_COPY_TYPE, copyDrag ? "1" : "0");
    event.dataTransfer.setData("text/plain", key);
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.dropEffect = copyDrag ? "copy" : "move";
  }

  function handleAssignmentDragOver(key: SeKey, event: ReactDragEvent<HTMLDivElement>): void {
    if (!draggedKey || draggedKey === key || !onTransferAssignment) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = shouldCopyAssignmentDrag(event) ? "copy" : "move";
    if (dropTargetKey !== key) setDropTargetKey(key);
  }

  function handleAssignmentDragEnter(key: SeKey, event: ReactDragEvent<HTMLDivElement>): void {
    if (!draggedKey || draggedKey === key || !onTransferAssignment) return;
    event.preventDefault();
    event.stopPropagation();
    if (dropTargetKey !== key) setDropTargetKey(key);
  }

  function handleAssignmentDragLeave(key: SeKey, event: ReactDragEvent<HTMLDivElement>): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    if (dropTargetKey === key) setDropTargetKey(null);
  }

  function handleAssignmentDrop(targetKey: SeKey, event: ReactDragEvent<HTMLDivElement>): void {
    const sourceKey = parseDraggedSeKey(event.dataTransfer.getData(SE_ASSIGNMENT_DRAG_TYPE)) ?? draggedKey;
    const copyDrag = shouldCopyAssignmentDrag(event);
    clearAssignmentDrag();
    if (!sourceKey || sourceKey === targetKey || !onTransferAssignment) return;
    event.preventDefault();
    event.stopPropagation();
    onTransferAssignment(sourceKey, targetKey, { copy: copyDrag });
  }

  return (
    <section className={embedded ? "se-panel embedded" : "panel se-panel"} data-se-drop-zone="true">
      <div className="panel-title-row">
        <div>
          <h2>SE Pad</h2>
          <span className="subtle se-status-line">
            <span>{labels.activeVoices} {voiceCount}/{voiceLimit}</span>
            <span className={readySummary.error > 0 ? "se-ready-count error" : readySummary.loading > 0 ? "se-ready-count loading" : "se-ready-count"}>
              {labels.seReady} {readySummary.ready}/{readySummary.total}
            </span>
          </span>
        </div>
        <div className="se-panel-actions">
          <div className="se-pad-set-toolbar">
            <span>SE Set</span>
            <strong title={currentSeSetName ?? labels.noSeSetLoaded}>{currentSeSetName ?? labels.noSeSetLoaded}</strong>
            <button className="thin-button" type="button" onClick={onSaveSet} disabled={!onSaveSet || !hasAssignedSe}>
              SAVE
            </button>
            <button className="thin-button" type="button" onClick={onLoadSet} disabled={!onLoadSet}>
              LOAD
            </button>
          </div>
          {onVoiceLimitChange ? (
            <label className="se-pad-voice-limit">
              <span>{labels.seVoiceLimit}</span>
              <input
                type="number"
                min="1"
                max="32"
                step="1"
                value={voiceLimit}
                onChange={(event) => onVoiceLimitChange(clampVoiceLimit(event.target.value, voiceLimit))}
              />
            </label>
          ) : null}
          <button className="thin-button" type="button" onClick={onStopAll}>
            {labels.stopAllSe}
          </button>
        </div>
      </div>
      <div className={`se-keyboard-shell ${hasAssignedSe ? "" : "se-empty-drop-state"}`}>
        {!hasAssignedSe ? (
          <div className="se-drop-empty" aria-label={labels.dropSeHere}>
            <span className="source-drop-icon bgm-file-drop-icon-shell" aria-hidden="true">
              <SeFileDropIcon />
            </span>
            <strong>{labels.dropSeHere}</strong>
          </div>
        ) : null}
        <div className={`se-keyboard ${draggedKey ? "assignment-drag-active" : ""}`} aria-label="SE keyboard pad">
          {seKeyRows.map((row, rowIndex) => (
            <div className={`se-row row-${rowIndex + 1}`} key={row.join("")}>
              {row.map((key) => {
                const assignment = byKey.get(key);
                const assigned = Boolean(assignment?.file);
                const preloadStatus = assignment?.file ? preloadMap[assignment.file.filePath]?.status ?? "loading" : null;
                const volume = clampSeVolume(assignment?.volume);
                const pan = clampSePan(assignment?.pan);
                return (
                  <div
                    className={`se-key color-${assignment?.colorId ?? "white"} ${assigned ? "assigned" : "empty"} ${preloadStatus ? `preload-${preloadStatus}` : ""} ${activeKeys.has(key) ? "active" : ""} ${draggedKey === key ? "dragging-assignment" : ""} ${dropTargetKey === key ? "assignment-drop-target" : ""}`}
                    data-key={key}
                    data-assigned={assigned ? "true" : "false"}
                    style={
                      {
                        "--se-volume": volume,
                        "--se-pan": pan
                      } as CSSProperties
                    }
                    key={key}
                    onContextMenu={(event) => {
                      stopKeyFromContext(key, assigned, event);
                    }}
                    onWheel={(event) => {
                      if (!assigned) return;
                      event.preventDefault();
                      onIconWheel(key, event.deltaY);
                    }}
                    onPointerDownCapture={captureAssignmentDragModifiers}
                    onMouseDownCapture={captureAssignmentDragModifiers}
                    onDragEnter={(event) => handleAssignmentDragEnter(key, event)}
                    onDragOver={(event) => handleAssignmentDragOver(key, event)}
                    onDragLeave={(event) => handleAssignmentDragLeave(key, event)}
                    onDrop={(event) => handleAssignmentDrop(key, event)}
                    onDragEnd={clearAssignmentDrag}
                  >
                    <button
                      className="key-hit-area"
                      type="button"
                      draggable={assigned && Boolean(onTransferAssignment)}
                      onPointerDownCapture={captureAssignmentDragModifiers}
                      onMouseDownCapture={captureAssignmentDragModifiers}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        beginAssignmentDrag(key, assigned, event);
                      }}
                      onClick={(event) => {
                        if (dragClickSuppressRef.current) return;
                        if (event.shiftKey) {
                          if (assigned) {
                            setIconMenu(null);
                            setSettingsPopup(null);
                            onUnload(key);
                          }
                          return;
                        }
                        if (assigned) {
                          onTrigger(key);
                          return;
                        }
                        onAssign(key);
                      }}
                      title={assigned ? seKeyTitle(preloadStatus, labels) : labels.assignTitle}
                    >
                      <span className="key-active-wash" />
                      <span className="key-leak" />
                      <span className="key-corner" />
                      <span className="key-letter">{key}</span>
                      {assigned ? (
                        <span className="key-assigned-content">
                          <span className="key-icon">
                            <SeIcon iconId={assignment?.iconId ?? null} />
                          </span>
                          <span className="key-file">{compactFileName(assignment?.file?.fileName ?? "", 12)}</span>
                          {preloadStatus && preloadStatus !== "ready" ? <span className="key-preload-state">{formatSePreloadLabel(preloadStatus, labels)}</span> : null}
                        </span>
                      ) : null}
                    </button>
                    <span className={`key-control-well ${assigned ? "loaded" : ""}`} draggable={false} onDragStart={cancelNestedControlDrag}>
                      <button
                        className={`assign-lamp ${assigned ? "lit" : ""}`}
                        type="button"
                        draggable={false}
                        onPointerDown={stopNestedControlPointer}
                        onMouseDown={stopNestedControlPointer}
                        onDragStart={cancelNestedControlDrag}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const position = getSettingsPopoverPosition(event.currentTarget);
                          setIconMenu(null);
                          setSettingsPopup({ key, x: position.x, y: position.y });
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        title={assigned ? labels.editSettingsTitle : labels.assignSettingsTitle}
                        aria-label={assigned ? `${labels.editSettingsTitle} ${key}` : `${labels.assignSettingsTitle} ${key}`}
                      />
                      {assigned ? (
                        <span className="icon-stepper" aria-label={`${labels.changeIcon} ${key}`}>
                          <button
                            className="icon-stepper-button up"
                            type="button"
                            draggable={false}
                            onPointerDown={stopNestedControlPointer}
                            onMouseDown={stopNestedControlPointer}
                            onDragStart={cancelNestedControlDrag}
                            onClick={(event) => {
                              event.stopPropagation();
                              onIconWheel(key, -1);
                            }}
                            onContextMenu={(event) => {
                              openIconMenu(key, event);
                            }}
                            aria-label={`${labels.previousIcon} ${key}`}
                          >
                            <span aria-hidden="true" className="stepper-chevron" />
                          </button>
                          <button
                            className="icon-stepper-button down"
                            type="button"
                            draggable={false}
                            onPointerDown={stopNestedControlPointer}
                            onMouseDown={stopNestedControlPointer}
                            onDragStart={cancelNestedControlDrag}
                            onClick={(event) => {
                              event.stopPropagation();
                              onIconWheel(key, 1);
                            }}
                            onContextMenu={(event) => {
                              openIconMenu(key, event);
                            }}
                            aria-label={`${labels.nextIcon} ${key}`}
                          >
                            <span aria-hidden="true" className="stepper-chevron" />
                          </button>
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {onEditSeSet ? (
          <button className="thin-button se-edit-set-button" type="button" onClick={onEditSeSet}>
            EDIT SE SET
          </button>
        ) : null}
      </div>
      {iconMenu
        ? createPortal(
            <div
              className="icon-menu"
              style={{ left: iconMenu.x, top: iconMenu.y }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              role="menu"
            >
              {seIconIds.map((iconId) => (
                <button
                  className="icon-menu-item"
                  type="button"
                  key={iconId}
                  onClick={() => {
                    onIconSelect(iconMenu.key, iconId);
                    setIconMenu(null);
                  }}
                  role="menuitem"
                >
                  <SeIcon iconId={iconId} />
                  <span>{iconId}</span>
                </button>
              ))}
            </div>,
            getSePadOverlayRoot()
          )
        : null}
      {settingsPopup
        ? createPortal(
            <SeSettingsPopover
              assignment={byKey.get(settingsPopup.key) ?? null}
              keyName={settingsPopup.key}
              x={settingsPopup.x}
              y={settingsPopup.y}
              onLoad={(key) => {
                setSettingsPopup(null);
                onAssign(key);
              }}
              onUnload={(key) => {
                setSettingsPopup(null);
                onUnload(key);
              }}
              onClose={() => setSettingsPopup(null)}
              onChange={(key, patch) => onSettingsChange?.(key, patch)}
              labels={labels}
            />,
            getSePadOverlayRoot()
          )
        : null}
    </section>
  );
}, areSePadPropsEqual);

function areSePadPropsEqual(previous: Props, next: Props): boolean {
  return (
    previous.assignments === next.assignments &&
    previous.activeKeys === next.activeKeys &&
    previous.voiceCount === next.voiceCount &&
    previous.voiceLimit === next.voiceLimit &&
    previous.preloadMap === next.preloadMap &&
    previous.readySummary === next.readySummary &&
    previous.embedded === next.embedded &&
    previous.language === next.language &&
    previous.currentSeSetName === next.currentSeSetName &&
    Boolean(previous.onSaveSet) === Boolean(next.onSaveSet) &&
    Boolean(previous.onLoadSet) === Boolean(next.onLoadSet) &&
    Boolean(previous.onEditSeSet) === Boolean(next.onEditSeSet) &&
    Boolean(previous.onTransferAssignment) === Boolean(next.onTransferAssignment)
  );
}

function SeFileDropIcon(): ReactElement {
  return (
    <span className="bgm-file-drop-icon" aria-hidden="true">
      <span className="bgm-file-drop-target" />
      <span className="bgm-file-drop-card">
        <FileMusic size={30} />
      </span>
      <svg className="bgm-file-drop-cursor" viewBox="0 0 32 32" focusable="false">
        <path d="M7 4 L25 18 L16.8 19.2 L21.6 28 L17.3 30 L12.6 21.3 L7 27 Z" />
      </svg>
    </span>
  );
}

function parseDraggedSeKey(value: string): SeKey | null {
  return seKeys.includes(value as SeKey) ? (value as SeKey) : null;
}

function seKeyTitle(status: SePreloadStatus | null, labels: SePadLabels): string {
  if (status === "loading" || status === null) return labels.loadingTitle;
  if (status === "error") return labels.errorTitle;
  return labels.readyTitle;
}

function formatSePreloadLabel(status: SePreloadStatus | null, labels: SePadLabels): string {
  if (status === "ready") return labels.ready;
  if (status === "error") return labels.error;
  return labels.loading;
}

function SeSettingsPopover({
  assignment,
  keyName,
  x,
  y,
  onLoad,
  onUnload,
  onClose,
  onChange,
  labels
}: {
  assignment: SeAssignment | null;
  keyName: SeKey;
  x: number;
  y: number;
  onLoad: (key: SeKey) => void;
  onUnload: (key: SeKey) => void;
  onClose: () => void;
  onChange: (key: SeKey, patch: Partial<Pick<SeAssignment, "volume" | "pan">>) => void;
  labels: SePadLabels;
}): ReactElement {
  const volume = clampSeVolume(assignment?.volume);
  const pan = clampSePan(assignment?.pan);
  return (
    <div
      className="se-settings-popover"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      role="dialog"
      aria-label={`SE settings for ${keyName}`}
    >
      <button className="se-settings-close" type="button" aria-label={labels.closeSettings} title={labels.closeSettings} onClick={onClose}>
        <X size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <div className="se-settings-head">
        <strong>{keyName}</strong>
        <span>{assignment?.file ? compactFileName(assignment.file.fileName, 18) : labels.empty}</span>
      </div>
      <div className="se-knob-row">
        <SeSettingKnob
          kind="volume"
          label="VOL"
          value={Math.round(volume * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(value) => onChange(keyName, { volume: value / 100 })}
          onReset={() => onChange(keyName, { volume: 1 })}
        />
        <SeSettingKnob
          kind="pan"
          label="PAN"
          value={Math.round(pan * 100)}
          min={-100}
          max={100}
          suffix=""
          onChange={(value) => onChange(keyName, { pan: value / 100 })}
          onReset={() => onChange(keyName, { pan: 0 })}
        />
      </div>
      <div className="se-settings-actions">
        <button className="thin-button se-load-button" type="button" onClick={() => onLoad(keyName)}>
          {labels.load}
        </button>
        <button className="thin-button se-unload-button" type="button" onClick={() => onUnload(keyName)} disabled={!assignment?.file}>
          {labels.unload}
        </button>
      </div>
    </div>
  );
}

function SeSettingKnob({
  kind,
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  onReset
}: {
  kind: "volume" | "pan";
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
  onReset: () => void;
}): ReactElement {
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; startValue: number } | null>(null);
  const ratio = (value - min) / Math.max(1, max - min);
  const angle = -135 + ratio * 270;
  const fillDeg = Math.max(0, Math.min(270, ratio * 270));
  const panGradient = makePanKnobGradient(value / 100);
  const dragStepPx = kind === "pan" ? 1.8 : 2.1;

  function commitValue(nextValue: number): void {
    const safeValue = Math.round(Math.min(max, Math.max(min, Number.isFinite(nextValue) ? nextValue : value)));
    if (safeValue !== value) onChange(safeValue);
  }

  function beginDrag(event: ReactPointerEvent<HTMLSpanElement>): void {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue: value
    };
  }

  function moveDrag(event: ReactPointerEvent<HTMLSpanElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - drag.startX;
    const deltaY = drag.startY - event.clientY;
    const dominantDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
    commitValue(drag.startValue + dominantDelta / dragStepPx);
  }

  function endDrag(event: ReactPointerEvent<HTMLSpanElement>): void {
    event.stopPropagation();
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function wheelValue(event: ReactWheelEvent<HTMLSpanElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
    if (rawDelta === 0) return;
    const direction = rawDelta > 0 ? 1 : -1;
    const step = event.shiftKey ? 1 : 5;
    commitValue(value + direction * step);
  }

  return (
    <label className="se-knob-field">
      <span>{label}</span>
      <span
        className={`se-knob-dial ${kind}`}
        style={
          {
            "--knob-angle": `${angle}deg`,
            "--knob-fill-deg": `${fillDeg}deg`,
            "--knob-pan-gradient": panGradient
          } as CSSProperties
        }
        onDoubleClick={(event) => {
          event.preventDefault();
          onReset();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
        onWheel={wheelValue}
        role="button"
        tabIndex={0}
        aria-label={`Reset ${label}`}
      >
        <span />
      </span>
      <input type="range" min={min} max={max} step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <em>{suffix ? `${value}${suffix}` : value}</em>
    </label>
  );
}

function makePanKnobGradient(pan: number): string {
  const safePan = Math.min(1, Math.max(-1, Number.isFinite(pan) ? pan : 0));
  const span = Math.abs(safePan) * 135;
  if (span < 0.5) {
    return "conic-gradient(from 0deg, transparent 0deg 360deg)";
  }
  if (safePan > 0) {
    return `conic-gradient(from 0deg, rgba(239, 174, 119, 0.9) 0deg ${span}deg, transparent ${span}deg 360deg)`;
  }
  const start = 360 - span;
  return `conic-gradient(from 0deg, transparent 0deg ${start}deg, rgba(239, 174, 119, 0.9) ${start}deg 360deg)`;
}

function getSettingsPopoverPosition(target: HTMLElement): { x: number; y: number } {
  const rect = target.getBoundingClientRect();
  return clampOverlayPosition(
    rect.right - SE_SETTINGS_POPOVER_WIDTH_PX,
    rect.bottom + SE_SETTINGS_POPOVER_OFFSET_PX,
    SE_SETTINGS_POPOVER_WIDTH_PX,
    SE_SETTINGS_POPOVER_HEIGHT_PX
  );
}

function getSePadOverlayRoot(): Element {
  return document.querySelector(".app") ?? document.body;
}

function clampOverlayPosition(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const viewportWidth = window.innerWidth || width + OVERLAY_MARGIN_PX * 2;
  const viewportHeight = window.innerHeight || height + OVERLAY_MARGIN_PX * 2;
  const maxX = Math.max(OVERLAY_MARGIN_PX, viewportWidth - width - OVERLAY_MARGIN_PX);
  const maxY = Math.max(OVERLAY_MARGIN_PX, viewportHeight - height - OVERLAY_MARGIN_PX);
  return {
    x: clampFiniteNumber(x, OVERLAY_MARGIN_PX, maxX),
    y: clampFiniteNumber(y, OVERLAY_MARGIN_PX, maxY)
  };
}

function clampFiniteNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampSeVolume(value: number | undefined): number {
  return Math.min(1, Math.max(0, typeof value === "number" && Number.isFinite(value) ? value : 1));
}

function clampSePan(value: number | undefined): number {
  return Math.min(1, Math.max(-1, typeof value === "number" && Number.isFinite(value) ? value : 0));
}

function getSePadLabels(language: UiLanguage): SePadLabels {
  if (language === "ja") {
    return {
      activeVoices: "同時発音",
      seReady: "SE Ready",
      seVoiceLimit: "SE Voice Limit",
      stopAllSe: "全SE停止",
      assignTitle: "クリックでSEファイルを割り当てます。",
      editSettingsTitle: "左クリックでVolume、PAN、割り当てSEを編集",
      assignSettingsTitle: "SE設定を割り当てまたは編集",
      changeIcon: "アイコン変更",
      previousIcon: "前のアイコン",
      nextIcon: "次のアイコン",
      loadingTitle: "SE読み込み中です。Shift+クリックで解除、右クリックでこのキーのSEを停止します。",
      errorTitle: "SEの先読み失敗。Shift+クリックで解除、右クリックでこのキーのSEを停止、赤ランプで別ファイルを読み込めます。",
      readyTitle: "クリックで再生。Shift+クリックで解除、右クリックでこのキーのSEを停止、赤ランプで設定を編集できます。",
      ready: "Ready",
      loading: "Loading",
      error: "Error",
      empty: "未割り当て",
      load: "Load",
      unload: "Unload",
      reset: "リセット",
      closeSettings: "SE設定を閉じる",
      noSeSetLoaded: "No SE Set loaded",
      dropSeHere: "Drop SE files here"
    };
  }
  return {
    activeVoices: "Active voices",
    seReady: "SE Ready",
    seVoiceLimit: "SE Voice Limit",
    stopAllSe: "Stop All SE",
    assignTitle: "Click to assign an SE file.",
    editSettingsTitle: "Left-click to edit volume, PAN, or assigned SE file.",
    assignSettingsTitle: "Assign or edit SE settings.",
    changeIcon: "Change icon for",
    previousIcon: "Previous icon for",
    nextIcon: "Next icon for",
    loadingTitle: "SE is loading. Shift+click to unload. Right-click stops this key.",
    errorTitle: "SE preload failed. Shift+click to unload. Right-click stops this key. Use the red lamp to load another file.",
    readyTitle: "Click to play. Shift+click to unload. Right-click stops this key. Use the red lamp to edit SE settings.",
    ready: "Ready",
    loading: "Loading",
    error: "Error",
    empty: "Empty",
    load: "Load",
    unload: "Unload",
    reset: "Reset",
    closeSettings: "Close SE settings",
    noSeSetLoaded: "No SE Set loaded",
    dropSeHere: "Drop SE files here"
  };
}

function clampVoiceLimit(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.min(32, Math.max(1, numeric)));
}
