import type { BgmTrack, LoopMarker, SeFile, UiLanguage } from "../../shared/types.js";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from "react";
import { formatTime, msToSample, sampleToMs } from "../../shared/format.js";
import type { PositionStore } from "../positionStore.js";
import { applyWaveformPlayheadPosition, getWaveformPlayheadX } from "../waveformPlayhead.js";

interface Props {
  track: WaveformTrack | null;
  currentMs: number;
  editable?: boolean;
  onLoopChange?: (loop: LoopMarker, options?: { history?: boolean }) => void;
  onLoopDragStart?: () => void;
  onLoopDragEnd?: () => void;
  onSeek?: (ms: number) => void;
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  positionStore?: PositionStore;
  showPlayhead?: boolean;
  busLabel?: "BGM" | "SE";
  panelTitle?: string;
  compact?: boolean;
  emptyLabel?: string;
  language?: UiLanguage;
  isScanning?: boolean;
  isDeepScanning?: boolean;
  hideEmptyLabel?: boolean;
  showLoopUnitToggle?: boolean;
  footerActions?: ReactNode;
}

type WaveformTrack = BgmTrack | SeFile;
type TimeTick = { ms: number; x: number; label: string };
type LoopInputUnit = "time" | "sample";
interface WaveformLabels {
  emptyBgm: string;
  lastSe: string;
  noLoop: string;
  loopStart: string;
  loopEnd: string;
  start: string;
  end: string;
  waveform: string;
  scanning: string;
  deepScanning: string;
  unitTime: string;
  unitSample: string;
  loopInputUnit: string;
}

const waveformPlayheadEnabled = !new URLSearchParams(window.location.search).has("playhead") || new URLSearchParams(window.location.search).get("playhead") !== "0";
const waveformPathCache = new Map<string, string>();
const waveformPathCacheLimit = 160;

export const WaveformView = memo(function WaveformView({
  track,
  currentMs,
  editable = false,
  onLoopChange,
  onLoopDragStart,
  onLoopDragEnd,
  onSeek,
  volume = 1,
  onVolumeChange,
  positionStore,
  showPlayhead = true,
  busLabel = "BGM",
  panelTitle,
  compact = false,
  emptyLabel,
  language = "en",
  isScanning = false,
  isDeepScanning = false,
  hideEmptyLabel = false,
  showLoopUnitToggle = false,
  footerActions
}: Props): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const activeDragRef = useRef<{ marker: "start" | "end"; pointerId: number } | null>(null);
  const id = useId().replace(/:/g, "");
  const waveGradientId = `waveFade-${id}`;
  const waveColorGradientId = `waveColor-${id}`;
  const scanGradientId = `waveScan-${id}`;
  const deepBackgroundGradientId = `deepBg-${id}`;
  const [draggingMarker, setDraggingMarker] = useState<"start" | "end" | null>(null);
  const [loopInputUnit, setLoopInputUnit] = useState<LoopInputUnit>("time");
  const panelClassName = `panel waveform-panel ${compact ? "compact-waveform" : ""}`;
  const labels = useMemo(() => getWaveformLabels(language), [language]);
  const waveformPath = useMemo(
    () => (track ? getCachedWavePath(track, busLabel === "SE" ? 260 : compact ? 460 : 700) : ""),
    [track?.id, track?.waveform, busLabel, compact]
  );
  const tickMarks = useMemo(() => (track ? timeTicks(track.durationMs) : []), [track]);

  if (!track) {
    return (
      <section className={`${panelClassName} empty-waveform ${hideEmptyLabel ? "empty-label-hidden" : ""}`}>
        <h2 className="waveform-panel-name">{panelTitle ?? busLabel}</h2>
        {hideEmptyLabel ? null : (
          <div className="waveform-empty-body">
            {!panelTitle ? <span className="waveform-bus-label">{busLabel}</span> : null}
            <span>{emptyLabel ?? labels.emptyBgm}</span>
          </div>
        )}
      </section>
    );
  }

  const activeTrack = track;
  const loop = isBgmTrack(activeTrack) ? activeTrack.loop : null;
  const startMs = loop ? sampleToMs(loop.startSample, activeTrack.sampleRate) : 0;
  const endMs = loop ? sampleToMs(loop.endSample, activeTrack.sampleRate) : activeTrack.durationMs;
  const safeDurationMs = Math.max(1, activeTrack.durationMs);
  const canDragMarkers = Boolean(isBgmTrack(activeTrack) && loop && onLoopChange);

  function beginMarkerDrag(marker: "start" | "end", event: ReactPointerEvent<SVGGElement>): void {
    if (!canDragMarkers) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeDragRef.current = { marker, pointerId: event.pointerId };
    onLoopDragStart?.();
    setDraggingMarker(marker);
    applyMarkerDrag(marker, event.clientX, { history: false });
  }

  function applyMarkerDrag(marker: "start" | "end", clientX: number, options: { history?: boolean } = {}): void {
    const nextMs = clientXToMs(clientX, svgRef.current, activeTrack.durationMs);
    if (nextMs === null) return;
    if (marker === "start") {
      if (isBgmTrack(activeTrack)) {
        updateLoop(activeTrack, nextMs, endMs, onLoopChange, options);
      }
      return;
    }
    if (isBgmTrack(activeTrack)) {
      updateLoop(activeTrack, startMs, nextMs, onLoopChange, options);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    const activeDrag = activeDragRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    applyMarkerDrag(activeDrag.marker, event.clientX, { history: false });
  }

  function finishMarkerDrag(): void {
    if (!activeDragRef.current) return;
    activeDragRef.current = null;
    setDraggingMarker(null);
    onLoopDragEnd?.();
  }

  function handleWaveformDoubleClick(event: ReactMouseEvent<SVGSVGElement>): void {
    if (!onSeek || draggingMarker) return;
    const target = event.target;
    if (target instanceof Element && target.closest(".loop-marker-group")) return;
    const nextMs = clientXToMs(event.clientX, svgRef.current, activeTrack.durationMs);
    if (nextMs === null) return;
    event.preventDefault();
    onSeek(nextMs);
  }

  return (
    <section className={panelClassName}>
      <div className="waveform-head">
        <div className="waveform-title-block">
          {panelTitle ? <h2 className="waveform-panel-name waveform-monitor-heading">{panelTitle}</h2> : null}
          <div className="waveform-title-row">
            <div className="waveform-name-line">
              <span className="waveform-bus-label">{busLabel}</span>
              <h2>{track.fileName}</h2>
            </div>
            {onVolumeChange ? (
              <label className="track-volume-control">
                <span>VOL</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={clampVolume(volume)}
                  onChange={(event) => onVolumeChange(Number(event.target.value))}
                />
                <em>{Math.round(clampVolume(volume) * 100)}%</em>
              </label>
            ) : null}
          </div>
          <span className="subtle">
            {formatTime(track.durationMs)} / {track.sampleRate / 1000} kHz / {track.channels} ch
          </span>
        </div>
        {loop ? (
          <div className="confidence-pill">{loop.source} {loop.confidence !== null ? `${loop.confidence.toFixed(1)}%` : "manual"}</div>
        ) : busLabel !== "SE" ? (
          <div className="confidence-pill warning">{labels.noLoop}</div>
        ) : null}
      </div>
      <div className={`waveform-canvas ${onSeek ? "seek-enabled" : ""} ${draggingMarker ? "dragging-marker" : ""}`}>
        <svg
          ref={svgRef}
          viewBox="0 0 1200 220"
          preserveAspectRatio="none"
          role="img"
          aria-label={labels.waveform}
          onPointerMove={handlePointerMove}
          onPointerUp={finishMarkerDrag}
          onPointerCancel={finishMarkerDrag}
          onLostPointerCapture={finishMarkerDrag}
          onDoubleClick={handleWaveformDoubleClick}
        >
          <WaveformArtwork
            waveformPath={waveformPath}
            tickMarks={tickMarks}
            waveGradientId={waveGradientId}
            waveColorGradientId={waveColorGradientId}
            scanGradientId={scanGradientId}
            deepBackgroundGradientId={deepBackgroundGradientId}
            loop={loop}
            startMs={startMs}
            endMs={endMs}
            safeDurationMs={safeDurationMs}
            canDragMarkers={canDragMarkers}
            isScanning={isScanning}
            isDeepScanning={isDeepScanning}
            waveformGlowActive={showPlayhead}
            draggingMarker={draggingMarker}
            labels={labels}
            onMarkerPointerDown={beginMarkerDrag}
          />
          {waveformPlayheadEnabled && showPlayhead ? (
            <WaveformPlayhead currentMs={currentMs} durationMs={activeTrack.durationMs} positionStore={positionStore} />
          ) : null}
        </svg>
        <WaveformLabelOverlay tickMarks={tickMarks} loop={loop} startMs={startMs} endMs={endMs} safeDurationMs={safeDurationMs} labels={labels} />
      </div>
      {editable && isBgmTrack(track) ? (
        <div className="loop-editor-row">
          <div className="loop-editor-fields">
            <label>
              {labels.start}
              <input
                type="number"
                min="0"
                step={loopInputUnit === "sample" ? "1" : "0.001"}
                value={loopInputUnit === "sample" ? String(track.loop?.startSample ?? 0) : (startMs / 1000).toFixed(3)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (loopInputUnit === "sample") {
                    updateLoopSamples(track, value, track.loop?.endSample ?? msToSample(endMs, track.sampleRate), onLoopChange);
                    return;
                  }
                  updateLoop(track, value * 1000, endMs, onLoopChange);
                }}
              />
            </label>
            <label>
              {labels.end}
              <input
                type="number"
                min="0"
                step={loopInputUnit === "sample" ? "1" : "0.001"}
                value={loopInputUnit === "sample" ? String(track.loop?.endSample ?? track.durationSamples) : (endMs / 1000).toFixed(3)}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (loopInputUnit === "sample") {
                    updateLoopSamples(track, track.loop?.startSample ?? msToSample(startMs, track.sampleRate), value, onLoopChange);
                    return;
                  }
                  updateLoop(track, startMs, value * 1000, onLoopChange);
                }}
              />
            </label>
          </div>
          {showLoopUnitToggle ? (
            <div className="loop-unit-toggle" role="group" aria-label={labels.loopInputUnit}>
              <button
                type="button"
                className={loopInputUnit === "time" ? "active" : ""}
                aria-pressed={loopInputUnit === "time"}
                onClick={() => setLoopInputUnit("time")}
              >
                {labels.unitTime}
              </button>
              <button
                type="button"
                className={loopInputUnit === "sample" ? "active" : ""}
                aria-pressed={loopInputUnit === "sample"}
                onClick={() => setLoopInputUnit("sample")}
              >
                {labels.unitSample}
              </button>
            </div>
          ) : null}
          {footerActions ? <div className="loop-editor-actions">{footerActions}</div> : null}
        </div>
  ) : null}
    </section>
  );
}, areWaveformViewPropsEqual);

function areWaveformViewPropsEqual(previous: Props, next: Props): boolean {
  return (
    previous.track === next.track &&
    (!waveformPlayheadEnabled || Boolean(previous.positionStore) || previous.currentMs === next.currentMs) &&
    previous.editable === next.editable &&
    previous.volume === next.volume &&
    previous.positionStore === next.positionStore &&
    previous.showPlayhead === next.showPlayhead &&
    previous.busLabel === next.busLabel &&
    previous.compact === next.compact &&
    previous.emptyLabel === next.emptyLabel &&
    previous.language === next.language &&
    previous.isScanning === next.isScanning &&
    previous.isDeepScanning === next.isDeepScanning &&
    previous.hideEmptyLabel === next.hideEmptyLabel &&
    previous.showLoopUnitToggle === next.showLoopUnitToggle &&
    previous.footerActions === next.footerActions &&
    Boolean(previous.onLoopChange) === Boolean(next.onLoopChange) &&
    previous.onSeek === next.onSeek &&
    Boolean(previous.onVolumeChange) === Boolean(next.onVolumeChange)
  );
}

function WaveformLabelOverlay({
  tickMarks,
  loop,
  startMs,
  endMs,
  safeDurationMs,
  labels
}: {
  tickMarks: TimeTick[];
  loop: LoopMarker | null;
  startMs: number;
  endMs: number;
  safeDurationMs: number;
  labels: WaveformLabels;
}): ReactElement {
  return (
    <div className="waveform-label-overlay" aria-hidden="true">
      {tickMarks.map((tick) => (
        <span key={tick.ms} className="waveform-time-label" style={{ left: `${clampPercent((tick.x / 1200) * 100, 0, 98)}%` }}>
          {tick.label}
        </span>
      ))}
      {loop ? (
        <>
          <span className="waveform-marker-label marker-start-label" style={{ left: `${clampPercent((startMs / safeDurationMs) * 100, 0, 90)}%` }}>
            <strong>{labels.loopStart}</strong>
            <em>{formatTime(startMs)}</em>
          </span>
          <span className="waveform-marker-label marker-end-label" style={{ left: `${clampPercent((endMs / safeDurationMs) * 100, 0, 90)}%` }}>
            <strong>{labels.loopEnd}</strong>
            <em>{formatTime(endMs)}</em>
          </span>
        </>
      ) : null}
    </div>
  );
}

interface WaveformArtworkProps {
  waveformPath: string;
  tickMarks: TimeTick[];
  waveGradientId: string;
  waveColorGradientId: string;
  scanGradientId: string;
  deepBackgroundGradientId: string;
  loop: LoopMarker | null;
  startMs: number;
  endMs: number;
  safeDurationMs: number;
  canDragMarkers: boolean;
  isScanning: boolean;
  isDeepScanning: boolean;
  waveformGlowActive: boolean;
  draggingMarker: "start" | "end" | null;
  labels: WaveformLabels;
  onMarkerPointerDown: (marker: "start" | "end", event: ReactPointerEvent<SVGGElement>) => void;
}

function WaveformPlayhead({
  currentMs,
  durationMs,
  positionStore
}: {
  currentMs: number;
  durationMs: number;
  positionStore?: PositionStore;
}): ReactElement {
  const lineRef = useRef<SVGLineElement | null>(null);
  const auraRef = useRef<SVGLineElement | null>(null);
  const outerAuraRef = useRef<SVGLineElement | null>(null);
  const axisRef = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    if (!positionStore) return undefined;
    const update = () => {
      const node = lineRef.current;
      const aura = auraRef.current;
      const outerAura = outerAuraRef.current;
      const axis = axisRef.current;
      if (!node || !aura || !outerAura || !axis) return;
      const current = positionStore.getSnapshot();
      applyWaveformPlayheadPosition(outerAura, current, durationMs);
      applyWaveformPlayheadPosition(aura, current, durationMs);
      applyWaveformPlayheadPosition(node, current, durationMs);
      applyWaveformPlayheadPosition(axis, current, durationMs);
    };
    update();
    return positionStore.subscribe(update);
  }, [durationMs, positionStore]);

  const x = String(getWaveformPlayheadX(positionStore?.getSnapshot() ?? currentMs, durationMs));
  return (
    <g className="playhead-stack">
      <line ref={outerAuraRef} className="playhead-aura playhead-aura-outer" x1={x} x2={x} y1="34" y2="198" />
      <line ref={auraRef} className="playhead-aura playhead-aura-inner" x1={x} x2={x} y1="34" y2="198" />
      <line ref={lineRef} className="playhead" x1={x} x2={x} y1="34" y2="198" />
      <line ref={axisRef} className="playhead-axis" x1={x} x2={x} y1="34" y2="198" />
    </g>
  );
}

const WaveformArtwork = memo(function WaveformArtwork({
  waveformPath,
  tickMarks,
  waveGradientId,
  waveColorGradientId,
  scanGradientId,
  deepBackgroundGradientId,
  loop,
  startMs,
  endMs,
  safeDurationMs,
  canDragMarkers,
  isScanning,
  isDeepScanning,
  waveformGlowActive,
  labels,
  onMarkerPointerDown
}: WaveformArtworkProps): ReactElement {
  return (
    <>
      <defs>
        <linearGradient id={waveGradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#d7c4ae" stopOpacity="0.82" />
          <stop offset="55%" stopColor="#f2ddc3" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#bda58d" stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={waveColorGradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#ff5b5b" stopOpacity="0.78" />
          <stop offset="20%" stopColor="#ffea5c" stopOpacity="0.7" />
          <stop offset="42%" stopColor="#8fff64" stopOpacity="0.74" />
          <stop offset="64%" stopColor="#62fff3" stopOpacity="0.82" />
          <stop offset="82%" stopColor="#73bdff" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#eb6dff" stopOpacity="0.78" />
        </linearGradient>
        <linearGradient id={scanGradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#2bd7e9" stopOpacity="0" />
          <stop offset="48%" stopColor="#2bd7e9" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#5ad46b" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={deepBackgroundGradientId} cx="50%" cy="50%" r="74%">
          <stop offset="0%" stopColor="#2bd7e9" stopOpacity="0.13" />
          <stop offset="48%" stopColor="#2bd7e9" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#2bd7e9" stopOpacity="0" />
        </radialGradient>
        <filter id={`${deepBackgroundGradientId}-blur`} x="-35%" y="-80%" width="170%" height="260%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      {isDeepScanning ? (
        <>
          <rect width="1200" height="220" rx="8" className="deep-scan-background" fill={`url(#${deepBackgroundGradientId})`} />
          <g className="deep-scan-ripple-field">
            <ellipse cx="600" cy="110" rx="112" ry="36" className="deep-scan-ripple" filter={`url(#${deepBackgroundGradientId}-blur)`} />
            <ellipse cx="600" cy="110" rx="112" ry="36" className="deep-scan-ripple delay-1" filter={`url(#${deepBackgroundGradientId}-blur)`} />
            <ellipse cx="600" cy="110" rx="112" ry="36" className="deep-scan-ripple delay-2" filter={`url(#${deepBackgroundGradientId}-blur)`} />
          </g>
        </>
      ) : null}
      {tickMarks.map((tick) => (
        <g key={tick.ms}>
          <line className="wave-grid" x1={tick.x} x2={tick.x} y1="22" y2="204" />
        </g>
      ))}
      <path className={`wave-path-glow ${waveformGlowActive ? "active" : ""}`} d={waveformPath} style={{ fill: `url(#${waveGradientId})` }} />
      <path className={`wave-path ${waveformGlowActive ? "active" : ""}`} d={waveformPath} style={{ fill: `url(#${waveGradientId})` }} />
      <path className={`wave-path-color ${waveformGlowActive ? "active" : ""}`} d={waveformPath} style={{ fill: `url(#${waveColorGradientId})` }} />
      {loop ? (
        <>
          <Marker
            x={(startMs / safeDurationMs) * 1200}
            kind="start"
            draggable={canDragMarkers}
            onPointerDown={(event) => onMarkerPointerDown("start", event)}
          />
          <Marker
            x={(endMs / safeDurationMs) * 1200}
            kind="end"
            draggable={canDragMarkers}
            onPointerDown={(event) => onMarkerPointerDown("end", event)}
          />
        </>
      ) : null}
      {isScanning ? (
        <g className={`waveform-scanning${isDeepScanning ? " deep-scanning" : ""}`} aria-label={labels.waveform}>
          {!isDeepScanning ? (
            <>
              <rect width="1200" height="220" rx="8" className="scan-tint" />
              <rect x="-420" y="0" width="420" height="220" className="scan-sweep" fill={`url(#${scanGradientId})`} />
            </>
          ) : null}
          <g className="scan-label-group">
            <rect
              x={isDeepScanning ? "462" : "486"}
              y="84"
              width={isDeepScanning ? "276" : "228"}
              height="50"
              rx="25"
              className={`scan-label-chip${isDeepScanning ? " deep" : ""}`}
            />
            <circle cx={isDeepScanning ? "486" : "510"} cy="109" r="4.2" className="scan-label-dot" />
            <text x="600" y="110" textAnchor="middle" dominantBaseline="middle" className="scan-label">
              {isDeepScanning ? labels.deepScanning : labels.scanning}
            </text>
          </g>
        </g>
      ) : null}
    </>
  );
}, areWaveformArtworkPropsEqual);

function areWaveformArtworkPropsEqual(previous: WaveformArtworkProps, next: WaveformArtworkProps): boolean {
  return (
    previous.waveformPath === next.waveformPath &&
    previous.tickMarks === next.tickMarks &&
    previous.waveGradientId === next.waveGradientId &&
    previous.scanGradientId === next.scanGradientId &&
    previous.deepBackgroundGradientId === next.deepBackgroundGradientId &&
    previous.startMs === next.startMs &&
    previous.endMs === next.endMs &&
    previous.safeDurationMs === next.safeDurationMs &&
    previous.canDragMarkers === next.canDragMarkers &&
    previous.isScanning === next.isScanning &&
    previous.isDeepScanning === next.isDeepScanning &&
    previous.draggingMarker === next.draggingMarker &&
    previous.labels === next.labels &&
    previous.loop?.startSample === next.loop?.startSample &&
    previous.loop?.endSample === next.loop?.endSample &&
    previous.loop?.confidence === next.loop?.confidence &&
    previous.loop?.source === next.loop?.source
  );
}

function getWaveformLabels(language: UiLanguage): WaveformLabels {
  if (language === "ja") {
    return {
      emptyBgm: "BGMをLoop / Play Listへ読み込んでください。",
      lastSe: "直前のSE",
      noLoop: "ループなし",
      loopStart: "ループ開始",
      loopEnd: "ループ終了",
      start: "開始",
      end: "終了",
      waveform: "波形",
      scanning: "Scanning...",
      deepScanning: "Deep Scanning...",
      unitTime: "時間",
      unitSample: "サンプル",
      loopInputUnit: "ループ入力単位"
    };
  }
  return {
    emptyBgm: "Drop or import BGM files in Loop / Playlist.",
    lastSe: "Last SE",
    noLoop: "No loop",
    loopStart: "LOOP START",
    loopEnd: "LOOP END",
    start: "Start",
    end: "End",
    waveform: "waveform",
    scanning: "Scanning...",
    deepScanning: "Deep Scanning...",
    unitTime: "Time",
    unitSample: "Sample",
    loopInputUnit: "Loop input unit"
  };
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}

function clampPercent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function isBgmTrack(track: WaveformTrack): track is BgmTrack {
  return "loop" in track;
}

function Marker({
  x,
  kind,
  draggable,
  onPointerDown
}: {
  x: number;
  kind: "start" | "end";
  draggable: boolean;
  onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void;
}): ReactElement {
  const safeX = Math.max(0, Math.min(1194, x));
  return (
    <g className={`loop-marker-group marker-${kind} ${draggable ? "draggable" : ""}`} onPointerDown={draggable ? onPointerDown : undefined}>
      {draggable ? <line className="marker-hit-zone" x1={safeX} x2={safeX} y1="28" y2="204" /> : null}
      <line className="loop-marker" x1={safeX} x2={safeX} y1="34" y2="198" />
      <rect className="marker-handle" x={safeX - 5} y="34" width="10" height="10" rx="2" />
      <rect className="marker-handle" x={safeX - 5} y="190" width="10" height="10" rx="2" />
    </g>
  );
}

function getCachedWavePath(track: WaveformTrack, maxPoints: number): string {
  const channel = track.waveform?.channels[0];
  const cacheKey = [
    track.id,
    maxPoints,
    track.waveform?.resolution ?? 0,
    channel?.max.length ?? 0,
    channel?.min.length ?? 0
  ].join(":");
  const cached = waveformPathCache.get(cacheKey);
  if (cached) return cached;
  const path = buildWavePath(track, maxPoints);
  waveformPathCache.set(cacheKey, path);
  if (waveformPathCache.size > waveformPathCacheLimit) {
    const oldest = waveformPathCache.keys().next().value;
    if (oldest) waveformPathCache.delete(oldest);
  }
  return path;
}

function buildWavePath(track: WaveformTrack, maxPoints: number): string {
  const channel = track.waveform?.channels[0];
  if (!channel || channel.max.length === 0) {
    return "M 0 110 L 1200 110";
  }
  const sourceLength = channel.max.length;
  const step = Math.max(1, Math.ceil(sourceLength / Math.max(1, maxPoints)));
  const top: string[] = [];
  const bottom: string[] = [];
  for (let source = 0; source < sourceLength; source += step) {
    const x = (source / Math.max(1, sourceLength - 1)) * 1200;
    const hi = channel.max[source] ?? 0;
    const lo = channel.min[source] ?? 0;
    top.push(`${x.toFixed(2)} ${(110 - hi * 78).toFixed(2)}`);
    bottom.unshift(`${x.toFixed(2)} ${(110 - lo * 78).toFixed(2)}`);
  }
  if (top.length > 0 && !top[top.length - 1].startsWith("1200.00 ")) {
    const lastIndex = sourceLength - 1;
    const hi = channel.max[lastIndex] ?? 0;
    const lo = channel.min[lastIndex] ?? 0;
    top.push(`1200.00 ${(110 - hi * 78).toFixed(2)}`);
    bottom.unshift(`1200.00 ${(110 - lo * 78).toFixed(2)}`);
  }
  return `M ${top.join(" L ")} L ${bottom.join(" L ")} Z`;
}

function timeTicks(durationMs: number): Array<{ ms: number; x: number; label: string }> {
  const ticks: Array<{ ms: number; x: number; label: string }> = [];
  const step = durationMs > 240000 ? 60000 : 30000;
  for (let ms = 0; ms <= durationMs + 1; ms += step) {
    ticks.push({ ms, x: durationMs > 0 ? (ms / durationMs) * 1200 : 0, label: labelMinute(ms) });
  }
  if (ticks[ticks.length - 1]?.ms !== durationMs) {
    ticks.push({ ms: durationMs, x: 1200, label: labelMinute(durationMs) });
  }
  return ticks.slice(0, 8);
}

function labelMinute(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function clientXToMs(clientX: number, svg: SVGSVGElement | null, durationMs: number): number | null {
  if (!svg || durationMs <= 0) return null;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return ratio * durationMs;
}

function updateLoop(
  track: BgmTrack,
  startMs: number,
  endMs: number,
  onLoopChange: Props["onLoopChange"],
  options: { history?: boolean } = {}
): void {
  const durationMs = Math.max(1, track.durationMs);
  const safeStartMs = Math.min(Math.max(0, startMs), durationMs - 1);
  const safeEndMs = Math.min(durationMs, Math.max(safeStartMs + 1, endMs));
  const startSample = msToSample(safeStartMs, track.sampleRate);
  const endSample = msToSample(safeEndMs, track.sampleRate);
  onLoopChange?.(
    {
      startSample,
      endSample,
      lengthSamples: endSample - startSample,
      confidence: null,
      source: "manual"
    },
    options
  );
}

function updateLoopSamples(
  track: BgmTrack,
  startSample: number,
  endSample: number,
  onLoopChange: Props["onLoopChange"],
  options: { history?: boolean } = {}
): void {
  if (!Number.isFinite(startSample) || !Number.isFinite(endSample)) return;
  const durationSamples = Math.max(1, track.durationSamples);
  const safeStartSample = Math.min(Math.max(0, Math.round(startSample)), durationSamples - 1);
  const safeEndSample = Math.min(durationSamples, Math.max(safeStartSample + 1, Math.round(endSample)));
  onLoopChange?.(
    {
      startSample: safeStartSample,
      endSample: safeEndSample,
      lengthSamples: safeEndSample - safeStartSample,
      confidence: null,
      source: "manual"
    },
    options
  );
}
