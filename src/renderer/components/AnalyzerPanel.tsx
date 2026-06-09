import { memo, useEffect, useRef, useState } from "react";
import type { MutableRefObject, ReactElement } from "react";

type ByteArray = Uint8Array<ArrayBufferLike>;

interface Props {
  bgmAnalyser: AnalyserNode | null;
  seAnalyser: AnalyserNode | null;
  bands: number;
  fps: number;
  autoLevel: boolean;
  manualLevel: number;
  voiceCount: number;
  seTransientLevel: number;
  gamingnessEffectStrength: number;
}

interface SpectrumPeakStore {
  bgm: number[];
  se: number[];
  bgmLastAt: number;
  seLastAt: number;
}

interface SpectrumFrameStore {
  bgm: number[];
  se: number[];
  bgmLastAt: number;
  seLastAt: number;
}

interface SpectrumLevelState {
  gain: number;
  lastAt: number;
}

interface SpectrumWorkStore {
  rawBgm: number[];
  rawSe: number[];
  leveledBgm: number[];
  leveledSe: number[];
  smoothedBgm: number[];
  smoothedSe: number[];
  overlapSustain: number[];
  overlapLastAt: number;
}

interface SpectrumGridCache {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  dpr: number;
}

interface CanvasPrepareState {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  measuredAt: number;
}

interface SpectrumXCache {
  width: number;
  bands: number;
  x0: Float32Array;
  x1: Float32Array;
}

interface FrequencyBandCache {
  starts: Int32Array;
  ends: Int32Array;
}

interface AnalyzerPerfMetrics {
  tick: number;
  spectrum: number;
  targetSpectrum: number;
  spectrumDrawMs?: number;
  spectrumFrameGapMaxMs?: number;
  tickFrameGapMaxMs?: number;
  measuredAt: number;
}

declare global {
  interface Window {
    __gamingLooperAnalyzerMetrics?: AnalyzerPerfMetrics;
  }
}

const frequencyLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const frequencyDataCache = new WeakMap<AnalyserNode, ByteArray>();
const canvasPrepareCache = new WeakMap<HTMLCanvasElement, CanvasPrepareState>();
const frequencyBandCache = new Map<string, FrequencyBandCache>();
const CANVAS_SIZE_MEASURE_INTERVAL_MS = 350;
const ANALYZER_MAX_DPR = 1;
const ANALYZER_MAX_BACKING_PIXELS = 260_000;
const ANALYZER_MIN_DPR = 0.65;

export const AnalyzerPanel = memo(function AnalyzerPanel({
  bgmAnalyser,
  seAnalyser,
  bands,
  fps,
  autoLevel,
  manualLevel,
  voiceCount,
  seTransientLevel,
  gamingnessEffectStrength
}: Props): ReactElement {
  const spectrumRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumPeaksRef = useRef<SpectrumPeakStore>({ bgm: [], se: [], bgmLastAt: 0, seLastAt: 0 });
  const spectrumFramesRef = useRef<SpectrumFrameStore>({ bgm: [], se: [], bgmLastAt: 0, seLastAt: 0 });
  const spectrumLevelRef = useRef<SpectrumLevelState>({ gain: 1, lastAt: 0 });
  const spectrumWorkRef = useRef<SpectrumWorkStore>({
    rawBgm: [],
    rawSe: [],
    leveledBgm: [],
    leveledSe: [],
    smoothedBgm: [],
    smoothedSe: [],
    overlapSustain: [],
    overlapLastAt: 0
  });
  const spectrumGridRef = useRef<SpectrumGridCache | null>(null);
  const spectrumXRef = useRef<SpectrumXCache | null>(null);
  const seTransientRef = useRef(seTransientLevel);
  const seSignalActiveRef = useRef(voiceCount > 0);
  const [actualFps, setActualFps] = useState({ spectrum: 0 });

  useEffect(() => {
    seTransientRef.current = seTransientLevel;
  }, [seTransientLevel]);

  useEffect(() => {
    seSignalActiveRef.current = voiceCount > 0;
  }, [voiceCount]);

  useEffect(() => {
    let lastSpectrumAt = 0;
    let spectrumFpsWindowStartedAt = 0;
    let spectrumFpsFrameCount = 0;
    let spectrumDrawMsTotal = 0;
    let spectrumFrameGapMaxMs = 0;
    let lastSpectrumDrawAt = 0;
    let tickFpsWindowStartedAt = 0;
    let tickFrameCount = 0;
    let measuredTickFps = 0;
    let tickFrameGapMaxMs = 0;
    let measuredTickFrameGapMaxMs = 0;
    let lastTickAt = 0;
    let frameId = 0;
    let disposed = false;
    const safeFps = clamp(Math.round(fps), 10, 60);
    const safeBands = clamp(Math.round(bands), 48, 192);
    const spectrumIntervalMs = 1000 / safeFps;
    const tick = (tickNow: number) => {
      if (disposed) return;
      const now = tickNow;
      tickFrameCount += 1;
      if (lastTickAt > 0) {
        tickFrameGapMaxMs = Math.max(tickFrameGapMaxMs, now - lastTickAt);
      }
      lastTickAt = now;
      if (tickFpsWindowStartedAt <= 0) {
        tickFpsWindowStartedAt = now;
      } else if (now - tickFpsWindowStartedAt >= 1000) {
        measuredTickFps = Math.round((tickFrameCount * 1000) / Math.max(1, now - tickFpsWindowStartedAt));
        measuredTickFrameGapMaxMs = tickFrameGapMaxMs;
        tickFpsWindowStartedAt = now;
        tickFrameCount = 0;
        tickFrameGapMaxMs = 0;
      }
      if (now - lastSpectrumAt >= spectrumIntervalMs) {
        lastSpectrumAt = nextFrameClock(lastSpectrumAt, now, spectrumIntervalMs);
        if (lastSpectrumDrawAt > 0) {
          spectrumFrameGapMaxMs = Math.max(spectrumFrameGapMaxMs, now - lastSpectrumDrawAt);
        }
        lastSpectrumDrawAt = now;
        const drawStartedAt = performance.now();
        drawSpectrum(
          spectrumRef.current,
          bgmAnalyser,
          seAnalyser,
          safeBands,
          spectrumPeaksRef.current,
          spectrumFramesRef.current,
          spectrumLevelRef.current,
          spectrumWorkRef.current,
          spectrumGridRef,
          spectrumXRef,
          autoLevel,
          manualLevel,
          seSignalActiveRef.current,
          seTransientRef.current,
          gamingnessEffectStrength,
          now
        );
        spectrumDrawMsTotal += performance.now() - drawStartedAt;
        spectrumFpsFrameCount += 1;
        if (spectrumFpsWindowStartedAt <= 0) {
          spectrumFpsWindowStartedAt = now;
        } else if (now - spectrumFpsWindowStartedAt >= 1000) {
          const measuredFps = Math.round((spectrumFpsFrameCount * 1000) / Math.max(1, now - spectrumFpsWindowStartedAt));
          const spectrumDrawMs = Math.round((spectrumDrawMsTotal / Math.max(1, spectrumFpsFrameCount)) * 10) / 10;
          publishAnalyzerPerfMetrics({
            tick: measuredTickFps,
            spectrum: measuredFps,
            targetSpectrum: safeFps,
            spectrumDrawMs,
            spectrumFrameGapMaxMs: Math.round(spectrumFrameGapMaxMs * 10) / 10,
            tickFrameGapMaxMs: Math.round(measuredTickFrameGapMaxMs * 10) / 10,
            measuredAt: performance.now()
          });
          setActualFps((previous) => (previous.spectrum === measuredFps ? previous : { ...previous, spectrum: measuredFps }));
          spectrumFpsWindowStartedAt = now;
          spectrumFpsFrameCount = 0;
          spectrumDrawMsTotal = 0;
          spectrumFrameGapMaxMs = 0;
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [bgmAnalyser, seAnalyser, bands, fps, autoLevel, manualLevel, gamingnessEffectStrength]);

  const safeDisplayFps = clamp(Math.round(fps), 10, 60);
  const fpsText = `S ${actualFps.spectrum > 0 ? actualFps.spectrum : "--"}/${safeDisplayFps} FPS`;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    publishAnalyzerPerfMetrics({
      tick: window.__gamingLooperAnalyzerMetrics?.tick ?? 0,
      spectrum: actualFps.spectrum,
      targetSpectrum: safeDisplayFps,
      spectrumDrawMs: window.__gamingLooperAnalyzerMetrics?.spectrumDrawMs,
      spectrumFrameGapMaxMs: window.__gamingLooperAnalyzerMetrics?.spectrumFrameGapMaxMs,
      tickFrameGapMaxMs: window.__gamingLooperAnalyzerMetrics?.tickFrameGapMaxMs,
      measuredAt: performance.now()
    });
  }, [actualFps, safeDisplayFps]);

  return (
    <section className="panel analysis-panel">
      <div className="analysis-header">
        <div className="analysis-legend">
          <span className="analysis-fps">{fpsText}</span>
          <span><i className="legend-bgm" />BGM</span>
          <span><i className="legend-se" />SE</span>
          <span><i className="legend-overlap" />Overlap</span>
        </div>
      </div>
      <div className="analysis-grid">
        <canvas ref={spectrumRef} className="spectrum-canvas" />
      </div>
    </section>
  );
});

function publishAnalyzerPerfMetrics(metrics: AnalyzerPerfMetrics): void {
  if (!import.meta.env.DEV) return;
  window.__gamingLooperAnalyzerMetrics = metrics;
}

function nextFrameClock(previous: number, now: number, intervalMs: number): number {
  const elapsed = now - previous;
  if (previous <= 0 || elapsed > intervalMs * 4) return now;
  return now - (elapsed % intervalMs);
}

function drawSpectrum(
  canvas: HTMLCanvasElement | null,
  bgm: AnalyserNode | null,
  se: AnalyserNode | null,
  bands: number,
  peaks: SpectrumPeakStore,
  frames: SpectrumFrameStore,
  levelState: SpectrumLevelState,
  work: SpectrumWorkStore,
  gridCache: MutableRefObject<SpectrumGridCache | null>,
  xCache: MutableRefObject<SpectrumXCache | null>,
  autoLevel: boolean,
  manualLevel: number,
  seSignalActive: boolean,
  seTransientLevel: number,
  gamingnessEffectStrength: number,
  now: number
): void {
  const prepared = prepareCanvas(canvas);
  if (!prepared) return;
  const { ctx, width, height, dpr } = prepared;
  const plotTop = 20;
  const plotBottom = height - 24;
  const plotHeight = Math.max(1, plotBottom - plotTop);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080807";
  ctx.fillRect(0, 0, width, height);

  drawCachedFrequencyGrid(ctx, width, height, dpr, gridCache);

  readFrequencyBandsInto(bgm, bands, work.rawBgm);
  if (seSignalActive || seTransientLevel > 0.002) {
    readFrequencyBandsInto(se, bands, work.rawSe);
  } else {
    ensureNumberArray(work.rawSe, bands);
    fillNumberArray(work.rawSe, 0);
  }
  applySeTransientPulseInPlace(work.rawSe, seTransientLevel);
  const heldBgmData = applyPeakHold(work.rawBgm, peaks, "bgm", now);
  const heldSeData = applyPeakHold(work.rawSe, peaks, "se", now);
  applySpectrumLevelingInto(heldBgmData, heldSeData, levelState, autoLevel, manualLevel, now, work.leveledBgm, work.leveledSe);
  smoothSeriesInto(work.leveledBgm, work.smoothedBgm);
  smoothSeriesInto(work.leveledSe, work.smoothedSe);
  const bgmData = smoothSpectrumFrame(work.smoothedBgm, frames, "bgm", now);
  const seData = smoothSpectrumFrame(work.smoothedSe, frames, "se", now);

  drawSpectrumBars(ctx, bgmData, seData, width, plotBottom, plotHeight, xCache, work, gamingnessEffectStrength, now);
}

function drawCachedFrequencyGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  cacheRef: MutableRefObject<SpectrumGridCache | null>
): void {
  const cached = cacheRef.current;
  if (!cached || cached.width !== width || cached.height !== height || cached.dpr !== dpr) {
    const gridCanvas = document.createElement("canvas");
    gridCanvas.width = Math.max(1, Math.floor(width * dpr));
    gridCanvas.height = Math.max(1, Math.floor(height * dpr));
    const gridCtx = gridCanvas.getContext("2d");
    if (gridCtx) {
      gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintFrequencyGrid(gridCtx, width, height);
    }
    cacheRef.current = { canvas: gridCanvas, width, height, dpr };
  }
  const grid = cacheRef.current;
  if (grid) {
    ctx.drawImage(grid.canvas, 0, 0, width, height);
  }
}

function paintFrequencyGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = "rgba(214, 181, 144, 0.12)";
  ctx.fillStyle = "rgba(220, 205, 188, 0.48)";
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.lineWidth = 1;
  for (const frequency of frequencyLabels) {
    const x = logX(frequency, width);
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x, height - 23);
    ctx.stroke();
    const label = frequency >= 1000 ? `${frequency / 1000}${frequency === 20000 ? "kHz" : "k"}` : `${frequency}`;
    ctx.fillText(label, Math.min(width - 34, x + 3), height - 7);
  }
}

function readFrequencyBandsInto(analyser: AnalyserNode | null, bands: number, values: number[]): void {
  ensureNumberArray(values, bands);
  if (!analyser) {
    fillNumberArray(values, 0);
    return;
  }
  let data = frequencyDataCache.get(analyser);
  if (!data || data.length !== analyser.frequencyBinCount) {
    data = new Uint8Array(analyser.frequencyBinCount);
    frequencyDataCache.set(analyser, data);
  }
  analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
  const sampleRate = analyser.context.sampleRate;
  const bins = getFrequencyBandCache(bands, data.length, sampleRate);
  for (let i = 0; i < bands; i += 1) {
    const b0 = bins.starts[i] ?? 0;
    const b1 = bins.ends[i] ?? b0;
    let peak = 0;
    for (let bin = b0; bin <= b1; bin += 1) {
      peak = Math.max(peak, data[bin] ?? 0);
    }
    values[i] = peak / 255;
  }
}

function getFrequencyBandCache(bands: number, binCount: number, sampleRate: number): FrequencyBandCache {
  const key = `${bands}:${binCount}:${sampleRate}`;
  const cached = frequencyBandCache.get(key);
  if (cached) return cached;
  const starts = new Int32Array(bands);
  const ends = new Int32Array(bands);
  for (let i = 0; i < bands; i += 1) {
    const f0 = 20 * (20000 / 20) ** (i / bands);
    const f1 = 20 * (20000 / 20) ** ((i + 1) / bands);
    starts[i] = Math.max(0, Math.floor((f0 / (sampleRate / 2)) * binCount));
    ends[i] = Math.min(binCount - 1, Math.ceil((f1 / (sampleRate / 2)) * binCount));
  }
  const next = { starts, ends };
  frequencyBandCache.set(key, next);
  return next;
}

function drawSpectrumBars(
  ctx: CanvasRenderingContext2D,
  bgmData: number[],
  seData: number[],
  width: number,
  plotBottom: number,
  plotHeight: number,
  xCache: MutableRefObject<SpectrumXCache | null>,
  work: SpectrumWorkStore,
  gamingnessEffectStrength: number,
  now: number
): void {
  const positions = getSpectrumXCache(width, bgmData.length, xCache);
  ensureNumberArray(work.overlapSustain, bgmData.length);
  const elapsedSeconds = work.overlapLastAt > 0 ? clamp((now - work.overlapLastAt) / 1000, 0, 0.25) : 0;
  work.overlapLastAt = now;
  const attack = elapsedSeconds <= 0 ? 0.16 : Math.min(0.32, elapsedSeconds * 1.6);
  const release = elapsedSeconds <= 0 ? 0.88 : Math.max(0.62, 1 - elapsedSeconds * 2.2);
  const gamingness = clamp(gamingnessEffectStrength, 0, 1);
  const gamingnessPulse = gamingness > 0 ? gamingness * (0.78 + Math.sin(now / 520) * 0.22) : 0;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  for (let i = 0; i < bgmData.length; i += 1) {
    const bgm = bgmData[i] ?? 0;
    const se = seData[i] ?? 0;
    const overlap = Math.min(bgm, se);
    const x0 = positions.x0[i] ?? 0;
    const x1 = positions.x1[i] ?? x0 + 1;
    const gap = x1 - x0 > 3 ? 1 : 0.35;
    const barX = x0 + gap / 2;
    const barWidth = Math.max(1, x1 - x0 - gap);
    const bgmHeight = bgm * plotHeight;
    const seHeight = se * plotHeight;
    const hue = (i / Math.max(1, bgmData.length - 1)) * 240 + (now / 90) % 42;
    if (bgmHeight > 0.7) {
      ctx.fillStyle = "rgba(132, 118, 102, 0.46)";
      ctx.fillRect(barX, plotBottom - bgmHeight, barWidth, bgmHeight);
      if (gamingnessPulse > 0) {
        ctx.shadowBlur = 8 + gamingnessPulse * 22;
        ctx.shadowColor = `hsla(${hue}, 96%, 66%, ${0.1 + gamingnessPulse * 0.26})`;
        ctx.fillStyle = `hsla(${hue}, 94%, ${60 + gamingnessPulse * 10}%, ${gamingnessPulse * 0.34})`;
        ctx.fillRect(barX, plotBottom - bgmHeight, barWidth, bgmHeight);
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
      }
    }
    const innerBarWidth = Math.max(1.2, barWidth * 0.56);
    const innerBarX = barX + (barWidth - innerBarWidth) / 2;
    if (seHeight > 0.7) {
      ctx.fillStyle = "rgba(230, 222, 212, 0.62)";
      ctx.fillRect(innerBarX, plotBottom - seHeight, innerBarWidth, seHeight);
      if (gamingnessPulse > 0) {
        ctx.shadowBlur = 6 + gamingnessPulse * 18;
        ctx.shadowColor = `hsla(${(hue + 68) % 360}, 96%, 72%, ${0.08 + gamingnessPulse * 0.2})`;
        ctx.fillStyle = `hsla(${(hue + 68) % 360}, 90%, ${68 + gamingnessPulse * 8}%, ${gamingnessPulse * 0.24})`;
        ctx.fillRect(innerBarX, plotBottom - seHeight, innerBarWidth, seHeight);
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
      }
    }

    const seShare = se / Math.max(0.001, bgm + se);
    const closeness = clamp(1 - Math.abs(se - bgm) / 0.34, 0, 1);
    const seDominance = clamp((se - bgm * 0.62) / 0.58, 0, 1);
    const instantCandidate = overlap > 0.045 ? Math.pow(closeness, 1.65) * Math.pow(clamp(overlap / 0.72, 0, 1), 0.72) : 0;
    const previousSustain = work.overlapSustain[i] ?? 0;
    const sustain = instantCandidate > 0
      ? clamp(previousSustain * release + instantCandidate * attack, 0, 1)
      : previousSustain * release;
    work.overlapSustain[i] = sustain;
    const intensity = clamp(Math.pow(instantCandidate, 1.25) * 0.48 + Math.pow(sustain, 0.72) * 0.88 + seDominance * 0.34, 0, 1);
    if (intensity < 0.04) continue;

    const overlapHeight = overlap * plotHeight;
    const alpha = clamp(Math.pow(intensity, 2.1) * 0.95, 0.035, 0.95);
    const red = Math.round(196 + intensity * 58);
    const green = Math.round(92 + (1 - intensity) * 62 - seShare * 24);
    const blue = Math.round(32 + (1 - intensity) * 34);
    ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    ctx.fillRect(innerBarX, plotBottom - overlapHeight, innerBarWidth, overlapHeight);
  }
  ctx.restore();
}

function getSpectrumXCache(width: number, bands: number, cacheRef: MutableRefObject<SpectrumXCache | null>): SpectrumXCache {
  const cached = cacheRef.current;
  if (cached && cached.width === width && cached.bands === bands) return cached;
  const x0 = new Float32Array(bands);
  const x1 = new Float32Array(bands);
  for (let i = 0; i < bands; i += 1) {
    const f0 = 20 * (20000 / 20) ** (i / bands);
    const f1 = 20 * (20000 / 20) ** ((i + 1) / bands);
    x0[i] = logX(f0, width);
    x1[i] = logX(f1, width);
  }
  const next = { width, bands, x0, x1 };
  cacheRef.current = next;
  return next;
}

function smoothSeriesInto(values: number[], output: number[]): void {
  ensureNumberArray(output, values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    const previous = values[index - 1] ?? value;
    const next = values[index + 1] ?? value;
    output[index] = previous * 0.22 + value * 0.56 + next * 0.22;
  }
}

function applyPeakHold(values: number[], peaks: SpectrumPeakStore, key: "bgm" | "se", now: number): number[] {
  if (peaks[key].length !== values.length) {
    peaks[key] = new Array(values.length).fill(0);
  }
  const output = peaks[key];
  const lastAtKey = key === "bgm" ? "bgmLastAt" : "seLastAt";
  const elapsedFrames = peaks[lastAtKey] > 0 ? Math.max(1, (now - peaks[lastAtKey]) / (1000 / 30)) : 1;
  const decay = Math.pow(key === "se" ? 0.82 : 0.88, elapsedFrames);
  for (let index = 0; index < values.length; index += 1) {
    const previous = output[index] ?? 0;
    output[index] = Math.max(values[index] ?? 0, previous * decay);
  }
  peaks[lastAtKey] = now;
  return output;
}

function smoothSpectrumFrame(values: number[], frames: SpectrumFrameStore, key: "bgm" | "se", now: number): number[] {
  const lastAtKey = key === "bgm" ? "bgmLastAt" : "seLastAt";
  if (frames[key].length !== values.length || frames[lastAtKey] <= 0) {
    frames[key] = [...values];
    frames[lastAtKey] = now;
    return frames[key];
  }
  const output = frames[key];
  const elapsedSec = clamp((now - frames[lastAtKey]) / 1000, 0.001, 0.12);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    const before = output[index] ?? value;
    const speed = value > before ? (key === "se" ? 18 : 10) : key === "se" ? 7.5 : 4.8;
    const alpha = 1 - Math.exp(-elapsedSec * speed);
    output[index] = before + (value - before) * alpha;
  }
  frames[lastAtKey] = now;
  return output;
}

function applySeTransientPulseInPlace(values: number[], seTransientLevel: number): void {
  const pulse = clamp(seTransientLevel, 0, 1);
  if (pulse <= 0.002) return;
  for (let index = 0; index < values.length; index += 1) {
    const normalized = values.length <= 1 ? 0 : index / (values.length - 1);
    const highBandBias = 0.35 + normalized * 0.45;
    const clickFloor = pulse * highBandBias * 0.58;
    values[index] = Math.max(values[index] ?? 0, clickFloor);
  }
}

function applySpectrumLevelingInto(
  bgmData: number[],
  seData: number[],
  state: SpectrumLevelState,
  autoLevel: boolean,
  manualLevel: number,
  now: number,
  outputBgm: number[],
  outputSe: number[]
): void {
  ensureNumberArray(outputBgm, bgmData.length);
  ensureNumberArray(outputSe, seData.length);
  const manualGain = clamp(Number.isFinite(manualLevel) ? manualLevel : 1, 0.25, 4);
  let gain = manualGain;

  if (autoLevel) {
    const peak = Math.max(getSeriesPeak(bgmData), getSeriesPeak(seData));
    const targetPeak = 0.72;
    const targetGain = peak < 0.006 ? 1 : clamp(targetPeak / peak, 0.28, 4);
    const elapsedSec = state.lastAt > 0 ? clamp((now - state.lastAt) / 1000, 0.001, 0.25) : 1 / 30;
    const responseSpeed = targetGain < state.gain ? 10 : 2.8;
    const alpha = 1 - Math.exp(-elapsedSec * responseSpeed);
    state.gain += (targetGain - state.gain) * alpha;
    state.lastAt = now;
    gain = state.gain;
  } else {
    state.gain = manualGain;
    state.lastAt = now;
  }

  for (let index = 0; index < bgmData.length; index += 1) {
    outputBgm[index] = clamp((bgmData[index] ?? 0) * gain, 0, 1);
  }
  for (let index = 0; index < seData.length; index += 1) {
    outputSe[index] = clamp((seData[index] ?? 0) * gain, 0, 1);
  }
}

function getSeriesPeak(values: number[]): number {
  let peak = 0;
  for (const value of values) {
    if (value > peak) peak = value;
  }
  return peak;
}

function ensureNumberArray(values: number[], length: number): void {
  if (values.length !== length) values.length = length;
}

function fillNumberArray(values: number[], value: number): void {
  for (let index = 0; index < values.length; index += 1) {
    values[index] = value;
  }
}

function getByteWaveRms(data: ByteArray): number {
  let sum = 0;
  for (const value of data) {
    const centered = (value - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / Math.max(1, data.length));
}

function logX(frequency: number, width: number): number {
  const min = Math.log10(20);
  const max = Math.log10(20000);
  return ((Math.log10(frequency) - min) / (max - min)) * width;
}

function prepareCanvas(canvas: HTMLCanvasElement | null): { ctx: CanvasRenderingContext2D; width: number; height: number; dpr: number } | null {
  if (!canvas) return null;
  const now = performance.now();
  let state = canvasPrepareCache.get(canvas);
  if (!state || now - state.measuredAt >= CANVAS_SIZE_MEASURE_INTERVAL_MS) {
    const ctx = state?.ctx ?? canvas.getContext("2d");
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const deviceDpr = Math.max(1, Math.min(ANALYZER_MAX_DPR, window.devicePixelRatio || 1));
    const pixelDpr = Math.sqrt(ANALYZER_MAX_BACKING_PIXELS / Math.max(1, width * height));
    const targetDpr = Math.max(ANALYZER_MIN_DPR, Math.min(deviceDpr, pixelDpr));
    state = {
      ctx,
      width,
      height,
      dpr: targetDpr,
      measuredAt: now
    };
    canvasPrepareCache.set(canvas, state);
  }
  const { ctx, width, height, dpr } = state;
  const backingWidth = Math.max(1, Math.floor(width * dpr));
  const backingHeight = Math.max(1, Math.floor(height * dpr));
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  return { ctx, width, height, dpr };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
