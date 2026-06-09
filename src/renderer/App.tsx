import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactElement, WheelEvent as ReactWheelEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ALargeSmall,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileMusic,
  FolderOpen,
  Hammer,
  Library,
  ListMusic,
  ListOrdered,
  Languages,
  Music2,
  Play,
  Repeat,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Undo2,
  Redo2,
  Upload
} from "lucide-react";
import type {
  BgmTrack,
  DetectionResult,
  DetectionSettings,
  GamingProject,
  LoopMarker,
  PlaylistEndBehavior,
  PlaylistItem,
  PlaylistRule,
  SavedPlaylist,
  SavedSeSet,
  SeAssignment,
  SeFile,
  SeIconId,
  SeKey,
  SequenceFile,
  SeSetFile,
  UiLanguage,
  UiSettings
} from "../shared/types.js";
import { formatTimeSeconds, msToSample, roundDownToSecondMs, sampleToMs } from "../shared/format.js";
import {
  calculateListBuildExpAward,
  calculateLoadExpOverflowTotalBonus,
  calculateSePlaybackExpAward,
  listRegistrationExpAward,
  loadExpOverflowBonusMax
} from "../shared/loadExp.js";
import { getEnabledPlaylistItems, insertPlaylistItemAt, reorderPlaylistItems } from "../shared/playlistOrder.js";
import {
  getNextPlaylistIndex,
  getPlaylistDurationInputMs as calculatePlaylistDurationInputMs,
  getPlaylistFadeMs as calculatePlaylistFadeMs,
  getPlaylistFadeStartMs,
  getPlaylistMinimumDurationMs as calculatePlaylistMinimumDurationMs,
  getPlaylistPlayMs as calculatePlaylistPlayMs,
  getPlaylistTransitionDelayMs,
  getRuleFadeMs as calculateRuleFadeMs
} from "../shared/playlistTiming.js";
import {
  createEmptyProject,
  deepDetectionSettings,
  defaultDetectionSettings,
  defaultMix,
  defaultPlaylistDurationMs,
  defaultPlaylistLoopCount,
  defaultUi,
  defaultVisual,
  isLegacyVgostDetectionSettings,
  makePlaylistItem,
  normalDetectionSettings,
  vgostDetectionSettings
} from "../shared/project.js";
import { clearVisibleSourceTracks } from "../shared/sourceClear.js";
import { compactFileName, createDefaultSeAssignments, cycleSeIconId, inferNewSeAssignmentColorId, inferSeColorId, inferSeIconId, seKeyRows, seKeys } from "../shared/seIcons.js";
import { AudioEngine } from "./audio/AudioEngine.js";
import type { AudioDebugSnapshot, SePreloadProgress, SePreloadStatus } from "./audio/AudioEngine.js";
import { detectTrackWithWebAudio } from "./audio/detectInRenderer.js";
import { loadWaveformWithWebAudio } from "./audio/waveform.js";
import { AnalyzerPanel } from "./components/AnalyzerPanel.js";
import { SeIcon } from "./components/SeIcon.js";
import { SePad } from "./components/SePad.js";
import { WaveformView } from "./components/WaveformView.js";
import { createTranslator, getHelpSections, getShortcutRows, translateStatus } from "./i18n.js";
import type { TextKey, Translator } from "./i18n.js";
import { createPositionStore } from "./positionStore.js";
import type { PositionStore } from "./positionStore.js";
import {
  PLAYLIST_ITEM_DRAG_TYPE,
  SOURCE_TRACK_DRAG_TYPE,
  SOURCE_TRACKS_DRAG_TYPE,
  filterSourceDragDropIds,
  hasSourceTrackDragType,
  parseSourceTrackDragIds,
  selectSourceDragTrackIds,
  shouldLockSourceDragToCardMove,
  shouldSwitchSourceDragToRangeSelection
} from "./sequenceDrag.js";
import { filterAndSortSourceTracks } from "./sourceSearch.js";
import "./styles.css";

const noopUnsubscribe = () => undefined;
const BGM_POSITION_UI_INTERVAL_MS = 50;
const SE_POSITION_UI_INTERVAL_MS = 66;
const PLAYBACK_UI_POLL_INTERVAL_MS = 50;
const POSITION_RESET_EPSILON_MS = 1;
const LOOP_END_PREVIEW_MIN_PREROLL_MS = 50;
const PERF_BGM_FILE_PATH = "__gaminglooper_perf_bgm.wav";
const SE_PAD_PROBE_FILE_PATH = "__gaminglooper_sepad_probe.wav";
const PERF_BGM_DURATION_SEC = 30;
const README_SEEN_STORAGE_KEY = "gaminglooper:readme-seen:v1";
let perfBgmAudioBufferCache: ArrayBuffer | null = null;
let sePadProbeAudioBufferCache: ArrayBuffer | null = null;
type DataFolderKind = "sequence" | "se-set";
interface DataFolderInfo {
  sequencePath: string | null;
  seSetPath: string | null;
}

function installBrowserPreviewGamingLooperApi(): void {
  const target = window as Window & { gamingLooper?: Window["gamingLooper"] };
  if (target.gamingLooper) return;
  if (!import.meta.env.DEV || !["localhost", "127.0.0.1"].includes(window.location.hostname)) return;

  target.gamingLooper = {
    importBgmFiles: async () => ({ tracks: [], errors: [] }),
    importSeFiles: async () => ({ files: [], errors: [] }),
    importDroppedBgmPaths: async () => ({ tracks: [], errors: [] }),
    importDroppedSePaths: async () => ({ files: [], errors: [] }),
    readAudioFile: async (filePath) => {
      if (filePath === PERF_BGM_FILE_PATH) {
        perfBgmAudioBufferCache ??= createPerformanceProbeWav();
        return perfBgmAudioBufferCache.slice(0);
      }
      if (filePath === SE_PAD_PROBE_FILE_PATH) {
        sePadProbeAudioBufferCache ??= createSePadProbeWav();
        return sePadProbeAudioBufferCache.slice(0);
      }
      return new ArrayBuffer(0);
    },
    detectBgmTracks: async (tracks) =>
      tracks.map((track) => ({
        id: track.id,
        loop: track.loop,
        status: track.status,
        validation: track.validation
      })),
    loadProject: async () => (isPerformanceProbeMode() ? createPerformanceProbeProject() : isSePadProbeMode() ? createSePadProbeProject() : null),
    saveProject: async () => ({ path: "browser-preview", canceled: false }),
    saveProjectAs: async () => ({ path: "browser-preview", canceled: false }),
    getProjectStoreInfo: async () => ({ path: "browser-preview" }),
    getDataFolderInfo: async () => ({ sequencePath: null, seSetPath: null }),
    selectDataFolder: async () => ({ path: "browser-preview", canceled: false }),
    openDataFolder: async () => ({ ok: false, error: "Electron API unavailable in browser preview." }),
    clearProjectStoreLocation: async () => ({ path: null }),
    openProjectStoreFolder: async () => ({ ok: false, error: "Electron API unavailable in browser preview." }),
    exportProjectBackup: async () => null,
    importProjectBackup: async () => null,
    exportSequenceFile: async () => null,
    importSequenceFile: async () => null,
    exportSeSetFile: async () => null,
    importSeSetFile: async () => null,
    setProjectDirty: () => undefined,
    setSequenceUpdatePending: () => undefined,
    setWindowCloseGuard: () => undefined,
    verifyHashes: async (refs) =>
      refs.map((ref) => ({
        path: ref.path,
        name: ref.name,
        ok: false,
        before: ref.sha256,
        after: null,
        error: "Electron API unavailable in browser preview."
    })),
    selectAudioRoot: async () => null,
    setMenuLanguage: async (language) => language,
    windowCommand: async () => undefined,
    reportPerformanceProbe: async () => undefined,
    onDroppedFilesImported: () => noopUnsubscribe,
    onDroppedSeFilesImported: () => noopUnsubscribe,
    onFileDragStateChanged: () => noopUnsubscribe,
    onDroppedFilesImportStateChanged: () => noopUnsubscribe,
    onImportBgmRequested: () => noopUnsubscribe,
    onImportSeRequested: () => noopUnsubscribe,
    onSaveProjectRequested: () => noopUnsubscribe,
    onOpenSaveFolderRequested: () => noopUnsubscribe,
    onExportBackupRequested: () => noopUnsubscribe,
    onImportBackupRequested: () => noopUnsubscribe,
    onLoadProjectRequested: () => noopUnsubscribe,
    onResetProjectRequested: () => noopUnsubscribe,
    onUndoProjectRequested: () => noopUnsubscribe,
    onRedoProjectRequested: () => noopUnsubscribe,
    onOpenHelpRequested: () => noopUnsubscribe,
    onOpenShortcutsRequested: () => noopUnsubscribe,
    onCloseActiveModalRequested: () => noopUnsubscribe,
    onDebugModeToggleRequested: () => noopUnsubscribe,
    onSaveBeforeCloseRequested: () => noopUnsubscribe,
    onBeforeCloseCheckRequested: () => noopUnsubscribe,
    completeSaveBeforeClose: () => undefined,
    completeBeforeCloseCheck: () => undefined
  };
}

installBrowserPreviewGamingLooperApi();
installPerformanceProbeGamingLooperApi();

function isPerformanceProbeMode(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has("perf");
}

function isSePadProbeMode(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has("sepad-probe");
}

function isPerformanceProbeAutoplayMode(): boolean {
  return isPerformanceProbeMode() && new URLSearchParams(window.location.search).has("autoplay");
}

function isPerformanceProbePositionOff(): boolean {
  return isPerformanceProbeMode() && new URLSearchParams(window.location.search).get("position") === "0";
}

function isPerformanceProbeTimeOff(): boolean {
  return isPerformanceProbeMode() && new URLSearchParams(window.location.search).get("time") === "0";
}

function installPerformanceProbeGamingLooperApi(): void {
  if (!isPerformanceProbeMode()) return;
  const descriptor = Object.getOwnPropertyDescriptor(window, "gamingLooper");
  if (descriptor && descriptor.writable === false && !descriptor.set) return;
  const original = window.gamingLooper;
  window.gamingLooper = {
    ...original,
    loadProject: async () => createPerformanceProbeProject(),
    readAudioFile: async (filePath) => {
      if (filePath === PERF_BGM_FILE_PATH) {
        perfBgmAudioBufferCache ??= createPerformanceProbeWav();
        return perfBgmAudioBufferCache.slice(0);
      }
      return original.readAudioFile(filePath);
    },
    saveProject: async () => ({ path: "performance-probe", canceled: false }),
    saveProjectAs: async () => ({ path: "performance-probe", canceled: false }),
    setProjectDirty: () => undefined,
    setSequenceUpdatePending: () => undefined
  };
}

function createPerformanceProbeProject(): GamingProject {
  const project = createEmptyProject();
  const sampleRate = 48000;
  const durationMs = PERF_BGM_DURATION_SEC * 1000;
  const durationSamples = sampleRate * PERF_BGM_DURATION_SEC;
  const loopStartSample = sampleRate * 4;
  const loopEndSample = sampleRate * 24;
  const track: BgmTrack = {
    id: "perf-bgm-track",
    filePath: PERF_BGM_FILE_PATH,
    fileName: "Performance Probe BGM.wav",
    file: {
      path: PERF_BGM_FILE_PATH,
      name: "Performance Probe BGM.wav",
      size: createPerformanceProbeWav().byteLength,
      mtimeMs: 0,
      sha256: "perf-probe"
    },
    format: "wav",
    sampleRate,
    bitDepth: 16,
    channels: 2,
    durationSamples,
    durationMs,
    volume: 1,
    loop: {
      startSample: loopStartSample,
      endSample: loopEndSample,
      lengthSamples: loopEndSample - loopStartSample,
      confidence: 100,
      source: "detected"
    },
    status: "detected",
    validation: "Performance probe",
    waveform: createPerformanceProbeWaveform()
  };
  project.selectedTrackId = track.id;
  project.bgmTracks = [track];
  project.playlistCreated = true;
  project.playlist = [makePlaylistItem(track.id, 0)];
  project.visual = {
    ...project.visual,
    analyzerFps: 30,
    analyzerBands: 112,
    potatoMode: false
  };
  return project;
}

function createSePadProbeProject(): GamingProject {
  const project = createEmptyProject();
  const file: SeFile = {
    id: "sepad-probe-file",
    filePath: SE_PAD_PROBE_FILE_PATH,
    fileName: "SE Pad Probe.wav",
    file: {
      path: SE_PAD_PROBE_FILE_PATH,
      name: "SE Pad Probe.wav",
      size: createSePadProbeWav().byteLength,
      mtimeMs: 0,
      sha256: "sepad-probe"
    },
    format: "wav",
    sampleRate: 48000,
    channels: 1,
    durationMs: 240,
    waveform: createSePadProbeWaveform()
  };

  project.activeSeSetName = "SE Pad Probe";
  project.seAssignments = createDefaultSeAssignments().map((assignment) => {
    if (assignment.key === "Q") {
      return { ...assignment, file, iconId: "hit", iconSource: "manual" as const, colorId: "amber" as const, volume: 1, pan: -0.2 };
    }
    if (assignment.key === "E") {
      return { ...assignment, file: { ...file, id: "sepad-probe-file-e", fileName: "SE Pad Probe Copy.wav" }, iconId: "spark", iconSource: "manual" as const, colorId: "cyan" as const, volume: 0.9, pan: 0.25 };
    }
    return assignment;
  });
  project.mix = {
    ...project.mix,
    seVoiceLimit: 16
  };
  return project;
}

function createSePadProbeWaveform() {
  const resolution = 96;
  const min: number[] = [];
  const max: number[] = [];
  for (let index = 0; index < resolution; index += 1) {
    const phase = index / resolution;
    const envelope = Math.max(0.05, 1 - phase);
    const amp = envelope * (0.38 + Math.sin(phase * Math.PI * 20) * 0.08);
    min.push(-amp);
    max.push(amp);
  }
  return {
    resolution,
    channels: [{ min, max }]
  };
}

function createPerformanceProbeWaveform() {
  const resolution = 720;
  const min: number[] = [];
  const max: number[] = [];
  for (let index = 0; index < resolution; index += 1) {
    const phase = index / resolution;
    const amp = 0.26 + Math.sin(phase * Math.PI * 18) * 0.07 + Math.sin(phase * Math.PI * 52) * 0.035;
    const safeAmp = Math.max(0.08, Math.min(0.88, amp));
    min.push(-safeAmp);
    max.push(safeAmp);
  }
  return {
    resolution,
    channels: [
      { min, max },
      { min: [...min], max: [...max] }
    ]
  };
}

function createPerformanceProbeWav(): ArrayBuffer {
  const sampleRate = 48000;
  const channels = 2;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const frameCount = sampleRate * PERF_BGM_DURATION_SEC;
  const dataSize = frameCount * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const t = frame / sampleRate;
    const envelope = 0.62 + Math.sin(t * Math.PI * 0.9) * 0.12;
    const left =
      Math.sin(t * Math.PI * 2 * 92) * 0.34 +
      Math.sin(t * Math.PI * 2 * 247) * 0.2 +
      Math.sin(t * Math.PI * 2 * 1370) * 0.08;
    const right =
      Math.sin(t * Math.PI * 2 * 96) * 0.32 +
      Math.sin(t * Math.PI * 2 * 330) * 0.17 +
      Math.sin(t * Math.PI * 2 * 2210) * 0.07;
    view.setInt16(offset, clampPcm16(left * envelope), true);
    offset += 2;
    view.setInt16(offset, clampPcm16(right * envelope), true);
    offset += 2;
  }
  return buffer;
}

function createSePadProbeWav(): ArrayBuffer {
  const sampleRate = 48000;
  const channels = 1;
  const bitDepth = 16;
  const durationSec = 0.24;
  const bytesPerSample = bitDepth / 8;
  const frameCount = Math.round(sampleRate * durationSec);
  const dataSize = frameCount * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const t = frame / sampleRate;
    const envelope = Math.max(0, 1 - frame / frameCount);
    const tone = Math.sin(t * Math.PI * 2 * 880) * 0.38 + Math.sin(t * Math.PI * 2 * 1760) * 0.12;
    view.setInt16(offset, clampPcm16(tone * envelope), true);
    offset += 2;
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function clampPcm16(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
}

function averageNumbers(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function createUiPerfMetrics(): UiPerfMutableState {
  const now = performance.now();
  return {
    startedAtMs: Math.round(now),
    measuredAtMs: Math.round(now),
    elapsedMs: 0,
    frameCount: 0,
    measuredFps: 0,
    averageFrameMs: 0,
    maxFrameMs: 0,
    p95FrameMs: 0,
    p99FrameMs: 0,
    longFrameCount: 0,
    veryLongFrameCount: 0,
    longTaskCount: 0,
    longTaskTotalMs: 0,
    longTaskMaxMs: 0,
    longFrameSamples: [],
    longTaskSamples: [],
    positionPollCount: 0,
    positionPollAverageMs: 0,
    positionPollMaxMs: 0,
    positionPublishCount: 0,
    positionPublishFps: 0,
    positionPublishLastGapMs: 0,
    positionPublishMaxGapMs: 0,
    playbackMode: "stopped",
    bgmPlaying: false,
    frameDeltas: [],
    lastPositionPublishAtMs: 0,
    lastLongFrameAtMs: 0,
    positionPollTotalMs: 0
  };
}

function recordUiFrame(metrics: UiPerfMutableState, frameMs: number, playback: PlaybackState): void {
  if (frameMs > 0) {
    metrics.frameDeltas.push(frameMs);
    if (metrics.frameDeltas.length > 240) metrics.frameDeltas.shift();
    metrics.frameCount += 1;
    metrics.maxFrameMs = Math.max(metrics.maxFrameMs, frameMs);
    if (frameMs >= 50) {
      metrics.longFrameCount += 1;
      const now = performance.now();
      const sample = {
        atMs: Math.round(now - metrics.startedAtMs),
        frameMs: roundMetric(frameMs),
        gapMs: metrics.lastLongFrameAtMs > 0 ? Math.round(now - metrics.lastLongFrameAtMs) : 0
      };
      metrics.longFrameSamples.push(sample);
      if (metrics.longFrameSamples.length > 16) metrics.longFrameSamples.shift();
      metrics.lastLongFrameAtMs = now;
    }
    if (frameMs >= 100) metrics.veryLongFrameCount += 1;
  }
  publishUiPerfMetrics(metrics, playback);
}

function recordUiPositionPoll(metrics: UiPerfMutableState | null, durationMs: number): void {
  if (!metrics) return;
  metrics.positionPollCount += 1;
  metrics.positionPollTotalMs += durationMs;
  metrics.positionPollMaxMs = Math.max(metrics.positionPollMaxMs, durationMs);
}

function recordUiPositionPublish(metrics: UiPerfMutableState | null, now: number, playback: PlaybackState): void {
  if (!metrics) return;
  metrics.positionPublishCount += 1;
  if (metrics.lastPositionPublishAtMs > 0) {
    const gap = Math.max(0, now - metrics.lastPositionPublishAtMs);
    metrics.positionPublishLastGapMs = Math.round(gap);
    metrics.positionPublishMaxGapMs = Math.max(metrics.positionPublishMaxGapMs, Math.round(gap));
  }
  metrics.lastPositionPublishAtMs = now;
  publishUiPerfMetrics(metrics, playback);
}

function publishUiPerfMetrics(metrics: UiPerfMutableState, playback: PlaybackState): void {
  const now = performance.now();
  const elapsedMs = Math.max(1, now - metrics.startedAtMs);
  const sortedFrameDeltas = [...metrics.frameDeltas].sort((a, b) => a - b);
  const averageFrameMs = averageNumbers(metrics.frameDeltas);
  metrics.measuredAtMs = Math.round(now);
  metrics.elapsedMs = Math.round(elapsedMs);
  metrics.measuredFps = Math.round((metrics.frameCount * 1000) / elapsedMs);
  metrics.averageFrameMs = averageFrameMs;
  metrics.p95FrameMs = roundMetric(percentile(sortedFrameDeltas, 0.95));
  metrics.p99FrameMs = roundMetric(percentile(sortedFrameDeltas, 0.99));
  metrics.positionPollAverageMs = roundMetric(metrics.positionPollTotalMs / Math.max(1, metrics.positionPollCount));
  metrics.positionPublishFps = roundMetric((metrics.positionPublishCount * 1000) / elapsedMs);
  metrics.playbackMode = playback.mode;
  metrics.bgmPlaying = playback.mode !== "stopped";
  window.__gamingLooperUiPerf = {
    startedAtMs: metrics.startedAtMs,
    measuredAtMs: metrics.measuredAtMs,
    elapsedMs: metrics.elapsedMs,
    frameCount: metrics.frameCount,
    measuredFps: metrics.measuredFps,
    averageFrameMs: metrics.averageFrameMs,
    maxFrameMs: roundMetric(metrics.maxFrameMs),
    p95FrameMs: metrics.p95FrameMs,
    p99FrameMs: metrics.p99FrameMs,
    longFrameCount: metrics.longFrameCount,
    veryLongFrameCount: metrics.veryLongFrameCount,
    longTaskCount: metrics.longTaskCount,
    longTaskTotalMs: roundMetric(metrics.longTaskTotalMs),
    longTaskMaxMs: roundMetric(metrics.longTaskMaxMs),
    longFrameSamples: metrics.longFrameSamples,
    longTaskSamples: metrics.longTaskSamples,
    positionPollCount: metrics.positionPollCount,
    positionPollAverageMs: metrics.positionPollAverageMs,
    positionPollMaxMs: roundMetric(metrics.positionPollMaxMs),
    positionPublishCount: metrics.positionPublishCount,
    positionPublishFps: metrics.positionPublishFps,
    positionPublishLastGapMs: metrics.positionPublishLastGapMs,
    positionPublishMaxGapMs: metrics.positionPublishMaxGapMs,
    playbackMode: metrics.playbackMode,
    bgmPlaying: metrics.bgmPlaying
  };
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index] ?? 0;
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

type ViewId = "main" | "loop" | "config";
type ConfigSectionId = "mix" | "auto-loop" | "look-meter" | "se-pad-control" | "files-save";

type PlaybackState =
  | { mode: "stopped" }
  | { mode: "track"; trackId: string; startedAt: number; rate: number }
  | { mode: "playlist"; itemId: string; trackId: string; index: number; startedAt: number; plannedMs: number; rate: number };

type PlaylistListeningSession = { playlistId: string | null; startedAt: number; rate: number };

type SeConfigMode = "volume" | "pan";

interface DetectionProgress {
  current: number;
  completed: number;
  total: number;
  currentFile: string;
  currentTrackId: string;
  pendingTrackIds: string[];
  startedAtMs: number;
  cancelRequested: boolean;
}

interface DetectionQueueItem {
  trackIds: string[];
  label: string;
}

interface GamingnessProgress {
  enabled: boolean;
  assetCount: number;
  bgmCount: number;
  seCount: number;
  level: number;
  max: number;
  bonusPct: number;
  overflowCount: number;
  overflowBonus: number;
  previousTarget: number;
  nextTarget: number | null;
  progressPct: number;
}

interface ExpAwardPopup {
  id: number;
  text: string;
  limited: boolean;
}

interface UiPerfMetrics {
  startedAtMs: number;
  measuredAtMs: number;
  elapsedMs: number;
  frameCount: number;
  measuredFps: number;
  averageFrameMs: number;
  maxFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  longFrameCount: number;
  veryLongFrameCount: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  longTaskMaxMs: number;
  longFrameSamples: Array<{ atMs: number; frameMs: number; gapMs: number }>;
  longTaskSamples: Array<{ atMs: number; durationMs: number; name: string }>;
  positionPollCount: number;
  positionPollAverageMs: number;
  positionPollMaxMs: number;
  positionPublishCount: number;
  positionPublishFps: number;
  positionPublishLastGapMs: number;
  positionPublishMaxGapMs: number;
  playbackMode: PlaybackState["mode"];
  bgmPlaying: boolean;
}

interface UiPerfMutableState extends UiPerfMetrics {
  frameDeltas: number[];
  lastPositionPublishAtMs: number;
  lastLongFrameAtMs: number;
  positionPollTotalMs: number;
}

interface SaveCurrentProjectResult {
  ok: boolean;
  error?: string;
}

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

interface ProjectHistoryCounts {
  undo: number;
  redo: number;
}

declare global {
  interface Window {
    __gamingLooperUiPerf?: UiPerfMetrics;
    __gamingLooperAudioDebug?: AudioDebugSnapshot;
    __gamingLooperResetUiPerf?: () => void;
  }
}

interface SetProjectStateOptions {
  history?: boolean;
}

type HelpModalMode = "guide" | "shortcuts";
type TitleMenuId = "file" | "edit";
type TitleMenuCommand =
  | "save"
  | "load"
  | "initialize"
  | "debug-true-initialize"
  | "open-save-folder"
  | "export-backup"
  | "import-backup"
  | "import-bgm"
  | "import-se"
  | "quit"
  | "undo"
  | "redo"
  | "help"
  | "shortcuts"
  | "toggle-debug"
  | "debug-speed-1"
  | "debug-speed-4"
  | "debug-speed-8";

interface ConfirmDialogState {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  alertOnly?: boolean;
}

interface PromptDialogState {
  title: string;
  message?: string;
  initialValue: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  multiline?: boolean;
  readOnly?: boolean;
}

function useEventCallback<T extends (...args: any[]) => unknown>(callback: T): T {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  return useMemo(() => ((...args: Parameters<T>) => callbackRef.current(...args)) as T, []);
}

function runLayoutTransition(update: () => void): void {
  const transitionDocument = document as Document & { startViewTransition?: (callback: () => void) => unknown };
  if (typeof transitionDocument.startViewTransition !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  transitionDocument.startViewTransition(() => {
    flushSync(update);
  });
}

function viewTransitionName(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

const gamingnessThresholds = [10, 30, 80, 150, 666] as const;
const baseGamingnessMax = 100;
const gamingnessEffectMaxValue = 240;
const gamingnessStorageMax = loadExpOverflowBonusMax + baseGamingnessMax + gamingnessThresholds.length * 10;
const loadCountOverflowAt = 1024;
const seSetExpAwardLimit = 300;
const projectHistoryLimit = 80;
const potatoAnalyzerBands = 48;
const potatoAnalyzerFps = 10;

type AutoLoopPresetId = "vgost" | DetectionSettings["mode"];

const autoLoopPresets: Record<AutoLoopPresetId, DetectionSettings> = {
  vgost: vgostDetectionSettings,
  normal: normalDetectionSettings,
  deep: deepDetectionSettings
};

function App(): ReactElement {
  const audioRef = useRef(new AudioEngine());
  const playlistTimerRef = useRef<number | null>(null);
  const playlistFadeTimerRef = useRef<number | null>(null);
  const playlistListeningSessionRef = useRef<PlaylistListeningSession | null>(null);
  const perfProbeStartedRef = useRef(false);
  const scanCancelRequestedRef = useRef(false);
  const cleanProjectSnapshotRef = useRef<string | null>(null);
  const initialProject = useMemo(() => createEmptyProject(), []);
  const projectRef = useRef<GamingProject>(initialProject);
  const historyPastRef = useRef<GamingProject[]>([]);
  const historyFutureRef = useRef<GamingProject[]>([]);
  const loopDragHistoryRef = useRef<GamingProject | null>(null);
  const activeKeysSignatureRef = useRef("");
  const visualHoldTimersRef = useRef<Map<SeKey, number>>(new Map());
  const voiceCountRef = useRef(0);
  const seTransientLevelRef = useRef(0);
  const positionMsRef = useRef(0);
  const displayedPositionMsRef = useRef(0);
  const playlistCumulativeDisplayMsRef = useRef(initialProject.playlistCumulativePlayMs);
  const debugPlaybackRateRef = useRef(1);
  const bgmPositionStoreRef = useRef<PositionStore>(createPositionStore(0));
  const sePositionMsRef = useRef(0);
  const displayedSePositionMsRef = useRef(0);
  const lastPositionPublishAtRef = useRef(0);
  const lastSePositionPublishAtRef = useRef(0);
  const uiPerfRef = useRef<UiPerfMutableState | null>(null);
  const detectionActiveRef = useRef(false);
  const detectionProgressRef = useRef<DetectionProgress | null>(null);
  const detectionQueueRef = useRef<DetectionQueueItem[]>([]);
  const [view, setView] = useState<ViewId>("loop");
  const [initialConfigSection, setInitialConfigSection] = useState<ConfigSectionId>("mix");
  const [project, setProject] = useState<GamingProject>(() => initialProject);
  const [loaded, setLoaded] = useState(false);
  const [projectDirty, setProjectDirty] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [projectStorePath, setProjectStorePath] = useState<string | null>(null);
  const [dataFolderInfo, setDataFolderInfo] = useState<DataFolderInfo>({ sequencePath: null, seSetPath: null });
  const [historyCounts, setHistoryCounts] = useState<ProjectHistoryCounts>({ undo: 0, redo: 0 });
  const [helpModal, setHelpModal] = useState<HelpModalMode | null>(null);
  const [readmeSeen, setReadmeSeen] = useState(() => getReadmeSeen());
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [promptDialog, setPromptDialog] = useState<PromptDialogState | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ mode: "stopped" });
  const playbackRef = useRef<PlaybackState>({ mode: "stopped" });
  const [positionMs, setPositionMs] = useState(0);
  const [playlistCumulativeDisplayMs, setPlaylistCumulativeDisplayMs] = useState(initialProject.playlistCumulativePlayMs);
  const [voiceCount, setVoiceCount] = useState(0);
  const [seTransientLevel, setSeTransientLevel] = useState(0);
  const [lastPlayedSeFile, setLastPlayedSeFile] = useState<SeFile | null>(null);
  const [sePositionMs, setSePositionMs] = useState(0);
  const [activeKeys, setActiveKeys] = useState<Set<SeKey>>(() => new Set());
  const [visualHoldKeys, setVisualHoldKeys] = useState<Set<SeKey>>(() => new Set());
  const [audioReadyTick, setAudioReadyTick] = useState(0);
  const [detectionProgress, setDetectionProgress] = useState<DetectionProgress | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [sePreloadMap, setSePreloadMap] = useState<SePreloadMap>({});
  const [openTitleMenu, setOpenTitleMenu] = useState<TitleMenuId | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugPlaybackRate, setDebugPlaybackRateState] = useState(1);
  const [overflowAnimationKey, setOverflowAnimationKey] = useState(0);
  const [expAwardPopups, setExpAwardPopups] = useState<ExpAwardPopup[]>([]);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const promptResolverRef = useRef<((value: string | null) => void) | null>(null);
  const overflowCountRef = useRef(initialProject.visual.loadExpOverflowCount);
  const expAwardQueueRef = useRef<Array<Omit<ExpAwardPopup, "id">>>([]);
  const expAwardTimerRef = useRef<number | null>(null);
  const expAwardRemovalTimersRef = useRef<number[]>([]);
  const expAwardAnimationIdRef = useRef(0);
  const detectionSelectionLockedRef = useRef(false);

  const selectedTrack = useMemo(
    () => project.bgmTracks.find((track) => track.id === project.selectedTrackId) ?? project.bgmTracks[0] ?? null,
    [project.bgmTracks, project.selectedTrackId]
  );
  const enabledPlaylist = useMemo(() => (project.playlistCreated ? getEnabledPlaylistItems(project.playlist) : []), [project.playlistCreated, project.playlist]);
  const selectedPlaylistItem = useMemo(
    () => (project.playlistCreated ? project.playlist.find((item) => item.trackId === selectedTrack?.id) ?? null : null),
    [project.playlistCreated, project.playlist, selectedTrack?.id]
  );
  const assignedSeFilesKey = useMemo(
    () => project.seAssignments.map((assignment) => assignment.file?.filePath ?? "").filter(Boolean).join("\n"),
    [project.seAssignments]
  );
  const detectionSettings = project.detection;
  const gamingnessProgress = useMemo(() => getGamingnessProgress(project), [project]);
  const effectiveGamingness = project.visual.potatoMode ? 0 : Math.min(project.visual.accentBrightness, gamingnessProgress.max);
  const gamingnessEffectStrength = getGamingnessEffectStrength(effectiveGamingness);
  const seReadySummary = useMemo(() => summarizeSePreload(project.seAssignments, sePreloadMap), [project.seAssignments, sePreloadMap]);
  const visualActiveKeys = useMemo(() => {
    if (visualHoldKeys.size === 0) return activeKeys;
    return new Set([...activeKeys, ...visualHoldKeys]);
  }, [activeKeys, visualHoldKeys]);
  const language = project.ui.language;
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    detectionProgressRef.current = detectionProgress;
  }, [detectionProgress]);

  useEffect(() => {
    const current = project.visual.loadExpOverflowCount;
    if (!loaded) {
      overflowCountRef.current = current;
      return;
    }
    if (current > overflowCountRef.current) {
      setOverflowAnimationKey((key) => key + 1);
    }
    overflowCountRef.current = current;
  }, [loaded, project.visual.loadExpOverflowCount]);

  useEffect(() => {
    return () => {
      if (expAwardTimerRef.current !== null) window.clearTimeout(expAwardTimerRef.current);
      expAwardTimerRef.current = null;
      expAwardRemovalTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      expAwardRemovalTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    const nextRate = sanitizePlaybackRate(debugPlaybackRate);
    if (debugPlaybackRateRef.current !== nextRate) {
      const now = performance.now();
      const nextPlayback = rebasePlaybackForRate(playbackRef.current, now, nextRate);
      playbackRef.current = nextPlayback;
      setPlayback(nextPlayback);
      playlistListeningSessionRef.current = rebasePlaylistListeningSessionForRate(playlistListeningSessionRef.current, now, nextRate);
      setPlaylistCumulativeDisplayMs(roundDownToSecondMs(getLivePlaylistCumulativeDisplayMs(projectRef.current, playlistListeningSessionRef.current, now)));
    }
    debugPlaybackRateRef.current = nextRate;
    audioRef.current.setDebugPlaybackRate(nextRate);
  }, [debugPlaybackRate]);

  useEffect(() => {
    if (!import.meta.env.DEV && !isPerformanceProbeMode()) return undefined;
    const perf = createUiPerfMetrics();
    uiPerfRef.current = perf;
    publishUiPerfMetrics(perf, playbackRef.current);
    window.__gamingLooperResetUiPerf = () => {
      const reset = createUiPerfMetrics();
      Object.assign(perf, reset);
      uiPerfRef.current = perf;
      publishUiPerfMetrics(perf, playbackRef.current);
    };
    let frameId = 0;
    let lastFrameAt = performance.now();
    let observer: PerformanceObserver | null = null;

    const tick = (now: number) => {
      const delta = Math.max(0, now - lastFrameAt);
      lastFrameAt = now;
      recordUiFrame(perf, delta, playbackRef.current);
      frameId = window.requestAnimationFrame(tick);
    };

    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          perf.longTaskCount += 1;
          perf.longTaskTotalMs += entry.duration;
          perf.longTaskMaxMs = Math.max(perf.longTaskMaxMs, entry.duration);
          perf.longTaskSamples.push({
            atMs: Math.round(entry.startTime - perf.startedAtMs),
            durationMs: roundMetric(entry.duration),
            name: entry.name
          });
          if (perf.longTaskSamples.length > 16) perf.longTaskSamples.shift();
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      observer = null;
    }

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      uiPerfRef.current = null;
      delete window.__gamingLooperUiPerf;
      delete window.__gamingLooperAudioDebug;
      delete window.__gamingLooperResetUiPerf;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !isPerformanceProbeAutoplayMode() || perfProbeStartedRef.current || !selectedTrack) return undefined;
    perfProbeStartedRef.current = true;
    let disposed = false;
    const samples: Array<{ atMs: number; spectrum: number; positionMs: number; fpsText: string | null }> = [];
    let sampleTimer: number | null = null;
    let reportTimer: number | null = null;

    const collectSample = () => {
      const metrics = window.__gamingLooperAnalyzerMetrics;
      samples.push({
        atMs: Math.round(performance.now()),
        spectrum: metrics?.spectrum ?? 0,
        positionMs: Math.round(positionMsRef.current),
        fpsText: document.querySelector(".analysis-fps")?.textContent ?? null
      });
    };

    const run = async () => {
      await waitForUiFrame();
      if (disposed) return;
      await playSelectedTrack();
      sampleTimer = window.setInterval(collectSample, 1000);
      reportTimer = window.setTimeout(() => {
        collectSample();
        const metrics = window.__gamingLooperAnalyzerMetrics;
        const spectrumSamples = samples.map((sample) => sample.spectrum).filter((value) => value > 0);
        const report = {
          metrics: metrics ?? null,
          uiPerf: window.__gamingLooperUiPerf ?? null,
          audioDebug: audioRef.current.getDebugSnapshot(),
          averageSpectrumFps: averageNumbers(spectrumSamples),
          minSpectrumFps: spectrumSamples.length > 0 ? Math.min(...spectrumSamples) : 0,
          samples,
          timeText: document.querySelector(".time-readout")?.textContent ?? null,
          statusText: document.querySelector(".statusbar")?.textContent ?? null,
          positionMs: Math.round(positionMsRef.current)
        };
        void window.gamingLooper.reportPerformanceProbe(report).catch(() => undefined);
        console.log(`__GL_PERF_REPORT__${JSON.stringify(report)}`);
      }, 7200);
    };

    void run();
    return () => {
      disposed = true;
      if (sampleTimer !== null) window.clearInterval(sampleTimer);
      if (reportTimer !== null) window.clearTimeout(reportTimer);
    };
  }, [loaded, selectedTrack?.id]);

  useEffect(() => {
    return () => clearVisualHoldKeys(false);
  }, []);

  useEffect(() => {
    if (!openTitleMenu) return undefined;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".title-menu")) return;
      setOpenTitleMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenTitleMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openTitleMenu]);

  useEffect(() => {
    let mounted = true;
    void window.gamingLooper
      .loadProject()
      .then((saved) => {
        if (!mounted) return;
        const nextProject = normalizeProject(isPerformanceProbeMode() ? createPerformanceProbeProject() : saved ?? createEmptyProject());
        markProjectClean(nextProject);
        projectRef.current = nextProject;
        clearProjectHistory();
        setProject(nextProject);
        setLoaded(true);
      })
      .catch((error) => {
        if (!mounted) return;
        const nextProject = normalizeProject(isPerformanceProbeMode() ? createPerformanceProbeProject() : createEmptyProject());
        markProjectClean(nextProject);
        projectRef.current = nextProject;
        clearProjectHistory();
        setProject(nextProject);
        setLoaded(true);
        setStatus(error instanceof Error ? error.message : "Project load failed.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void window.gamingLooper
      .getProjectStoreInfo()
      .then((info) => setProjectStorePath(info.path))
      .catch(() => setProjectStorePath(null));
  }, []);

  useEffect(() => {
    void refreshDataFolderInfo();
  }, []);

  useEffect(() => {
    void window.gamingLooper.setMenuLanguage(language).catch(() => undefined);
  }, [language]);

  useEffect(() => {
    if (!loaded || cleanProjectSnapshotRef.current === null) return;
    const dirty = serializeProjectForDirty(project) !== cleanProjectSnapshotRef.current;
    setProjectDirty(dirty);
    window.gamingLooper.setProjectDirty(dirty);
  }, [loaded, project]);

  useEffect(() => {
    if (!loaded) return;
    window.gamingLooper.setSequenceUpdatePending(hasCurrentPlaylistChanges(project));
  }, [loaded, project]);

  useEffect(() => {
    return () => {
      window.gamingLooper.setSequenceUpdatePending(false);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return undefined;
    const files = project.seAssignments.map((assignment) => assignment.file).filter((file): file is SeFile => Boolean(file));
    const assignedPaths = new Set(files.map((file) => file.filePath));
    const audio = audioRef.current;

    setSePreloadMap((current) => {
      const next: SePreloadMap = {};
      for (const file of files) {
        next[file.filePath] = audio.isSeReady(file.filePath) ? { status: "ready" } : current[file.filePath] ?? { status: "loading" };
        if (next[file.filePath].status !== "ready") {
          next[file.filePath] = { status: "loading" };
        }
      }
      return next;
    });

    if (files.length === 0) {
      audio.cancelSePreload();
      return undefined;
    }

    let canceled = false;
    void audio
      .preloadSeFiles(files, {
        concurrency: 3,
        onProgress: (progress) => {
          if (canceled || !assignedPaths.has(progress.filePath)) return;
          updateSePreloadProgress(progress);
        }
      })
      .catch(() => undefined);

    return () => {
      canceled = true;
      audio.cancelSePreload();
    };
  }, [loaded, assignedSeFilesKey]);

  useEffect(() => {
    const audio = audioRef.current;
    audio.setMix(project.mix);
  }, [project.mix, audioReadyTick]);

  function updateDisplayedBgmPositionMs(ms: number): void {
    const displayedMs = roundDownToSecondMs(ms);
    displayedPositionMsRef.current = displayedMs;
    setPositionMs(displayedMs);
  }

  function updateDisplayedSePositionMs(ms: number): void {
    const displayedMs = roundDownToSecondMs(ms);
    displayedSePositionMsRef.current = displayedMs;
    setSePositionMs(displayedMs);
  }

  useEffect(() => {
    if (playback.mode === "stopped") return;
    const track = project.bgmTracks.find((item) => item.id === playback.trackId);
    if (!track) return;
    audioRef.current.setCurrentBgmVolume(track.volume);
  }, [project.bgmTracks, playback]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const pollStartedAt = performance.now();
      const now = performance.now();
      const nextPositionMs = audioRef.current.getBgmPositionMs();
      if (
        !isPerformanceProbePositionOff() &&
        (now - lastPositionPublishAtRef.current >= BGM_POSITION_UI_INTERVAL_MS ||
          (nextPositionMs <= POSITION_RESET_EPSILON_MS && positionMsRef.current > POSITION_RESET_EPSILON_MS))
      ) {
        recordUiPositionPublish(uiPerfRef.current, now, playbackRef.current);
        positionMsRef.current = nextPositionMs;
        bgmPositionStoreRef.current.set(nextPositionMs);
        lastPositionPublishAtRef.current = now;
        if (playbackRef.current.mode === "playlist" || nextPositionMs <= POSITION_RESET_EPSILON_MS) {
          const nextDisplayedPositionMs = roundDownToSecondMs(nextPositionMs);
          if (nextDisplayedPositionMs !== displayedPositionMsRef.current || nextPositionMs <= POSITION_RESET_EPSILON_MS) {
            displayedPositionMsRef.current = nextDisplayedPositionMs;
            setPositionMs(nextDisplayedPositionMs);
          }
        }
      }
      const nextVoiceCount = audioRef.current.getActiveVoiceCount();
      if (nextVoiceCount !== voiceCountRef.current) {
        voiceCountRef.current = nextVoiceCount;
        setVoiceCount(nextVoiceCount);
      }
      const nextSeTransientLevel = audioRef.current.getSeTransientLevel();
      if (Math.abs(nextSeTransientLevel - seTransientLevelRef.current) > 0.012 || (nextSeTransientLevel === 0 && seTransientLevelRef.current !== 0)) {
        seTransientLevelRef.current = nextSeTransientLevel;
        setSeTransientLevel(nextSeTransientLevel);
      }
      const nextCumulativeDisplayMs = getLivePlaylistCumulativeDisplayMs(projectRef.current, playlistListeningSessionRef.current, now);
      if (Math.floor(nextCumulativeDisplayMs / 1000) !== Math.floor(playlistCumulativeDisplayMsRef.current / 1000)) {
        playlistCumulativeDisplayMsRef.current = nextCumulativeDisplayMs;
        setPlaylistCumulativeDisplayMs(roundDownToSecondMs(nextCumulativeDisplayMs));
      }
      const nextSePositionMs = audioRef.current.getLatestSePositionMs();
      if (
        now - lastSePositionPublishAtRef.current >= SE_POSITION_UI_INTERVAL_MS ||
        (nextSePositionMs <= POSITION_RESET_EPSILON_MS && sePositionMsRef.current > POSITION_RESET_EPSILON_MS)
      ) {
        sePositionMsRef.current = nextSePositionMs;
        lastSePositionPublishAtRef.current = now;
        const nextDisplayedSePositionMs = roundDownToSecondMs(nextSePositionMs);
        if (nextDisplayedSePositionMs !== displayedSePositionMsRef.current || nextSePositionMs <= POSITION_RESET_EPSILON_MS) {
          displayedSePositionMsRef.current = nextDisplayedSePositionMs;
          setSePositionMs(nextDisplayedSePositionMs);
        }
      }
      const nextActiveKeys = getActiveSeKeys(audioRef.current.getActiveSePlaybackKeys());
      const nextSignature = Array.from(nextActiveKeys).sort().join("");
      if (nextSignature !== activeKeysSignatureRef.current) {
        activeKeysSignatureRef.current = nextSignature;
        setActiveKeys(nextActiveKeys);
      }
      window.__gamingLooperAudioDebug = audioRef.current.getDebugSnapshot();
      recordUiPositionPoll(uiPerfRef.current, performance.now() - pollStartedAt);
    }, PLAYBACK_UI_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return window.gamingLooper.onDroppedFilesImported(({ result, target }) => {
      if (target === "sequence-builder") {
        void applyBgmImport(result.tracks, result.errors, { afterImport: openSequenceBuilderAfterBgmImport });
        return;
      }
      void applyBgmImport(result.tracks, result.errors);
    });
  }, [project.bgmTracks, detectionSettings, language]);

  useEffect(() => {
    return window.gamingLooper.onDroppedSeFilesImported(({ result, targetKey, droppedCount }) => {
      assignDroppedSeFiles(targetKey, result.files, result.errors, droppedCount);
    });
  }, [project.seAssignments, lastPlayedSeFile]);

  useEffect(() => {
    return window.gamingLooper.onFileDragStateChanged(setFileDragActive);
  }, []);

  useEffect(() => {
    return window.gamingLooper.onImportBgmRequested(() => {
      void importBgm();
    });
  }, [project.bgmTracks, detectionSettings]);

  useEffect(() => {
    return window.gamingLooper.onImportSeRequested(() => {
      void assignSeFromDialog("Q");
    });
  }, [project.seAssignments]);

  useEffect(() => {
    return window.gamingLooper.onSaveProjectRequested(() => {
      void saveCurrentProject();
    });
  }, [loaded, project]);

  useEffect(() => {
    return window.gamingLooper.onOpenSaveFolderRequested(() => {
      void openProjectStoreFolder();
    });
  }, []);

  useEffect(() => {
    return window.gamingLooper.onExportBackupRequested(() => {
      void exportProjectBackup();
    });
  }, [loaded, project]);

  useEffect(() => {
    return window.gamingLooper.onImportBackupRequested(() => {
      void importProjectBackup();
    });
  }, [loaded, projectDirty, detectionProgress]);

  useEffect(() => {
    return window.gamingLooper.onLoadProjectRequested(() => {
      void loadProjectFromStore();
    });
  }, [loaded, projectDirty, detectionProgress]);

  useEffect(() => {
    return window.gamingLooper.onResetProjectRequested(() => {
      void initializeProjectState();
    });
  }, [projectDirty, detectionProgress]);

  useEffect(() => {
    return window.gamingLooper.onUndoProjectRequested(undoProject);
  }, []);

  useEffect(() => {
    return window.gamingLooper.onRedoProjectRequested(redoProject);
  }, []);

  useEffect(() => {
    return window.gamingLooper.onOpenHelpRequested(() => openHelpModal("guide"));
  }, []);

  useEffect(() => {
    return window.gamingLooper.onOpenShortcutsRequested(() => openHelpModal("shortcuts"));
  }, []);

  useEffect(() => {
    window.gamingLooper.setWindowCloseGuard(helpModal !== null);
    return () => {
      window.gamingLooper.setWindowCloseGuard(false);
    };
  }, [helpModal]);

  useEffect(() => {
    return window.gamingLooper.onCloseActiveModalRequested(() => {
      setHelpModal(null);
    });
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    return window.gamingLooper.onDebugModeToggleRequested(() => {
      setDebugMode((current) => {
        const next = !current;
        setStatus(`Debug Mode ${next ? "ON" : "OFF"}`);
        return next;
      });
    });
  }, []);

  useEffect(() => {
    return window.gamingLooper.onSaveBeforeCloseRequested((requestId) => {
      void saveCurrentProject(false)
        .then((result) => {
          window.gamingLooper.completeSaveBeforeClose(requestId, result);
        })
        .catch((error) => {
          window.gamingLooper.completeSaveBeforeClose(requestId, {
            ok: false,
            error: error instanceof Error ? error.message : "Project save failed."
          });
        });
    });
  }, [loaded, project]);

  useEffect(() => {
    return window.gamingLooper.onBeforeCloseCheckRequested((requestId) => {
      void confirmSequenceUpdateBeforeClose()
        .then((ok) => {
          window.gamingLooper.completeBeforeCloseCheck(requestId, { ok });
        })
        .catch((error) => {
          window.gamingLooper.completeBeforeCloseCheck(requestId, {
            ok: false,
            error: error instanceof Error ? error.message : "Close check failed."
          });
        });
    });
  }, [language]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoProject();
        } else {
          undoProject();
        }
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redoProject();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !isSePopoverRange(target)) return;
      const key = event.key.toUpperCase() as SeKey;
      if (!seKeys.includes(key)) return;
      event.preventDefault();
      void triggerSe(key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [project.seAssignments, project.mix, sePreloadMap]);

  const visualVars = useMemo(() => makeVisualVars(effectiveGamingness, gamingnessProgress.max), [effectiveGamingness, gamingnessProgress.max]);

  function runTitleMenuCommand(command: TitleMenuCommand): void {
    setOpenTitleMenu(null);
    if (command === "save") {
      void saveCurrentProject();
      return;
    }
    if (command === "load") {
      void loadProjectFromStore();
      return;
    }
    if (command === "initialize") {
      void initializeProjectState();
      return;
    }
    if (command === "open-save-folder") {
      void openProjectStoreFolder();
      return;
    }
    if (command === "export-backup") {
      void exportProjectBackup();
      return;
    }
    if (command === "import-backup") {
      void importProjectBackup();
      return;
    }
    if (command === "import-bgm") {
      void importBgm();
      return;
    }
    if (command === "import-se") {
      void assignSeFromDialog("Q");
      return;
    }
    if (command === "undo") {
      undoProject();
      return;
    }
    if (command === "redo") {
      redoProject();
      return;
    }
    if (command === "help") {
      openHelpModal("guide");
      return;
    }
    if (command === "shortcuts") {
      openHelpModal("shortcuts");
      return;
    }
    if (command === "toggle-debug") {
      if (!import.meta.env.DEV) return;
      setDebugMode((current) => {
        const next = !current;
        setStatus(`Debug Mode ${next ? "ON" : "OFF"}`);
        return next;
      });
      return;
    }
    if (command === "debug-true-initialize") {
      void trueInitializeProjectState();
      return;
    }
    if (command === "debug-speed-1") {
      setDebugPlaybackRate(1);
      return;
    }
    if (command === "debug-speed-4") {
      setDebugPlaybackRate(4);
      return;
    }
    if (command === "debug-speed-8") {
      setDebugPlaybackRate(8);
      return;
    }
    if (command === "quit") {
      void window.gamingLooper.windowCommand("quit");
    }
  }

  function setDebugPlaybackRate(rate: number): void {
    if (!import.meta.env.DEV) return;
    const safeRate = rate === 4 || rate === 8 ? rate : 1;
    setDebugPlaybackRateState(safeRate);
    setStatus(`Debug playback speed: ${safeRate}x`);
  }

  function openHelpModal(mode: HelpModalMode): void {
    if (mode === "guide") {
      markReadmeSeen();
      setReadmeSeen(true);
    }
    setHelpModal(mode);
  }

  function showInvalidPlayTimeWarning(minimumSeconds: number): void {
    const message = formatPlayTimeMinimumStatus(minimumSeconds, language);
    setStatus(message);
    void requestConfirm({
      title: language === "ja" ? "Play時間の設定" : "Play Time",
      message,
      confirmLabel: "OK",
      alertOnly: true
    });
  }

  function addDebugLoadExp(amount: number): void {
    if (!import.meta.env.DEV) return;
    if (!projectRef.current.visual.loadExpEnabled) {
      setStatus("EXP/LV Mode is OFF.");
      return;
    }
    const identities = Array.from({ length: Math.max(0, Math.round(amount)) }, (_, index) => `debug:${Date.now()}:${index}:${createLocalId()}`);
    const effectiveAmount = queueLoadExpIdentityAwardAnimations(projectRef.current, [identities]);
    setProjectState((draft) => recordLoadExpIdentities(draft, identities), { history: false });
    setStatus(`Debug EXP +${effectiveAmount}`);
  }

  function queueLoadExpIdentityAwardAnimations(sourceProject: GamingProject, identityGroups: string[][]): number {
    if (!sourceProject.visual.loadExpEnabled || identityGroups.length === 0) return 0;
    const existing = new Set(sanitizeLoadExpIdentities(sourceProject.visual.loadExpIdentities));
    const accepted = new Set<string>();
    const awards: number[] = [];
    let total = 0;
    for (const group of identityGroups) {
      let groupAmount = 0;
      for (const rawIdentity of group) {
        const identity = sanitizeLoadExpIdentity(rawIdentity);
        if (!identity || existing.has(identity) || accepted.has(identity)) continue;
        accepted.add(identity);
        groupAmount += 1;
      }
      const effectiveAmount = getEffectiveLoadExpAward(sourceProject, groupAmount);
      if (effectiveAmount > 0) {
        awards.push(effectiveAmount);
        total += effectiveAmount;
      }
    }
    queueExpAwardAnimations(awards);
    return total;
  }

  function queueExpAwardAnimations(amounts: number[]): void {
    const awards = amounts.map((amount) => Math.floor(amount)).filter((amount) => amount > 0);
    if (awards.length === 0) return;
    expAwardQueueRef.current.push(...awards.map((amount) => ({ text: `+ ${amount}EXP`, limited: false })));
    if (expAwardTimerRef.current === null) {
      showNextExpAwardAnimation();
    }
  }

  function queueExpLimitAnimation(): void {
    expAwardQueueRef.current.push({ text: "EXP Limit", limited: true });
    if (expAwardTimerRef.current === null) {
      showNextExpAwardAnimation();
    }
  }

  function showNextExpAwardAnimation(): void {
    const popup = expAwardQueueRef.current.shift();
    if (!popup) {
      expAwardTimerRef.current = null;
      return;
    }
    const id = expAwardAnimationIdRef.current + 1;
    expAwardAnimationIdRef.current = id;
    setExpAwardPopups((current) => [...current, { id, ...popup }].slice(-8));
    const removalTimer = window.setTimeout(() => {
      setExpAwardPopups((current) => current.filter((popup) => popup.id !== id));
      expAwardRemovalTimersRef.current = expAwardRemovalTimersRef.current.filter((timer) => timer !== removalTimer);
    }, 1300);
    expAwardRemovalTimersRef.current.push(removalTimer);

    if (expAwardQueueRef.current.length > 0) {
      expAwardTimerRef.current = window.setTimeout(showNextExpAwardAnimation, 100);
      return;
    }
    expAwardTimerRef.current = null;
  }

  const handleAssignSe = useEventCallback((key: SeKey) => {
    void assignSeFromDialog(key);
  });
  const handleTriggerSe = useEventCallback((key: SeKey) => {
    void triggerSe(key);
  });
  const handleStopSe = useEventCallback((key: SeKey) => {
    stopSe(key);
  });
  const handleUnloadSe = useEventCallback((key: SeKey) => {
    unloadSeAssignment(key);
  });
  const handleSeIconWheel = useEventCallback((key: SeKey, delta: number) => {
    changeSeIcon(key, delta);
  });
  const handleSeIconSelect = useEventCallback((key: SeKey, iconId: SeIconId) => {
    selectSeIcon(key, iconId);
  });
  const handleSeSettingsChange = useEventCallback((key: SeKey, patch: Partial<Pick<SeAssignment, "volume" | "pan">>) => {
    updateSeAssignmentSettings(key, patch);
  });
  const handleSeAssignmentTransfer = useEventCallback((sourceKey: SeKey, targetKey: SeKey, options: { copy: boolean }) => {
    transferSeAssignment(sourceKey, targetKey, options);
  });
  const handleStopAllSe = useEventCallback(() => {
    stopAllSe();
  });
  const handleSeVoiceLimitChange = useEventCallback((value: number) => {
    const nextValue = Math.round(clampNumber(value, 1, 32, defaultMix.seVoiceLimit));
    setProjectState((draft) => ({ ...draft, mix: { ...draft.mix, seVoiceLimit: nextValue } }));
  });
  function openSePadControlConfig(): void {
    setInitialConfigSection("se-pad-control");
    setView("config");
  }
  const handleBrightnessChange = useEventCallback((accentBrightness: number) => {
    const nextBrightness = clampNumber(accentBrightness, 0, Math.max(baseGamingnessMax, gamingnessProgress.max), defaultVisual.accentBrightness);
    setProjectState((draft) => {
      if (draft.visual.potatoMode) {
        return {
          ...draft,
          visual: {
            ...draft.visual,
            accentBrightness: 0,
            accentBrightnessBeforePotato: nextBrightness
          }
        };
      }
      return {
        ...draft,
        visual: {
          ...draft.visual,
          accentBrightness: nextBrightness,
          accentBrightnessBeforePotato: nextBrightness
        }
      };
    });
  });
  const handlePotatoModeChange = useEventCallback((enabled: boolean) => {
    if (enabled) clearVisualHoldKeys();
    setProjectState((draft) => {
      if (enabled) {
        if (draft.visual.potatoMode) {
          return {
            ...draft,
            visual: {
              ...draft.visual,
              accentBrightness: 0,
              analyzerBands: potatoAnalyzerBands,
              analyzerFps: potatoAnalyzerFps
            }
          };
        }
        const previousBrightness = draft.visual.potatoMode
          ? clampNumber(draft.visual.accentBrightnessBeforePotato, 0, gamingnessStorageMax, defaultVisual.accentBrightness)
          : clampNumber(draft.visual.accentBrightness, 0, gamingnessStorageMax, defaultVisual.accentBrightness);
        const previousAnalyzerBands = Math.round(clampNumber(draft.visual.analyzerBands, 48, 192, defaultVisual.analyzerBands));
        const previousAnalyzerFps = Math.round(clampNumber(draft.visual.analyzerFps, 10, 60, defaultVisual.analyzerFps));
        return {
          ...draft,
          visual: {
            ...draft.visual,
            potatoMode: true,
            accentBrightness: 0,
            accentBrightnessBeforePotato: previousBrightness,
            analyzerBandsBeforePotato: previousAnalyzerBands,
            analyzerFpsBeforePotato: previousAnalyzerFps,
            analyzerBands: potatoAnalyzerBands,
            analyzerFps: potatoAnalyzerFps
          }
        };
      }
      const restoredBrightness = clampNumber(draft.visual.accentBrightnessBeforePotato, 0, gamingnessStorageMax, defaultVisual.accentBrightness);
      const restoredAnalyzerBands = Math.round(clampNumber(draft.visual.analyzerBandsBeforePotato, 48, 192, defaultVisual.analyzerBands));
      const restoredAnalyzerFps = Math.round(clampNumber(draft.visual.analyzerFpsBeforePotato, 10, 60, defaultVisual.analyzerFps));
      return {
        ...draft,
        visual: {
          ...draft.visual,
          potatoMode: false,
          accentBrightness: restoredBrightness,
          accentBrightnessBeforePotato: restoredBrightness,
          analyzerBands: restoredAnalyzerBands,
          analyzerFps: restoredAnalyzerFps
        }
      };
    });
  });

  return (
    <div className={`app ${fileDragActive ? "file-drag-active" : ""} ${project.visual.potatoMode ? "potato-mode" : ""} ${project.ui.bigFontMode ? "big-font-mode" : ""}`} style={visualVars}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">GL</span>
          <span className="brand-name" aria-label="GamingLooper">
            <span className="brand-name-gaming">Gaming</span>
            <span>Looper</span>
          </span>
        </div>
        <TitleMenuBar
          language={language}
          openMenu={openTitleMenu}
          canUndo={historyCounts.undo > 0}
          canRedo={historyCounts.redo > 0}
          debugMode={debugMode}
          debugPlaybackRate={debugPlaybackRate}
          onOpenChange={setOpenTitleMenu}
          onCommand={runTitleMenuCommand}
        />
        <div className="topbar-right">
          <div className="topbar-actions" aria-label="Project actions">
            <button className="topbar-action" type="button" onClick={undoProject} disabled={historyCounts.undo === 0} title="Ctrl+Z">
              <Undo2 size={16} />
              <span>{t("undo")}</span>
            </button>
            <button className="topbar-action" type="button" onClick={redoProject} disabled={historyCounts.redo === 0} title="Ctrl+Y / Ctrl+Shift+Z">
              <Redo2 size={16} />
              <span>{t("redo")}</span>
            </button>
            <button className={`topbar-action readme-action ${!readmeSeen ? "readme-unseen" : ""}`} type="button" onClick={() => openHelpModal("guide")} title="README">
              <BookOpen size={16} />
              <span>README</span>
            </button>
            <button
              className="topbar-action language"
              type="button"
              onClick={() => updateUiSettings({ language: language === "ja" ? "en" : "ja" })}
              title={t("language")}
            >
              <Languages size={16} />
              <span>{language === "ja" ? "日本語" : "English"}</span>
            </button>
          </div>
        </div>
      </header>
      <div className="workspace">
        <nav className="side-nav" aria-label="Views">
          <NavButton active={view === "main"} icon={<Activity size={22} />} label={t("main")} onClick={() => setView("main")} />
          <NavButton active={view === "loop"} icon={<ListMusic size={22} />} label={t("listBuilder")} onClick={() => setView("loop")} />
          <NavButton
            active={view === "config"}
            icon={<Settings size={22} />}
            label={t("config")}
            onClick={() => {
              setInitialConfigSection("mix");
              setView("config");
            }}
          />
          <div className="side-exp-slot">
            {project.visual.loadExpEnabled ? <GamingnessExpPanel progress={gamingnessProgress} compact overflowAnimationKey={overflowAnimationKey} awardPopups={expAwardPopups} /> : null}
            {import.meta.env.DEV && debugMode ? <DebugExpControls enabled={project.visual.loadExpEnabled} onAdd={addDebugLoadExp} /> : null}
          </div>
        </nav>
        <main className="view-shell">
          {view === "main" ? (
            <MainView
              project={project}
              selectedTrack={selectedTrack}
              selectedPlaylistItem={selectedPlaylistItem}
              playback={playback}
              positionMs={positionMs}
              playlistCumulativeDisplayMs={playlistCumulativeDisplayMs}
              positionStore={bgmPositionStoreRef.current}
              voiceCount={voiceCount}
              activeKeys={visualActiveKeys}
              sePreloadMap={sePreloadMap}
              seReadySummary={seReadySummary}
              lastPlayedSeFile={lastPlayedSeFile}
              sePositionMs={sePositionMs}
              detectionProgress={detectionProgress}
              gamingnessProgress={gamingnessProgress}
              gamingnessEffectStrength={gamingnessEffectStrength}
              bgmAnalyser={audioRef.current.getBgmAnalyser()}
              seAnalyser={audioRef.current.getSeAnalyser()}
              seTransientLevel={seTransientLevel}
              t={t}
              onSelectTrack={selectTrack}
              onPlayPlaylist={requestPlaylistPlayback}
              onPlayPlaylistIndex={(index, startElapsedMs) => void playPlaylistAt(index, startElapsedMs)}
              onPreviousPlaylistTrack={() => void jumpPlaylistTrack(-1)}
              onNextPlaylistTrack={() => void jumpPlaylistTrack(1)}
              onPlaylistEndBehaviorChange={updatePlaylistEndBehavior}
              canUpdateSequenceData={Boolean(project.activePlaylistId) && hasCurrentPlaylistChanges(project)}
              onUpdateSequenceData={overwriteActivePlaylist}
              onOpenSequenceBuilder={() => void importBgmForSequenceBuilder()}
              onStop={stopPlayback}
              onBgmSeek={(ms) => void seekSelectedBgm(ms)}
              onTrackVolumeChange={updateTrackVolume}
              onLoopChange={updateSelectedLoop}
              onLoopDragStart={beginLoopMarkerDrag}
              onLoopDragEnd={commitLoopMarkerDrag}
              onPlaylistRatingChange={updatePlaylistRating}
              onAssignSe={handleAssignSe}
              onTriggerSe={handleTriggerSe}
              onStopSe={handleStopSe}
              onUnloadSe={handleUnloadSe}
              onIconWheel={handleSeIconWheel}
              onIconSelect={handleSeIconSelect}
              onSeSettingsChange={handleSeSettingsChange}
              onTransferSeAssignment={handleSeAssignmentTransfer}
              onSaveSeSet={() => void saveCurrentSeSetFile()}
              onLoadSeSet={() => void importSeSetFile()}
              onEditSeSet={openSePadControlConfig}
              onStopAllSe={handleStopAllSe}
              onVoiceLimitChange={handleSeVoiceLimitChange}
              onCancelDetection={requestDetectionCancel}
              onUiSettingsChange={(patch) => updateUiSettings(patch)}
            />
          ) : null}
          {view === "loop" ? (
            <LoopPlaylistView
              project={project}
              selectedTrack={selectedTrack}
              selectedPlaylistItem={selectedPlaylistItem}
              detectionSettings={detectionSettings}
              playback={playback}
              positionMs={positionMs}
              positionStore={bgmPositionStoreRef.current}
              detectionProgress={detectionProgress}
              t={t}
              onAddTrackToPlaylist={addTrackToPlaylist}
              onAddTracksToPlaylist={addTracksToPlaylist}
              onImportBgm={() => void importBgm()}
              onClearBgmSource={clearBgmSource}
              onAutoLoopSourceTracks={(trackIds) => void autoLoopSourceTracks(trackIds)}
              onPlaylistNameChange={updatePlaylistName}
              onBuildList={() => void buildCurrentList()}
              onClearSequence={() => void clearCurrentSequence()}
              onSavePlaylistAs={() => void savePlaylistAs()}
              onOverwritePlaylist={overwriteActivePlaylist}
              canLoadStoredLists={Boolean(projectStorePath)}
              onEditSavedPlaylist={(id) => loadSavedPlaylist(id)}
              onActivateSavedPlaylist={(id) => void activateSavedPlaylist(id)}
              onExportSavedPlaylist={(id) => void exportSavedPlaylist(id)}
              onDeleteSavedPlaylist={(id) => void deleteSavedPlaylist(id)}
              onDuplicateSavedPlaylist={duplicateSavedPlaylist}
              onSavedPlaylistRatingChange={updateSavedPlaylistRating}
              onAllListRepeatChange={updateAllListRepeatEnabled}
              onImportSequenceFile={() => void importSequenceFile()}
              onSelectTrack={selectTrack}
              onLoopChange={updateSelectedLoop}
              onLoopDragStart={beginLoopMarkerDrag}
              onLoopDragEnd={commitLoopMarkerDrag}
              onPlaylistRuleChange={updateSelectedPlaylistRule}
              onPlaylistItemChange={updatePlaylistItem}
              onApplyPlaylistRuleToAll={applyPlaylistRuleToAll}
              onApplyPlaylistLoopCountToAll={applyPlaylistLoopCountToAll}
              onApplyPlaylistDurationToAll={applyPlaylistDurationToAll}
              onApplyPlaylistFadeToAll={applyPlaylistFadeToAll}
              onInvalidPlayTime={showInvalidPlayTimeWarning}
              onCopyPlaylistRules={() => void copyPlaylistRules()}
              onPastePlaylistRules={() => void pastePlaylistRules()}
              onMovePlaylistItem={movePlaylistItem}
              onReorderPlaylistItem={reorderPlaylistItem}
              onRemovePlaylistItemToSource={removePlaylistItemToSource}
              onDuplicatePlaylistItem={duplicatePlaylistItem}
              onDeletePlaylistItem={deletePlaylistItem}
              onDeleteSourceTrack={deleteSourceTrack}
              onPlayTrack={(trackId) => void playTrack(trackId ?? projectRef.current.selectedTrackId ?? selectedTrack?.id ?? null)}
              onStop={stopPlayback}
              onPlayBeforeLoop={() => void playSelectedTrackBeforeLoop()}
              onBgmSeek={(ms) => void seekSelectedBgm(ms)}
              onCancelDetection={requestDetectionCancel}
              onConfirm={requestConfirm}
              onPrompt={requestPrompt}
            />
          ) : null}
          {view === "config" ? (
            <ConfigView
              project={project}
              detectionSettings={detectionSettings}
              activeKeys={visualActiveKeys}
              voiceCount={voiceCount}
              sePreloadMap={sePreloadMap}
              seReadySummary={seReadySummary}
              gamingnessProgress={gamingnessProgress}
              language={language}
              initialSection={initialConfigSection}
              t={t}
              projectStorePath={projectStorePath}
              dataFolderInfo={dataFolderInfo}
              onDetectionSettingsChange={updateDetectionSettings}
              onMixChange={(mix) =>
                setProjectState((draft) => ({
                  ...draft,
                  mix: {
                    ...draft.mix,
                    ...mix,
                    seVoiceLimit:
                      mix.seVoiceLimit === undefined
                        ? draft.mix.seVoiceLimit
                        : Math.round(clampNumber(mix.seVoiceLimit, 1, 32, defaultMix.seVoiceLimit))
                  }
                }))
              }
              onBrightnessChange={handleBrightnessChange}
              onPotatoModeChange={handlePotatoModeChange}
              onAnalyzerChange={(patch) => setProjectState((draft) => ({ ...draft, visual: { ...draft.visual, ...patch } }))}
              onUiSettingsChange={updateUiSettings}
              onOpenHelp={openHelpModal}
              onSelectSaveLocation={() => void selectProjectStorePath()}
              onSelectDataFolder={(kind) => void selectDataFolder(kind)}
              onOpenSaveFolder={() => void openProjectStoreFolder()}
              onOpenDataFolder={(kind) => void openDataFolder(kind)}
              onExportBackup={() => void exportProjectBackup()}
              onImportBackup={() => void importProjectBackup()}
              onAssignSe={handleAssignSe}
              onTriggerSe={handleTriggerSe}
              onUnloadSe={handleUnloadSe}
              onSeSettingsChange={handleSeSettingsChange}
              onBulkSeSettingsChange={updateSeAssignmentsSettings}
              onResetSeSettings={resetSeAssignmentSettings}
              onClearSeAssignments={clearSeAssignments}
              onSaveSeSet={() => void saveCurrentSeSetFile()}
              onLoadSeSet={() => void importSeSetFile()}
              onConfirm={requestConfirm}
              onPrompt={requestPrompt}
            />
          ) : null}
        </main>
      </div>
      <footer className="statusbar">
        <span>{translateStatus(status, language)}</span>
        <span>{loaded ? (projectDirty ? t("unsaved") : t("saved")) : t("projectLoading")}</span>
      </footer>
      {helpModal ? <HelpModal mode={helpModal} language={language} t={t} onClose={() => setHelpModal(null)} /> : null}
      {confirmDialog ? (
        <ConfirmDialog
          dialog={confirmDialog}
          onCancel={() => settleConfirm(false)}
          onConfirm={() => settleConfirm(true)}
        />
      ) : null}
      {promptDialog ? (
        <PromptDialog
          dialog={promptDialog}
          onCancel={() => settlePrompt(null)}
          onConfirm={(value) => settlePrompt(value)}
        />
      ) : null}
    </div>
  );

  function requestConfirm(dialog: ConfirmDialogState): Promise<boolean> {
    confirmResolverRef.current?.(false);
    setConfirmDialog(dialog);
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
    });
  }

  function settleConfirm(confirmed: boolean): void {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolve?.(confirmed);
  }

  function requestPrompt(dialog: PromptDialogState): Promise<string | null> {
    promptResolverRef.current?.(null);
    setPromptDialog(dialog);
    return new Promise((resolve) => {
      promptResolverRef.current = resolve;
    });
  }

  function settlePrompt(value: string | null): void {
    const resolve = promptResolverRef.current;
    promptResolverRef.current = null;
    setPromptDialog(null);
    resolve?.(value);
  }

  function setProjectState(updater: (project: GamingProject) => GamingProject, options: SetProjectStateOptions = {}): void {
    const currentProject = normalizeProject(projectRef.current);
    const nextProject = normalizeProject(updater(currentProject));
    if (options.history !== false && serializeProjectForHistory(currentProject) !== serializeProjectForHistory(nextProject)) {
      pushProjectHistory(currentProject);
    }
    projectRef.current = nextProject;
    setProject(nextProject);
  }

  function beginPlaylistListeningSession(playlistId: string | null, startedAt = performance.now(), rate = debugPlaybackRateRef.current): void {
    playlistListeningSessionRef.current = { playlistId, startedAt, rate: sanitizePlaybackRate(rate) };
  }

  function ensurePlaylistListeningSession(playlistId: string | null, startedAt = performance.now(), rate = debugPlaybackRateRef.current): void {
    const currentSession = playlistListeningSessionRef.current;
    if (!currentSession) {
      beginPlaylistListeningSession(playlistId, startedAt, rate);
      return;
    }
    if (currentSession.playlistId === playlistId) return;
    commitPlaylistListeningTime(startedAt);
    beginPlaylistListeningSession(playlistId, startedAt, rate);
  }

  function commitPlaylistListeningTime(endedAt = performance.now(), restartIfStillPlaying = false): void {
    const session = playlistListeningSessionRef.current;
    if (!session) return;

    const elapsedMs = sanitizePlaylistCumulativeMs((endedAt - session.startedAt) * sanitizePlaybackRate(session.rate));
    playlistListeningSessionRef.current =
      restartIfStillPlaying && playbackRef.current.mode === "playlist"
        ? { playlistId: projectRef.current.activePlaylistId, startedAt: endedAt, rate: getPlaybackRate(playbackRef.current) }
        : null;
    if (elapsedMs <= 0) return;

    setProjectState((draft) => {
      if (session.playlistId) {
        const currentPlaylist = draft.savedPlaylists.find((playlist) => playlist.id === session.playlistId);
        const nextCumulative = sanitizePlaylistCumulativeMs((currentPlaylist?.cumulativePlayMs ?? draft.playlistCumulativePlayMs) + elapsedMs);
        return {
          ...draft,
          playlistCumulativePlayMs: draft.activePlaylistId === session.playlistId ? nextCumulative : draft.playlistCumulativePlayMs,
          savedPlaylists: draft.savedPlaylists.map((playlist) =>
            playlist.id === session.playlistId ? { ...playlist, cumulativePlayMs: nextCumulative } : playlist
          )
        };
      }
      return {
        ...draft,
        playlistCumulativePlayMs: sanitizePlaylistCumulativeMs(draft.playlistCumulativePlayMs + elapsedMs)
      };
    }, { history: false });
  }

  function pushProjectHistory(snapshot: GamingProject): void {
    const historySnapshot = cloneProjectSnapshot(snapshot);
    const snapshotSerialized = serializeProjectForHistory(historySnapshot);
    const previous = historyPastRef.current[historyPastRef.current.length - 1];
    if (previous && serializeProjectForHistory(previous) === snapshotSerialized) return;
    historyPastRef.current = [...historyPastRef.current, historySnapshot].slice(-projectHistoryLimit);
    historyFutureRef.current = [];
    syncProjectHistoryCounts();
  }

  function clearProjectHistory(): void {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncProjectHistoryCounts();
  }

  function syncProjectHistoryCounts(): void {
    setHistoryCounts({
      undo: historyPastRef.current.length,
      redo: historyFutureRef.current.length
    });
  }

  function undoProject(): void {
    const previous = historyPastRef.current.pop();
    if (!previous) return;
    historyFutureRef.current = [cloneProjectSnapshot(projectRef.current), ...historyFutureRef.current].slice(0, projectHistoryLimit);
    const nextProject = normalizeProject(previous);
    projectRef.current = nextProject;
    setProject(nextProject);
    syncProjectHistoryCounts();
    setStatus("Undo");
  }

  function redoProject(): void {
    const next = historyFutureRef.current.shift();
    if (!next) return;
    historyPastRef.current = [...historyPastRef.current, cloneProjectSnapshot(projectRef.current)].slice(-projectHistoryLimit);
    const nextProject = normalizeProject(next);
    projectRef.current = nextProject;
    setProject(nextProject);
    syncProjectHistoryCounts();
    setStatus("Redo");
  }

  function beginLoopMarkerDrag(): void {
    loopDragHistoryRef.current = cloneProjectSnapshot(projectRef.current);
  }

  function commitLoopMarkerDrag(): void {
    const snapshot = loopDragHistoryRef.current;
    loopDragHistoryRef.current = null;
    if (!snapshot) return;
    if (serializeProjectForHistory(snapshot) === serializeProjectForHistory(projectRef.current)) return;
    pushProjectHistory(snapshot);
  }

  function markProjectClean(nextProject: GamingProject): void {
    cleanProjectSnapshotRef.current = serializeProjectForDirty(nextProject);
    setProjectDirty(false);
    window.gamingLooper.setProjectDirty(false);
  }

  function updateSePreloadProgress(progress: SePreloadProgress): void {
    setSePreloadMap((current) => ({
      ...current,
      [progress.filePath]: {
        status: progress.status,
        error: progress.error
      }
    }));
  }

  async function saveCurrentProject(updateStatus = true): Promise<SaveCurrentProjectResult> {
    if (!loaded) {
      return { ok: false, error: "Project is still loading." };
    }
    try {
      commitPlaylistListeningTime(performance.now(), true);
      const projectToSave = normalizeProject({ ...projectRef.current, updatedAt: new Date().toISOString() });
      const saveResult = await window.gamingLooper.saveProject(projectToSave);
      if (saveResult.canceled || !saveResult.path) {
        const message = language === "ja" ? "保存先の指定がキャンセルされました。" : "Save location selection was canceled.";
        if (updateStatus) setStatus(message);
        return { ok: false, error: message };
      }
      setProjectStorePath(saveResult.path);
      projectRef.current = projectToSave;
      setProject(projectToSave);
      markProjectClean(projectToSave);
      if (updateStatus) setStatus(t("projectSaved"));
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Project save failed.";
      setStatus(message);
      return { ok: false, error: message };
    }
  }

  async function loadProjectFromStore(): Promise<void> {
    if (detectionProgress) {
      setStatus(language === "ja" ? "アプリ状態をロードする前にAuto Loopを中止してください。" : "Cancel Auto Loop before loading app state.");
      return;
    }
    if (
      projectDirty &&
      !(await requestConfirm({
        title: language === "ja" ? "アプリ状態をロード" : "Load App State",
        message: "保存済みのアプリ状態をロードしますか？",
        detail: "未保存の変更は破棄されます。",
        confirmLabel: language === "ja" ? "ロード" : "Load",
        danger: true
      }))
    ) return;
    try {
      resetRuntimeStateForProjectChange();
      const saved = await window.gamingLooper.loadProject();
      const nextProject = normalizeProject(saved ?? createEmptyProject());
      markProjectClean(nextProject);
      projectRef.current = nextProject;
      clearProjectHistory();
      setProject(nextProject);
      setLoaded(true);
      setStatus(saved ? t("projectLoaded") : language === "ja" ? "保存済みのアプリ状態がないため初期化しました。" : "No saved app state. Initialized.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : language === "ja" ? "アプリ状態のロードに失敗しました。" : "Project load failed.");
    }
  }

  async function openProjectStoreFolder(): Promise<void> {
    try {
      const result = await window.gamingLooper.openProjectStoreFolder();
      setStatus(result.ok ? (language === "ja" ? "保存場所を開きました。" : "Save folder opened.") : result.error ?? (language === "ja" ? "保存場所を開けませんでした。" : "Could not open save folder."));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : language === "ja" ? "保存場所を開けませんでした。" : "Could not open save folder.");
    }
  }

  async function refreshDataFolderInfo(): Promise<void> {
    try {
      setDataFolderInfo(await window.gamingLooper.getDataFolderInfo());
    } catch {
      setDataFolderInfo({ sequencePath: null, seSetPath: null });
    }
  }

  async function selectDataFolder(kind: DataFolderKind): Promise<void> {
    try {
      const result = await window.gamingLooper.selectDataFolder(kind);
      if (result.canceled || !result.path) {
        setStatus(language === "ja" ? "保存先フォルダの指定をキャンセルしました。" : "Save folder selection was canceled.");
        return;
      }
      await refreshDataFolderInfo();
      setStatus(
        language === "ja"
          ? `${kind === "sequence" ? "Sequence" : "SE Set"}保存先を設定しました: ${result.path}`
          : `${kind === "sequence" ? "Sequence" : "SE Set"} save folder selected: ${result.path}`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : language === "ja" ? "保存先フォルダの設定に失敗しました。" : "Save folder selection failed.");
    }
  }

  async function openDataFolder(kind: DataFolderKind): Promise<void> {
    try {
      const result = await window.gamingLooper.openDataFolder(kind);
      setStatus(
        result.ok
          ? language === "ja"
            ? "保存先フォルダを開きました。"
            : "Save folder opened."
          : result.error ?? (language === "ja" ? "保存先フォルダを開けませんでした。" : "Could not open save folder.")
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : language === "ja" ? "保存先フォルダを開けませんでした。" : "Could not open save folder.");
    }
  }

  async function selectProjectStorePath(): Promise<void> {
    if (!loaded) {
      setStatus(language === "ja" ? "Project is still loading." : "Project is still loading.");
      return;
    }
    try {
      commitPlaylistListeningTime(performance.now(), true);
      const projectToSave = normalizeProject({ ...projectRef.current, updatedAt: new Date().toISOString() });
      const saveResult = await window.gamingLooper.saveProjectAs(projectToSave);
      if (saveResult.canceled || !saveResult.path) {
        setStatus(language === "ja" ? "保存先の指定がキャンセルされました。" : "Save location selection was canceled.");
        return;
      }
      setProjectStorePath(saveResult.path);
      projectRef.current = projectToSave;
      setProject(projectToSave);
      markProjectClean(projectToSave);
      setStatus(language === "ja" ? `保存先を設定して保存しました: ${saveResult.path}` : `Save location selected: ${saveResult.path}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : language === "ja" ? "保存先の設定に失敗しました。" : "Save location selection failed.");
    }
  }

  async function exportProjectBackup(): Promise<void> {
    if (!loaded) return;
    try {
      const result = await window.gamingLooper.exportProjectBackup(normalizeProject(projectRef.current));
      if (!result) return;
      setStatus(language === "ja" ? `設定を保存しました: ${result.path}` : `Settings saved: ${result.path}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : language === "ja" ? "設定の保存に失敗しました。" : "Settings save failed.");
    }
  }

  async function importProjectBackup(): Promise<void> {
    if (detectionProgress) {
      setStatus(language === "ja" ? "設定を読み込む前にAuto Loopを中止してください。" : "Cancel Auto Loop before loading settings.");
      return;
    }
    if (
      projectDirty &&
      !(await requestConfirm({
        title: language === "ja" ? "設定の読み込み" : "Load Settings",
        message: language === "ja" ? "設定を読み込みますか？" : "Load settings?",
        detail: "未保存の変更は破棄されます。",
        confirmLabel: language === "ja" ? "読み込み" : "Load",
        danger: true
      }))
    ) return;
    try {
      const result = await window.gamingLooper.importProjectBackup();
      if (!result) return;
      resetRuntimeStateForProjectChange();
      const nextProject = normalizeProject(result.project);
      projectRef.current = nextProject;
      clearProjectHistory();
      setProject(nextProject);
      setLoaded(true);
      setStatus(language === "ja" ? `設定を読み込みました: ${result.path}` : `Settings loaded: ${result.path}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : language === "ja" ? "設定の読み込みに失敗しました。" : "Settings load failed.");
    }
  }

  async function initializeProjectState(): Promise<void> {
    if (detectionProgress) {
      setStatus(language === "ja" ? "アプリ状態を初期化する前にAuto Loopを中止してください。" : "Cancel Auto Loop before initializing app state.");
      return;
    }
    if (
      !(await requestConfirm({
        title: language === "ja" ? "アプリ状態を初期化" : "Initialize App State",
        message: "アプリ状態を初期化しますか？",
        detail: "設定、読み込み波形、ループ設定、プレイリスト、SE割り当てが現在の画面から消えます。",
        confirmLabel: language === "ja" ? "初期化" : "Initialize",
        danger: true
      }))
    ) return;
    resetRuntimeStateForProjectChange();
    const nextProject = normalizeProject(createEmptyProject());
    projectRef.current = nextProject;
    clearProjectHistory();
    setProject(nextProject);
    setStatus(t("projectInitialized"));
  }

  async function trueInitializeProjectState(): Promise<void> {
    if (!import.meta.env.DEV) return;
    if (detectionProgress) {
      setStatus(language === "ja" ? "真初期化する前にAuto Loopを中止してください。" : "Cancel Auto Loop before true initialize.");
      return;
    }
    if (
      !(await requestConfirm({
        title: language === "ja" ? "真初期化" : "True Initialize",
        message: language === "ja" ? "Debug用の真初期化を実行しますか？" : "Run debug true initialize?",
        detail:
          language === "ja"
            ? "現在のアプリ状態に加えて、保存先の記憶も初期化します。外部の保存ファイル本体は削除しません。"
            : "This resets the current app state and the remembered save location. The external save file itself is not deleted.",
        confirmLabel: language === "ja" ? "真初期化" : "True Initialize",
        danger: true
      }))
    ) return;
    resetRuntimeStateForProjectChange();
    const nextProject = normalizeProject(createEmptyProject());
    projectRef.current = nextProject;
    clearProjectHistory();
    setProject(nextProject);
    setDebugPlaybackRateState(1);
    debugPlaybackRateRef.current = 1;
    audioRef.current.setDebugPlaybackRate(1);
    try {
      const result = await window.gamingLooper.clearProjectStoreLocation();
      setProjectStorePath(result.path);
      setStatus(language === "ja" ? "真初期化しました。" : "True initialize complete.");
    } catch (error) {
      setProjectStorePath(null);
      setStatus(error instanceof Error ? error.message : language === "ja" ? "真初期化しましたが保存先メタの初期化に失敗しました。" : "True initialize completed, but save-location reset failed.");
    }
  }

  function resetRuntimeStateForProjectChange(): void {
    commitPlaylistListeningTime();
    clearPlaylistTimers();
    audioRef.current.stopBgm(0);
    audioRef.current.stopAllSe();
    clearVisualHoldKeys();
    activeKeysSignatureRef.current = "";
    voiceCountRef.current = 0;
    seTransientLevelRef.current = 0;
    const stoppedPlayback: PlaybackState = { mode: "stopped" };
    playbackRef.current = stoppedPlayback;
    setPlayback(stoppedPlayback);
    positionMsRef.current = 0;
    bgmPositionStoreRef.current.set(0);
    updateDisplayedBgmPositionMs(0);
    setVoiceCount(0);
    setSeTransientLevel(0);
    setLastPlayedSeFile(null);
    updateDisplayedSePositionMs(0);
    setActiveKeys(new Set());
  }

  function holdSeKeyVisual(key: SeKey, durationMs: number): void {
    if (projectRef.current.visual.potatoMode) return;
    const timers = visualHoldTimersRef.current;
    const existingTimer = timers.get(key);
    if (existingTimer !== undefined) window.clearTimeout(existingTimer);
    setVisualHoldKeys((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
    const holdMs = Math.max(260, Math.min(720, Math.round(durationMs)));
    const timer = window.setTimeout(() => {
      timers.delete(key);
      setVisualHoldKeys((current) => {
        if (!current.has(key)) return current;
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }, holdMs);
    timers.set(key, timer);
  }

  function clearVisualHoldKeys(updateState = true): void {
    for (const timer of visualHoldTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    visualHoldTimersRef.current.clear();
    if (updateState) setVisualHoldKeys(new Set());
  }

  function clearVisualHoldKey(key: SeKey): void {
    const timer = visualHoldTimersRef.current.get(key);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      visualHoldTimersRef.current.delete(key);
    }
    setVisualHoldKeys((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function selectTrack(trackId: string): void {
    if (detectionProgress) {
      detectionSelectionLockedRef.current = true;
    }
    setProjectState((draft) => ({ ...draft, selectedTrackId: trackId }), { history: false });
  }

  async function importBgm(): Promise<void> {
    const result = await window.gamingLooper.importBgmFiles();
    await applyBgmImport(result.tracks, result.errors);
  }

  async function importBgmForSequenceBuilder(): Promise<void> {
    const result = await window.gamingLooper.importBgmFiles();
    await applyBgmImport(result.tracks, result.errors, {
      afterImport: openSequenceBuilderAfterBgmImport
    });
  }

  function openSequenceBuilderAfterBgmImport(importedCount: number): void {
    if (importedCount > 0 || projectRef.current.bgmTracks.length > 0) {
      setView("loop");
      setStatus(language === "ja" ? "BGM Sourceへ読み込みました。" : "BGM loaded into BGM Source.");
    }
  }

  async function applyBgmImport(tracks: BgmTrack[], errors: string[], options: { afterImport?: (importedCount: number) => void } = {}): Promise<number> {
    if (tracks.length === 0 && errors.length > 0) {
      setStatus(errors[0] ?? "Import failed.");
      return 0;
    }
    const existingByPath = new Map(projectRef.current.bgmTracks.map((track) => [track.filePath.toLowerCase(), track]));
    const existing = new Set(existingByPath.keys());
    const nextTracks = tracks.filter((track) => !existing.has(track.filePath.toLowerCase()));
    const restoredHiddenTrackIds = Array.from(
      new Set(
        tracks
          .map((track) => existingByPath.get(track.filePath.toLowerCase())?.id)
          .filter((id): id is string => Boolean(id && projectRef.current.sourceHiddenTrackIds.includes(id)))
      )
    );
    const expIdentityGroups = nextTracks.map((track) => [getFileIdentity(track.file)]);
    const expIdentities = expIdentityGroups.flat();
    queueLoadExpIdentityAwardAnimations(projectRef.current, expIdentityGroups);
    setProjectState((draft) => {
      return recordLoadExpIdentities({
        ...draft,
        selectedTrackId: draft.selectedTrackId ?? nextTracks[0]?.id ?? restoredHiddenTrackIds[0] ?? null,
        sourceHiddenTrackIds: draft.sourceHiddenTrackIds.filter((id) => !restoredHiddenTrackIds.includes(id)),
        bgmTracks: [...draft.bgmTracks, ...nextTracks]
      }, expIdentities);
    });
    setStatus(errors.length > 0 ? errors[0] ?? "Imported with warnings." : `Imported ${tracks.length} BGM file(s).`);
    options.afterImport?.(nextTracks.length + restoredHiddenTrackIds.length);
    if (!detectionSettings.autoDetectOnImport || nextTracks.length === 0) {
      void hydrateMissingWaveforms(nextTracks);
      return nextTracks.length;
    }
    await runDetection(nextTracks, "Auto Loop imported BGM");
    return nextTracks.length;
  }

  async function hydrateMissingWaveforms(tracks: BgmTrack[]): Promise<void> {
    const targets = tracks.filter((track) => !track.waveform && usesRendererWaveformHydration(track.format));
    for (const track of targets) {
      try {
        const waveform = await loadWaveformWithWebAudio(track);
        setProjectState((draft) => ({
          ...draft,
          bgmTracks: draft.bgmTracks.map((item) => (item.id === track.id && !item.waveform ? { ...item, waveform } : item))
        }), { history: false });
      } catch {
        // Import remains valid even if the browser decoder cannot build a preview waveform.
      }
    }
  }

  async function assignSeFromDialog(startKey: SeKey): Promise<void> {
    const result = await window.gamingLooper.importSeFiles();
    if (result.files.length === 0) {
      setStatus(result.errors[0] ?? "No SE file selected.");
      return;
    }
    const startIndex = Math.max(0, seKeys.indexOf(startKey));
    const expIdentityGroups = result.files.map((file) => [getFileIdentity(file.file)]);
    const expIdentities = expIdentityGroups.flat();
    queueLoadExpIdentityAwardAnimations(projectRef.current, expIdentityGroups);
    setProjectState((draft) => {
      const assignments = [...draft.seAssignments];
      result.files.forEach((file, offset) => {
        const key = seKeys[startIndex + offset];
        if (!key) return;
        const index = assignments.findIndex((assignment) => assignment.key === key);
        if (index < 0) return;
        assignments[index] = assignSeFile(assignments[index], file);
      });
      return recordLoadExpIdentities({ ...draft, seAssignments: assignments }, expIdentities);
    });
    setStatus(result.errors.length > 0 ? result.errors[0] ?? "Imported SE with warnings." : `Assigned ${result.files.length} SE file(s).`);
  }

  function assignDroppedSeFiles(targetKey: string | null, files: SeFile[], errors: string[], droppedCount: number): void {
    if (files.length === 0) {
      setStatus(errors[0] ?? "No SE file was loaded.");
      return;
    }

    const target = parseSeKey(targetKey);
    const currentByKey = new Map(project.seAssignments.map((assignment) => [assignment.key, assignment]));
    const plan: Array<{ key: SeKey; file: SeFile }> = [];
    const reservedKeys = new Set<SeKey>();
    let fileIndex = 0;

    if (target && files[0]) {
      plan.push({ key: target, file: files[0] });
      reservedKeys.add(target);
      fileIndex = 1;
    }

    const emptyKeys = seKeys.filter((key) => !reservedKeys.has(key) && !currentByKey.get(key)?.file);
    for (const key of emptyKeys) {
      const file = files[fileIndex];
      if (!file) break;
      plan.push({ key, file });
      fileIndex += 1;
    }

    if (plan.length === 0) {
      setStatus("No empty SE keys are available.");
      return;
    }

    const planByKey = new Map(plan.map((item) => [item.key, item.file]));
    const expIdentityGroups = plan.map((item) => [getFileIdentity(item.file.file)]);
    const expIdentities = expIdentityGroups.flat();
    queueLoadExpIdentityAwardAnimations(projectRef.current, expIdentityGroups);
    const replacedLastPlayed = Boolean(
      lastPlayedSeFile &&
        plan.some((item) => currentByKey.get(item.key)?.file?.id === lastPlayedSeFile.id)
    );

    setProjectState((draft) =>
      recordLoadExpIdentities(
        {
          ...draft,
          seAssignments: draft.seAssignments.map((assignment) => {
            const file = planByKey.get(assignment.key);
            return file ? assignSeFile(assignment, file) : assignment;
          })
        },
        expIdentities
      )
    );

    if (replacedLastPlayed) {
      setLastPlayedSeFile(null);
      updateDisplayedSePositionMs(0);
    }

    const skipped = Math.max(0, droppedCount - plan.length);
    const targetText = target ? ` ${target} overwritten.` : "";
    const skippedText = skipped > 0 ? ` ${skipped} file(s) ignored.` : "";
    setStatus(errors.length > 0 ? `${errors[0]} Assigned ${plan.length} SE file(s).${skippedText}` : `Assigned ${plan.length} dropped SE file(s).${targetText}${skippedText}`);
  }

  async function triggerSe(key: SeKey): Promise<void> {
    const assignment = project.seAssignments.find((item) => item.key === key);
    if (!assignment?.file) return;
    const preloadState = sePreloadMap[assignment.file.filePath];
    if (preloadState?.status === "error") {
      setStatus(`SE preload failed: ${assignment.file.fileName}`);
      return;
    }
    if (preloadState?.status !== "ready" || !audioRef.current.isSeReady(assignment.file.filePath)) {
      setStatus(`SE loading: ${assignment.file.fileName}`);
      return;
    }
    try {
      const hadSeAnalyser = audioRef.current.getSeAnalyser() !== null;
      await audioRef.current.ready();
      audioRef.current.setMix(projectRef.current.mix);
      const playback = await audioRef.current.playSe(assignment.file, projectRef.current.mix.seVoiceLimit, {
        volume: clampSeVolume(assignment.volume),
        pan: clampSePan(assignment.pan),
        playbackKey: key
      });
      if (!hadSeAnalyser) setAudioReadyTick((value) => value + 1);
      holdSeKeyVisual(key, playback.durationMs);
      setLastPlayedSeFile(assignment.file);
      updateDisplayedSePositionMs(audioRef.current.getLatestSePositionMs(playback.fileId));
      const nextVoiceCount = audioRef.current.getActiveVoiceCount();
      voiceCountRef.current = nextVoiceCount;
      setVoiceCount(nextVoiceCount);
      const nextTransient = audioRef.current.getSeTransientLevel();
      seTransientLevelRef.current = nextTransient;
      setSeTransientLevel(nextTransient);
      const nextActiveKeys = getActiveSeKeys(audioRef.current.getActiveSePlaybackKeys());
      activeKeysSignatureRef.current = Array.from(nextActiveKeys).sort().join("");
      setActiveKeys(nextActiveKeys);
      awardSePlaybackExp(key);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SE playback failed.");
    }
  }

  function awardSePlaybackExp(key: SeKey): void {
    const amount = calculateSePlaybackExpAward(Math.random(), Math.random());
    if (amount <= 0) return;
    const currentProject = projectRef.current;
    if (getActiveSeSetExpTotal(currentProject) >= seSetExpAwardLimit) {
      queueExpLimitAnimation();
      setStatus("EXP Limit");
      return;
    }
    const identities = createSePlaybackExpIdentities(key, amount);
    const effectiveAmount = queueLoadExpIdentityAwardAnimations(currentProject, [identities]);
    if (effectiveAmount <= 0) return;
    setProjectState((draft) => addActiveSeSetExpTotal(recordLoadExpIdentities(draft, identities), effectiveAmount), { history: false });
    setStatus(`SE EXP +${effectiveAmount}`);
  }

  function stopSe(key: SeKey): void {
    const stopped = audioRef.current.stopSeByPlaybackKey(key);
    clearVisualHoldKey(key);
    const nextVoiceCount = audioRef.current.getActiveVoiceCount();
    voiceCountRef.current = nextVoiceCount;
    setVoiceCount(nextVoiceCount);
    const nextTransient = nextVoiceCount > 0 ? audioRef.current.getSeTransientLevel() : 0;
    seTransientLevelRef.current = nextTransient;
    setSeTransientLevel(nextTransient);
    const nextActiveKeys = getActiveSeKeys(audioRef.current.getActiveSePlaybackKeys());
    activeKeysSignatureRef.current = Array.from(nextActiveKeys).sort().join("");
    setActiveKeys(nextActiveKeys);
    if (stopped) {
      updateDisplayedSePositionMs(audioRef.current.getLatestSePositionMs(lastPlayedSeFile?.id));
    }
  }

  function stopAllSe(): void {
    audioRef.current.stopAllSe();
    clearVisualHoldKeys();
    updateDisplayedSePositionMs(0);
    voiceCountRef.current = 0;
    seTransientLevelRef.current = 0;
    activeKeysSignatureRef.current = "";
    setVoiceCount(0);
    setSeTransientLevel(0);
    setActiveKeys(new Set());
  }

  function changeSeIcon(key: SeKey, delta: number): void {
    setProjectState((draft) => ({
      ...draft,
      seAssignments: draft.seAssignments.map((assignment) =>
        assignment.key === key && assignment.file ? applySeIcon(assignment, cycleSeIconId(assignment.iconId, delta)) : assignment
      )
    }));
  }

  function selectSeIcon(key: SeKey, iconId: SeIconId): void {
    setProjectState((draft) => ({
      ...draft,
      seAssignments: draft.seAssignments.map((assignment) =>
        assignment.key === key && assignment.file ? applySeIcon(assignment, iconId) : assignment
      )
    }));
  }

  function updateSeAssignmentSettings(key: SeKey, patch: Partial<Pick<SeAssignment, "volume" | "pan">>): void {
    const livePatch: Partial<Pick<SeAssignment, "volume" | "pan">> = {};
    if (patch.volume !== undefined) livePatch.volume = clampSeVolume(patch.volume);
    if (patch.pan !== undefined) livePatch.pan = clampSePan(patch.pan);
    audioRef.current.updateActiveSeSettings(key, livePatch);
    setProjectState((draft) => ({
      ...draft,
      seAssignments: draft.seAssignments.map((assignment) =>
        assignment.key === key
          ? {
              ...assignment,
              volume: patch.volume === undefined ? clampSeVolume(assignment.volume) : clampSeVolume(patch.volume),
              pan: patch.pan === undefined ? clampSePan(assignment.pan) : clampSePan(patch.pan)
            }
          : assignment
      )
    }));
  }

  function updateSeAssignmentsSettings(updates: Array<{ key: SeKey; patch: Partial<Pick<SeAssignment, "volume" | "pan">> }>): void {
    const updateByKey = new Map<SeKey, Partial<Pick<SeAssignment, "volume" | "pan">>>();
    for (const update of updates) {
      const livePatch: Partial<Pick<SeAssignment, "volume" | "pan">> = {};
      if (update.patch.volume !== undefined) livePatch.volume = clampSeVolume(update.patch.volume);
      if (update.patch.pan !== undefined) livePatch.pan = clampSePan(update.patch.pan);
      if (livePatch.volume === undefined && livePatch.pan === undefined) continue;
      updateByKey.set(update.key, livePatch);
      audioRef.current.updateActiveSeSettings(update.key, livePatch);
    }
    if (updateByKey.size === 0) return;
    setProjectState((draft) => ({
      ...draft,
      seAssignments: draft.seAssignments.map((assignment) => {
        const patch = updateByKey.get(assignment.key);
        if (!patch) return assignment;
        return {
          ...assignment,
          volume: patch.volume === undefined ? clampSeVolume(assignment.volume) : clampSeVolume(patch.volume),
          pan: patch.pan === undefined ? clampSePan(assignment.pan) : clampSePan(patch.pan)
        };
      })
    }));
  }

  function transferSeAssignment(sourceKey: SeKey, targetKey: SeKey, options: { copy: boolean }): void {
    if (sourceKey === targetKey) return;
    const currentSource = project.seAssignments.find((assignment) => assignment.key === sourceKey);
    if (!currentSource?.file) return;

    setProjectState((draft) => {
      const sourceAssignment = draft.seAssignments.find((assignment) => assignment.key === sourceKey);
      const targetAssignment = draft.seAssignments.find((assignment) => assignment.key === targetKey);
      if (!sourceAssignment?.file || !targetAssignment) return draft;
      return {
        ...draft,
        seAssignments: draft.seAssignments.map((assignment) => {
          if (assignment.key === targetKey) return rekeySeAssignment(sourceAssignment, targetKey);
          if (!options.copy && assignment.key === sourceKey) return rekeySeAssignment(targetAssignment, sourceKey);
          return assignment;
        })
      };
    });

    setStatus(
      options.copy
        ? language === "ja"
          ? `SE ${sourceKey}を${targetKey}へコピーしました。`
          : `Copied SE ${sourceKey} to ${targetKey}.`
        : language === "ja"
          ? `SE ${sourceKey}と${targetKey}を入れ替えました。`
          : `Swapped SE ${sourceKey} and ${targetKey}.`
    );
  }

  function unloadSeAssignment(key: SeKey): void {
    const currentFile = project.seAssignments.find((assignment) => assignment.key === key)?.file ?? null;
    if (!currentFile) return;
    setProjectState((draft) => ({
      ...draft,
      seAssignments: draft.seAssignments.map((assignment) =>
        assignment.key === key
          ? {
              ...assignment,
              file: null,
              iconId: null,
              iconSource: "none"
            }
          : assignment
      )
    }));
    if (lastPlayedSeFile?.id === currentFile.id) {
      setLastPlayedSeFile(null);
      updateDisplayedSePositionMs(0);
    }
    setStatus(`Unloaded SE from ${key}.`);
  }

  function resetSeAssignmentSettings(mode: SeConfigMode): void {
    for (const key of seKeys) {
      audioRef.current.updateActiveSeSettings(key, mode === "volume" ? { volume: 1 } : { pan: 0 });
    }
    setProjectState((draft) => ({
      ...draft,
      seAssignments: draft.seAssignments.map((assignment) => ({
        ...assignment,
        volume: mode === "volume" ? 1 : clampSeVolume(assignment.volume),
        pan: mode === "pan" ? 0 : clampSePan(assignment.pan)
      }))
    }));
  }

  function clearSeAssignments(): void {
    setProjectState((draft) => ({
      ...draft,
      activeSeSetId: null,
      activeSeSetName: null,
      seAssignments: draft.seAssignments.map((assignment) => ({
        ...assignment,
        file: null,
        iconId: null,
        iconSource: "none"
      }))
    }));
    setStatus("All SE assignments cleared.");
  }

  async function saveCurrentSeSetFile(): Promise<void> {
    const currentProject = projectRef.current;
    const assignedCount = currentProject.seAssignments.filter((assignment) => assignment.file).length;
    if (assignedCount === 0) {
      setStatus(language === "ja" ? "保存するSE割り当てがありません。" : "No SE assignments to save.");
      return;
    }
    const defaultName = currentProject.activeSeSetName ?? `SE Set ${currentProject.savedSeSets.length + 1}`;
    const currentSeSetExpTotal = getActiveSeSetExpTotal(currentProject);
    const draftSet = createSavedSeSet(defaultName, currentProject.seAssignments, currentProject.mix.seVoiceLimit, undefined, undefined, currentSeSetExpTotal);
    const payload: SeSetFile = {
      fileKind: "gaminglooper.se-set",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      seSet: cloneSavedSeSet(draftSet)
    };
    try {
      const result = await window.gamingLooper.exportSeSetFile(payload);
      if (!result) return;
      const savedName = seSetNameFromPath(result.path) ?? draftSet.name;
      const latestProject = projectRef.current;
      const sameNameSet = latestProject.savedSeSets.find((set) => set.name.trim() === savedName.trim());
      const savedExpTotal = getSeSetExpTotalForSave(defaultName, savedName, currentSeSetExpTotal);
      const savedSet = createSavedSeSet(savedName, latestProject.seAssignments, latestProject.mix.seVoiceLimit, sameNameSet?.id ?? draftSet.id, sameNameSet?.createdAt ?? draftSet.createdAt, savedExpTotal);
      setProjectState((draft) => {
        const exists = draft.savedSeSets.some((set) => set.id === savedSet.id);
        return {
          ...draft,
          activeSeSetId: savedSet.id,
          activeSeSetName: savedSet.name,
          savedSeSets: exists ? draft.savedSeSets.map((set) => (set.id === savedSet.id ? savedSet : set)) : [...draft.savedSeSets, savedSet]
        };
      });
      setStatus(language === "ja" ? `SE Setを保存しました: ${savedName}` : `SE Set saved: ${savedName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SE Set save failed.");
    }
  }

  async function importSeSetFile(): Promise<void> {
    try {
      const result = await window.gamingLooper.importSeSetFile();
      if (!result) return;
      const importedSet = normalizeSavedSeSets([result.seSet.seSet])[0];
      if (!importedSet) {
        setStatus(language === "ja" ? "SE Setファイルを読み込めませんでした。" : "SE Set file could not be loaded.");
        return;
      }
      const sameNameSet = projectRef.current.savedSeSets.find((set) => set.name.trim() === importedSet.name.trim());
      if (
        sameNameSet &&
        !(await requestConfirm({
          title: language === "ja" ? "SE Set上書き" : "Overwrite SE Set",
          message:
            language === "ja"
              ? `同名のSE Set「${importedSet.name}」があります。上書きしますか？`
              : `An SE Set named "${importedSet.name}" already exists. Overwrite it?`,
          detail:
            language === "ja"
              ? "OKを押すと保存済みSE Setと現在のSE Pad割り当てが読み込んだ内容に置き換わります。"
              : "OK replaces the saved SE Set and current SE Pad assignments with the imported file.",
          confirmLabel: language === "ja" ? "OK" : "OK"
        }))
      ) {
        return;
      }
      const savedSet = {
        ...cloneSavedSeSet(importedSet),
        id: sameNameSet?.id ?? createLocalId(),
        createdAt: sameNameSet?.createdAt ?? importedSet.createdAt,
        updatedAt: new Date().toISOString()
      };
      audioRef.current.stopAllSe();
      voiceCountRef.current = 0;
      seTransientLevelRef.current = 0;
      setVoiceCount(0);
      setSeTransientLevel(0);
      setLastPlayedSeFile(null);
      updateDisplayedSePositionMs(0);
      setActiveKeys(new Set());
      setProjectState((draft) => {
        const exists = draft.savedSeSets.some((set) => set.id === savedSet.id);
        return {
          ...draft,
          activeSeSetId: savedSet.id,
          activeSeSetName: seSetNameFromPath(result.path) ?? savedSet.name,
          seAssignments: cloneSeAssignments(savedSet.assignments),
          mix: {
            ...draft.mix,
            seVoiceLimit: Math.round(clampNumber(savedSet.voiceLimit, 1, 32, draft.mix.seVoiceLimit))
          },
          savedSeSets: exists ? draft.savedSeSets.map((set) => (set.id === savedSet.id ? savedSet : set)) : [...draft.savedSeSets, savedSet]
        };
      });
      setStatus(language === "ja" ? `SE Setを読み込みました: ${savedSet.name}` : `SE Set imported: ${savedSet.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "SE Set import failed.");
    }
  }

  async function playTrack(trackId?: string | null): Promise<void> {
    const track = projectRef.current.bgmTracks.find((candidate) => candidate.id === trackId) ?? selectedTrack;
    if (!track) {
      setStatus("Import or select a BGM track first.");
      return;
    }
    commitPlaylistListeningTime();
    clearPlaylistTimers();
    try {
      await audioRef.current.ready();
      audioRef.current.setMix(projectRef.current.mix);
      await audioRef.current.playBgm(track, { loop: true });
      positionMsRef.current = 0;
      bgmPositionStoreRef.current.set(0);
      updateDisplayedBgmPositionMs(0);
      setAudioReadyTick((value) => value + 1);
      setProjectState((draft) => ({ ...draft, selectedTrackId: track.id }), { history: false });
      const nextPlayback: PlaybackState = { mode: "track", trackId: track.id, startedAt: performance.now(), rate: debugPlaybackRateRef.current };
      playbackRef.current = nextPlayback;
      setPlayback(nextPlayback);
      setStatus(`Track play: ${track.fileName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "BGM playback failed.");
    }
  }

  async function playSelectedTrack(): Promise<void> {
    await playTrack(projectRef.current.selectedTrackId ?? selectedTrack?.id ?? null);
  }

  async function playSelectedTrackBeforeLoop(): Promise<void> {
    if (!selectedTrack) {
      setStatus("Import or select a BGM track first.");
      return;
    }
    if (!selectedTrack.loop) {
      setStatus(language === "ja" ? "ループ位置があるBGMを選択してください。" : "Select a BGM track with loop markers.");
      return;
    }
    const loopStartMs = sampleToMs(selectedTrack.loop.startSample, selectedTrack.sampleRate);
    const loopEndMs = sampleToMs(selectedTrack.loop.endSample, selectedTrack.sampleRate);
    const loopCheckPrerollMs = Math.max(LOOP_END_PREVIEW_MIN_PREROLL_MS, detectionSettings.loopCheckPrerollMs);
    const offsetMs = Math.max(loopStartMs, loopEndMs - loopCheckPrerollMs);
    commitPlaylistListeningTime();
    clearPlaylistTimers();
    try {
      await audioRef.current.ready();
      audioRef.current.setMix(projectRef.current.mix);
      await audioRef.current.playBgm(selectedTrack, { loop: true, offsetMs });
      positionMsRef.current = offsetMs;
      bgmPositionStoreRef.current.set(offsetMs);
      updateDisplayedBgmPositionMs(offsetMs);
      setAudioReadyTick((value) => value + 1);
      const nextPlayback: PlaybackState = { mode: "track", trackId: selectedTrack.id, startedAt: performance.now(), rate: debugPlaybackRateRef.current };
      playbackRef.current = nextPlayback;
      setPlayback(nextPlayback);
      setStatus(language === "ja" ? `ループ確認: ${selectedTrack.fileName}` : `Loop check: ${selectedTrack.fileName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "BGM playback failed.");
    }
  }

  function finishPlaylistItem(item: PlaylistItem, index: number): void {
    const latestProject = projectRef.current;
    const latestEnabledPlaylist = latestProject.playlistCreated ? getEnabledPlaylistItems(latestProject.playlist) : [];
    const latestCurrentIndex = latestEnabledPlaylist.findIndex((candidate) => candidate.id === item.id);
    const effectiveEndBehavior: PlaylistEndBehavior = latestProject.allListRepeatEnabled ? "stop" : latestProject.playlistEndBehavior;
    const nextIndex = getNextPlaylistIndex(
      latestCurrentIndex >= 0 ? latestCurrentIndex : index,
      latestEnabledPlaylist.length,
      effectiveEndBehavior
    );
    if (nextIndex === null) {
      if (latestProject.allListRepeatEnabled && playNextSavedPlaylistForAllListRepeat(latestProject)) {
        return;
      }
      commitPlaylistListeningTime();
      clearPlaylistTimers();
      const stoppedPlayback: PlaybackState = { mode: "stopped" };
      playbackRef.current = stoppedPlayback;
      setPlayback(stoppedPlayback);
      positionMsRef.current = 0;
      bgmPositionStoreRef.current.set(0);
      updateDisplayedBgmPositionMs(0);
      setStatus(language === "ja" ? "Play List再生が終了しました。" : "Play List finished.");
      return;
    }
    void playPlaylistAt(nextIndex);
  }

  function playNextSavedPlaylistForAllListRepeat(currentProject: GamingProject): boolean {
    if (currentProject.savedPlaylists.length === 0) return false;
    const currentIndex = currentProject.activePlaylistId
      ? currentProject.savedPlaylists.findIndex((playlist) => playlist.id === currentProject.activePlaylistId)
      : -1;
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % currentProject.savedPlaylists.length : 0;
    const nextPlaylist = currentProject.savedPlaylists[nextIndex];
    if (!nextPlaylist) return false;
    if (!loadSavedPlaylist(nextPlaylist.id)) return false;
    void playPlaylistAt(0);
    return true;
  }

  function schedulePlaylistTimers(item: PlaylistItem, index: number, track: BgmTrack, plannedMs: number, debugRate: number, elapsedMs = 0): void {
    const safeRate = sanitizePlaybackRate(debugRate);
    const safeElapsedMs = Math.max(0, Math.min(getPlaylistTransitionDelayMs(plannedMs), elapsedMs));
    const fadeMs = getPlaylistFadeMs(track, item.rule);
    const fadeStartMs = getPlaylistFadeStartMs(plannedMs, fadeMs);
    if (fadeMs > 0 && safeElapsedMs < plannedMs) {
      if (safeElapsedMs >= fadeStartMs) {
        audioRef.current.fadeOutBgm(Math.max(1, (plannedMs - safeElapsedMs) / safeRate));
      } else {
        playlistFadeTimerRef.current = window.setTimeout(() => {
          audioRef.current.fadeOutBgm(Math.max(1, fadeMs / safeRate));
        }, Math.max(0, (fadeStartMs - safeElapsedMs) / safeRate));
      }
    }
    playlistTimerRef.current = window.setTimeout(() => {
      finishPlaylistItem(item, index);
    }, Math.max(1, (getPlaylistTransitionDelayMs(plannedMs) - safeElapsedMs) / safeRate));
  }

  async function seekSelectedBgm(offsetMs: number): Promise<void> {
    const currentProject = projectRef.current;
    const track = currentProject.bgmTracks.find((candidate) => candidate.id === currentProject.selectedTrackId) ?? selectedTrack;
    if (!track) return;

    const safeOffsetMs = Math.max(0, Math.min(Math.max(1, track.durationMs), offsetMs));
    const currentPlayback = playbackRef.current;
    const playlistContext =
      currentPlayback.mode === "playlist" && currentPlayback.trackId === track.id
        ? getEnabledPlaylistItems(currentProject.playlist).find((item) => item.id === currentPlayback.itemId) ?? null
        : null;

    if (!playlistContext && currentPlayback.mode === "playlist") {
      commitPlaylistListeningTime();
    }
    clearPlaylistTimers();

    try {
      await audioRef.current.ready();
      audioRef.current.setMix(currentProject.mix);
      await audioRef.current.playBgm(track, { loop: playlistContext ? shouldLoopPlaylistPlayback(track, playlistContext.rule) : Boolean(track.loop), offsetMs: safeOffsetMs });
      positionMsRef.current = safeOffsetMs;
      bgmPositionStoreRef.current.set(safeOffsetMs);
      updateDisplayedBgmPositionMs(safeOffsetMs);
      setAudioReadyTick((value) => value + 1);

      const now = performance.now();
      const debugRate = debugPlaybackRateRef.current;
      if (playlistContext) {
        const enabledPlaylist = getEnabledPlaylistItems(currentProject.playlist);
        const index = Math.max(0, enabledPlaylist.findIndex((item) => item.id === playlistContext.id));
        const plannedMs = getPlaylistPlayMs(track, playlistContext.rule);
        const elapsedMs = Math.max(0, Math.min(plannedMs, safeOffsetMs));
        ensurePlaylistListeningSession(currentProject.activePlaylistId, now, debugRate);
        const nextPlayback: PlaybackState = {
          mode: "playlist",
          itemId: playlistContext.id,
          trackId: track.id,
          index,
          startedAt: now - elapsedMs / sanitizePlaybackRate(debugRate),
          plannedMs,
          rate: debugRate
        };
        playbackRef.current = nextPlayback;
        setPlayback(nextPlayback);
        schedulePlaylistTimers(playlistContext, index, track, plannedMs, debugRate, elapsedMs);
      } else {
        const nextPlayback: PlaybackState = { mode: "track", trackId: track.id, startedAt: now - safeOffsetMs / sanitizePlaybackRate(debugRate), rate: debugRate };
        playbackRef.current = nextPlayback;
        setPlayback(nextPlayback);
      }
      setStatus(`${language === "ja" ? "再生位置" : "Seek"}: ${track.fileName} ${formatTimeSeconds(safeOffsetMs)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : language === "ja" ? "再生位置の移動に失敗しました。" : "Seek failed.");
    }
  }

  async function playPlaylistAt(index: number, startElapsedMs = 0): Promise<void> {
    clearPlaylistTimers();
    const currentProject = projectRef.current;
    const currentEnabledPlaylist = currentProject.playlistCreated ? getEnabledPlaylistItems(currentProject.playlist) : [];
    if (!currentProject.playlistCreated) {
      setStatus("Play List has not been created.");
      return;
    }
    const item = currentEnabledPlaylist[index] ?? currentEnabledPlaylist[0];
    if (!item) {
      setStatus("Playlist is empty.");
      return;
    }
    const track = currentProject.bgmTracks.find((candidate) => candidate.id === item.trackId);
    if (!track) {
      setStatus("Playlist item points to a missing BGM track.");
      return;
    }
    try {
      await audioRef.current.ready();
      audioRef.current.setMix(currentProject.mix);
      const plannedMs = getPlaylistPlayMs(track, item.rule);
      const safeStartElapsedMs = Math.max(0, Math.min(plannedMs, startElapsedMs));
      const audioOffsetMs = getPlaylistAudioOffsetMs(track, item.rule, safeStartElapsedMs);
      await audioRef.current.playBgm(track, { loop: shouldLoopPlaylistPlayback(track, item.rule), offsetMs: audioOffsetMs });
      positionMsRef.current = audioOffsetMs;
      bgmPositionStoreRef.current.set(audioOffsetMs);
      updateDisplayedBgmPositionMs(audioOffsetMs);
      setAudioReadyTick((value) => value + 1);
      setProjectState((draft) => ({ ...draft, selectedTrackId: track.id }), { history: false });
      const playlistStartedAt = performance.now();
      const debugRate = debugPlaybackRateRef.current;
      ensurePlaylistListeningSession(currentProject.activePlaylistId, playlistStartedAt, debugRate);
      const nextPlayback: PlaybackState = { mode: "playlist", itemId: item.id, trackId: track.id, index, startedAt: playlistStartedAt - safeStartElapsedMs / sanitizePlaybackRate(debugRate), plannedMs, rate: debugRate };
      playbackRef.current = nextPlayback;
      setPlayback(nextPlayback);
      setStatus(`Playlist play: ${track.fileName}`);
      schedulePlaylistTimers(item, index, track, plannedMs, debugRate, safeStartElapsedMs);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : language === "ja" ? "Play List再生に失敗しました。" : "Playlist playback failed.");
    }
  }

  function getCurrentPlaylistNavigationIndex(items: PlaylistItem[], currentProject: GamingProject): number {
    const currentPlayback = playbackRef.current;
    if (currentPlayback.mode === "playlist") {
      const byItemId = items.findIndex((item) => item.id === currentPlayback.itemId);
      if (byItemId >= 0) return byItemId;
      const byTrackId = items.findIndex((item) => item.trackId === currentPlayback.trackId);
      if (byTrackId >= 0) return byTrackId;
    }
    if (currentProject.selectedTrackId) {
      const bySelectedTrack = items.findIndex((item) => item.trackId === currentProject.selectedTrackId);
      if (bySelectedTrack >= 0) return bySelectedTrack;
    }
    return 0;
  }

  async function jumpPlaylistTrack(direction: -1 | 1): Promise<void> {
    const currentProject = projectRef.current;
    const items = currentProject.playlistCreated ? getEnabledPlaylistItems(currentProject.playlist) : [];
    if (!currentProject.playlistCreated) {
      setStatus(language === "ja" ? "Play Listが未作成です。" : "Play List has not been created.");
      return;
    }
    if (items.length === 0) {
      setStatus(language === "ja" ? "Play Listに曲がありません。" : "Playlist is empty.");
      return;
    }
    if (items.length === 1) {
      await playPlaylistAt(0);
      return;
    }
    const currentIndex = getCurrentPlaylistNavigationIndex(items, currentProject);
    const nextIndex = (currentIndex + direction + items.length) % items.length;
    await playPlaylistAt(nextIndex);
  }

  function stopPlayback(): void {
    commitPlaylistListeningTime();
    clearPlaylistTimers();
    audioRef.current.stopBgm(120);
    const stoppedPlayback: PlaybackState = { mode: "stopped" };
    playbackRef.current = stoppedPlayback;
    setPlayback(stoppedPlayback);
    positionMsRef.current = 0;
    bgmPositionStoreRef.current.set(0);
    updateDisplayedBgmPositionMs(0);
    setStatus(t("stop"));
  }

  function clearPlaylistTimers(): void {
    if (playlistTimerRef.current !== null) window.clearTimeout(playlistTimerRef.current);
    if (playlistFadeTimerRef.current !== null) window.clearTimeout(playlistFadeTimerRef.current);
    playlistTimerRef.current = null;
    playlistFadeTimerRef.current = null;
  }

  async function requestPlaylistPlayback(): Promise<void> {
    if (!project.playlistCreated) {
      if (
        await requestConfirm({
          title: t("buildPlaylist"),
          message: "Play Listを作成しますか？",
          detail: "Play List再生を使うには、先にBuild Play Listでプレイリストを作成します。",
          confirmLabel: t("build")
        })
      ) {
        await importBgmForSequenceBuilder();
      }
      return;
    }
    void playPlaylistAt(0);
  }

  function createPlaylist(): void {
    if (project.bgmTracks.length === 0) {
      setStatus(language === "ja" ? "先にBGMを読み込んでください。" : "Import BGM files first.");
      return;
    }
    setProjectState((draft) => ({
      ...draft,
      playlistCreated: true,
      playlistRating: 0,
      playlistCumulativePlayMs: 0,
      activePlaylistId: null
    }));
    setStatus(language === "ja" ? "Build Sequencerを開始しました。" : "Build Sequencer ready.");
  }

  function addTrackToPlaylist(trackId: string, targetIndex?: number): void {
    const track = projectRef.current.bgmTracks.find((item) => item.id === trackId);
    if (!track) {
      setStatus(language === "ja" ? "BGMトラックを選択してください。" : "Select a BGM track first.");
      return;
    }
    if (projectRef.current.playlist.some((item) => item.trackId === trackId)) {
      setStatus(language === "ja" ? `Build Sequencerに追加済み: ${track.fileName}` : `Already in Build Sequencer: ${track.fileName}`);
      return;
    }
    setProjectState((draft) => ({
      ...draft,
      playlistCreated: true,
      playlistRating: 0,
      playlistCumulativePlayMs: 0,
      activePlaylistId: null,
      selectedTrackId: trackId,
      playlist: insertPlaylistItem(draft.playlist, makePlaylistItem(trackId, draft.playlist.length), targetIndex)
    }));
    setStatus(language === "ja" ? `Play Listへ追加: ${track.fileName}` : `Added to Play List: ${track.fileName}`);
  }

  function addTracksToPlaylist(trackIds: string[], targetIndex?: number): void {
    const uniqueIds = Array.from(new Set(trackIds));
    if (uniqueIds.length === 0) {
      setStatus(language === "ja" ? "BGMトラックを選択してください。" : "Select BGM tracks first.");
      return;
    }

    let addedCount = 0;
    let skippedCount = 0;
    let firstAddedTrackId: string | null = null;
    setProjectState((draft) => {
      const requestedIds = new Set(uniqueIds);
      const existingIds = new Set(draft.playlist.map((item) => item.trackId));
      const orderedTracks = draft.bgmTracks.filter((track) => requestedIds.has(track.id));
      const tracksToAdd = orderedTracks.filter((track) => !existingIds.has(track.id));
      addedCount = tracksToAdd.length;
      skippedCount = uniqueIds.length - tracksToAdd.length;
      firstAddedTrackId = tracksToAdd[0]?.id ?? null;
      if (tracksToAdd.length === 0) return draft;

      const insertIndex = targetIndex === undefined ? draft.playlist.length : Math.max(0, Math.min(targetIndex, draft.playlist.length));
      const nextItems = tracksToAdd.map((track, offset) => makePlaylistItem(track.id, insertIndex + offset));
      return {
        ...draft,
        playlistCreated: true,
        playlistRating: 0,
        playlistCumulativePlayMs: 0,
        activePlaylistId: null,
        selectedTrackId: firstAddedTrackId,
        playlist: [
          ...draft.playlist.slice(0, insertIndex),
          ...nextItems,
          ...draft.playlist.slice(insertIndex)
        ]
      };
    });

    if (addedCount > 0) {
      setStatus(
        language === "ja"
          ? `Play Listへ追加: ${addedCount}曲${skippedCount > 0 ? `（追加済み ${skippedCount}曲を除外）` : ""}`
          : `Added ${addedCount} track${addedCount === 1 ? "" : "s"} to Play List${skippedCount > 0 ? `, skipped ${skippedCount} already added` : ""}.`
      );
    } else {
      setStatus(language === "ja" ? "選択した曲はすべてBuild Sequencerに追加済みです。" : "Selected tracks are already in Build Sequencer.");
    }
  }

  function stopPlaybackForUnavailableTracks(trackIds: Set<string>): void {
    const shouldStopBgm =
      (projectRef.current.selectedTrackId !== null && trackIds.has(projectRef.current.selectedTrackId)) ||
      (playbackRef.current.mode !== "stopped" && trackIds.has(playbackRef.current.trackId));
    if (!shouldStopBgm) return;

    commitPlaylistListeningTime();
    clearPlaylistTimers();
    audioRef.current.stopBgm(80);
    positionMsRef.current = 0;
    bgmPositionStoreRef.current.set(0);
    updateDisplayedBgmPositionMs(0);
    const stoppedPlayback: PlaybackState = { mode: "stopped" };
    playbackRef.current = stoppedPlayback;
    setPlayback(stoppedPlayback);
  }

  async function clearBgmSource(visibleSourceTrackIds: string[]): Promise<void> {
    const result = clearVisibleSourceTracks(projectRef.current, visibleSourceTrackIds);
    const affectedIds = [...result.clearedIds, ...result.skippedReferencedIds];
    if (affectedIds.length === 0) {
      setStatus(
        language === "ja"
          ? "BGM Sourceにクリア対象がありません。"
          : "No BGM Source files to clear."
      );
      return;
    }
    if (
      !(await requestConfirm({
        title: t("sourceClear"),
        message: t("sourceClearConfirmMessage"),
        detail: t("sourceClearConfirmDetail"),
        confirmLabel: t("sourceClear"),
        danger: true
      }))
    ) {
      return;
    }

    stopPlaybackForUnavailableTracks(new Set(affectedIds));

    setProjectState(() => result.project);
    setStatus(
      language === "ja"
        ? `BGM Sourceをクリアしました: ${affectedIds.length}件${result.skippedReferencedIds.length > 0 ? `（保存済みList使用中 ${result.skippedReferencedIds.length}件はデータ保持）` : ""}`
        : `BGM Source cleared: ${affectedIds.length} file${affectedIds.length === 1 ? "" : "s"}${result.skippedReferencedIds.length > 0 ? `, kept data for ${result.skippedReferencedIds.length} used by saved lists` : ""}.`
    );
  }

  function deleteSourceTrack(trackId: string): void {
    const track = projectRef.current.bgmTracks.find((candidate) => candidate.id === trackId);
    if (!track) return;
    const result = clearVisibleSourceTracks(projectRef.current, [trackId]);
    const affectedIds = [...result.clearedIds, ...result.skippedReferencedIds];
    if (affectedIds.length === 0) {
      setStatus(language === "ja" ? "削除できるBGM Source曲がありません。" : "No BGM Source track to delete.");
      return;
    }
    stopPlaybackForUnavailableTracks(new Set(affectedIds));
    setProjectState(() => result.project);
    setStatus(
      language === "ja"
        ? `BGM Sourceから削除しました: ${track.fileName}${result.skippedReferencedIds.length > 0 ? "（保存済みList用のデータは保持）" : ""}`
        : `Removed from BGM Source: ${track.fileName}${result.skippedReferencedIds.length > 0 ? " (kept data for saved lists)" : ""}.`
    );
  }

  function deletePlaylistItem(itemId: string): void {
    const currentProject = projectRef.current;
    const item = currentProject.playlist.find((candidate) => candidate.id === itemId);
    const track = item ? currentProject.bgmTracks.find((candidate) => candidate.id === item.trackId) : null;
    if (!item || !track) return;
    const playlistAfterRemoval = currentProject.playlist.filter((candidate) => candidate.id !== itemId);
    const stillInCurrentPlaylist = playlistAfterRemoval.some((candidate) => candidate.trackId === track.id);
    const unavailableIds = stillInCurrentPlaylist ? new Set<string>() : new Set([track.id]);
    const deletingPlayingPlaylistItem = playbackRef.current.mode === "playlist" && playbackRef.current.itemId === itemId;
    stopPlaybackForUnavailableTracks(deletingPlayingPlaylistItem ? new Set([track.id]) : unavailableIds);
    setProjectState((draft) => {
      const playlist = draft.playlist.filter((candidate) => candidate.id !== itemId);
      const referencedByCurrentPlaylist = playlist.some((candidate) => candidate.trackId === track.id);
      const referencedBySavedList = draft.savedPlaylists.some((playlist) => playlist.items.some((candidate) => candidate.trackId === track.id));
      const shouldKeepBgmTrack = referencedByCurrentPlaylist || referencedBySavedList;
      const bgmTracks = shouldKeepBgmTrack ? draft.bgmTracks : draft.bgmTracks.filter((candidate) => candidate.id !== track.id);
      const hiddenSourceIds = new Set(draft.sourceHiddenTrackIds);
      if (referencedBySavedList && !referencedByCurrentPlaylist) {
        hiddenSourceIds.add(track.id);
      } else if (referencedByCurrentPlaylist) {
        hiddenSourceIds.delete(track.id);
      } else {
        hiddenSourceIds.delete(track.id);
      }
      const nextUnavailableIds = referencedByCurrentPlaylist ? new Set<string>() : new Set([track.id]);
      return {
        ...draft,
        activePlaylistId: null,
        playlistRating: 0,
        playlistCumulativePlayMs: 0,
        playlist,
        bgmTracks,
        sourceHiddenTrackIds: Array.from(hiddenSourceIds).filter((id) => bgmTracks.some((candidate) => candidate.id === id)),
        selectedTrackId: getNextSelectedTrackIdAfterRemoval(draft.selectedTrackId, nextUnavailableIds, playlist.map((candidate) => candidate.trackId), bgmTracks)
      };
    });
    setStatus(
      language === "ja"
        ? `Build Sequencerから削除しました: ${track.fileName}${currentProject.savedPlaylists.some((playlist) => playlist.items.some((candidate) => candidate.trackId === track.id)) ? "（保存済みList用のデータは保持）" : ""}`
        : `Removed from Build Sequencer: ${track.fileName}.`
    );
  }

  function duplicatePlaylistItem(itemId: string): void {
    const currentProject = projectRef.current;
    const item = currentProject.playlist.find((candidate) => candidate.id === itemId);
    const track = item ? currentProject.bgmTracks.find((candidate) => candidate.id === item.trackId) : null;
    if (!item || !track) return;
    setProjectState((draft) => {
      const index = draft.playlist.findIndex((candidate) => candidate.id === itemId);
      if (index < 0) return draft;
      const sourceItem = draft.playlist[index];
      if (!sourceItem) return draft;
      const duplicate: PlaylistItem = {
        ...makePlaylistItem(sourceItem.trackId, index + 1),
        enabled: sourceItem.enabled,
        rule: clonePlaylistRule(sourceItem.rule),
        note: sourceItem.note
      };
      return {
        ...draft,
        playlistCreated: true,
        playlistRating: 0,
        playlistCumulativePlayMs: 0,
        activePlaylistId: null,
        selectedTrackId: sourceItem.trackId,
        playlist: [
          ...draft.playlist.slice(0, index + 1),
          duplicate,
          ...draft.playlist.slice(index + 1)
        ]
      };
    });
    setStatus(language === "ja" ? `Build Sequencerで複製しました: ${track.fileName}` : `Duplicated in Build Sequencer: ${track.fileName}`);
  }

  async function autoLoopSourceTracks(trackIds: string[]): Promise<void> {
    const targetIdSet = new Set(trackIds);
    const targets = projectRef.current.bgmTracks.filter((track) => targetIdSet.has(track.id));
    if (targets.length === 0) {
      setStatus(language === "ja" ? "Auto Loop対象のBGMがありません。" : "No BGM tracks selected for Auto Loop.");
      return;
    }
    await runDetection(targets, "Auto Loop");
  }

  async function autoLoopAll(): Promise<void> {
    if (project.bgmTracks.length === 0) {
      setStatus(language === "ja" ? "先にBGMを読み込んでください。" : "Import BGM files first.");
      return;
    }
    await runDetection(project.bgmTracks, "Auto Loop All");
  }

  async function detectSelectedTrack(): Promise<void> {
    if (!selectedTrack) return;
    await runDetection([selectedTrack], "Detect selected");
  }

  async function detectTrack(track: BgmTrack): Promise<DetectionResult> {
    if (track.format === "wav" || track.format === "aiff") {
      const [mainResult] = await window.gamingLooper.detectBgmTracks([track], detectionSettings);
      if (mainResult && !mainResult.validation.startsWith("Use the renderer WebAudio path")) {
        return mainResult;
      }
    }
    return detectTrackWithWebAudio(track, detectionSettings);
  }

  function applyDetectionResults(results: DetectionResult[], options: SetProjectStateOptions = {}): void {
    setProjectState((draft) => ({
      ...draft,
      bgmTracks: draft.bgmTracks.map((track) => {
        const result = results.find((item) => item.id === track.id);
        return result
          ? {
              ...track,
              loop: result.loop,
              status: result.status,
              validation: result.validation,
              waveform: result.waveform ?? track.waveform,
              sampleRate: result.sampleRate ?? track.sampleRate,
              channels: result.channels ?? track.channels,
              durationSamples: result.durationSamples ?? track.durationSamples,
              durationMs: result.durationMs ?? track.durationMs
            }
          : track;
      })
    }), options);
  }

  function queueDetectionTargets(targets: BgmTrack[], label: string): number {
    const activeProgress = detectionProgressRef.current;
    const activeIds = new Set(activeProgress ? [activeProgress.currentTrackId, ...activeProgress.pendingTrackIds] : []);
    const queuedIds = new Set(detectionQueueRef.current.flatMap((item) => item.trackIds));
    const trackIds = Array.from(new Set(targets.map((track) => track.id))).filter((id) => !activeIds.has(id) && !queuedIds.has(id));
    if (trackIds.length === 0) {
      return 0;
    }
    detectionQueueRef.current.push({ trackIds, label });
    return trackIds.length;
  }

  async function runDetection(targets: BgmTrack[], label: string): Promise<void> {
    const trackIds = Array.from(new Set(targets.map((track) => track.id)));
    if (trackIds.length === 0) return;
    if (detectionActiveRef.current) {
      const queuedCount = queueDetectionTargets(targets, label);
      if (queuedCount > 0) {
        setStatus(
          language === "ja"
            ? `${label}を待機に追加: ${queuedCount}件`
            : `${label} queued: ${queuedCount} file${queuedCount === 1 ? "" : "s"}`
        );
      }
      return;
    }

    detectionActiveRef.current = true;
    let request: DetectionQueueItem | null = { trackIds, label };
    try {
      while (request) {
        const canceled = await runDetectionBatch(request);
        if (canceled) {
          detectionQueueRef.current = [];
          break;
        }
        request = detectionQueueRef.current.shift() ?? null;
      }
    } finally {
      detectionActiveRef.current = false;
    }
  }

  async function runDetectionBatch(request: DetectionQueueItem): Promise<boolean> {
    const targetIdSet = new Set(request.trackIds);
    const uniqueTargets = projectRef.current.bgmTracks.filter((track) => targetIdSet.has(track.id));
    const label = request.label;
    if (uniqueTargets.length === 0) {
      return false;
    }
    const total = uniqueTargets.length;
    const startedAtMs = Date.now();
    const historySnapshot = cloneProjectSnapshot(projectRef.current);
    const results: DetectionResult[] = [];
    let canceled = false;
    scanCancelRequestedRef.current = false;
    detectionSelectionLockedRef.current = false;
    setStatus(`${label}: 0/${total}`);
    try {
      for (let index = 0; index < uniqueTargets.length; index += 1) {
        if (scanCancelRequestedRef.current) {
          canceled = true;
          break;
        }
        const track = uniqueTargets[index];
        setDetectionProgress({
          current: index + 1,
          completed: index,
          total,
          currentFile: track.fileName,
          currentTrackId: track.id,
          pendingTrackIds: uniqueTargets.slice(index + 1).map((item) => item.id),
          startedAtMs,
          cancelRequested: false
        });
        setStatus(`${label}: ${index + 1}/${total} ${track.fileName}`);
        setProjectState((draft) => ({
          ...draft,
          selectedTrackId: detectionSelectionLockedRef.current ? draft.selectedTrackId : track.id,
          bgmTracks: draft.bgmTracks.map((item) =>
            item.id === track.id ? { ...item, status: "processing", validation: `${label}...` } : item
          )
        }), { history: false });
        await waitForUiFrame();
        const result = await detectTrack(track);
        if (scanCancelRequestedRef.current) {
          canceled = true;
          setProjectState((draft) => ({
            ...draft,
            bgmTracks: draft.bgmTracks.map((item) =>
              item.id === track.id
                ? { ...item, loop: track.loop, status: "canceled", validation: "Auto Loop canceled before this track finished." }
                : item
            )
          }), { history: false });
          break;
        }
        results.push(result);
        applyDetectionResults([result], { history: false });
        setDetectionProgress({
          current: index + 1,
          completed: index + 1,
          total,
          currentFile: track.fileName,
          currentTrackId: track.id,
          pendingTrackIds: uniqueTargets.slice(index + 1).map((item) => item.id),
          startedAtMs,
          cancelRequested: false
        });
        await waitForUiFrame();
      }
      if (results.length > 0 && serializeProjectForHistory(historySnapshot) !== serializeProjectForHistory(projectRef.current)) {
        pushProjectHistory(historySnapshot);
      }
      setStatus(
        canceled
          ? language === "ja"
            ? `Auto Loopを中止しました: ${results.length}/${total}件処理`
            : `Auto Loop canceled: ${results.length}/${total} processed`
          : language === "ja"
            ? `${label}完了: ${results.length}/${total}件処理`
            : `${label} complete: ${results.length}/${total} processed`
      );
      return canceled;
    } finally {
      setDetectionProgress(null);
      scanCancelRequestedRef.current = false;
      detectionSelectionLockedRef.current = false;
    }
  }

  function requestDetectionCancel(): void {
    if (!detectionProgress) return;
    scanCancelRequestedRef.current = true;
    setDetectionProgress((current) => (current ? { ...current, cancelRequested: true } : current));
    setStatus(language === "ja" ? "検出を中止中" : "Canceling detection");
  }

  function updateSelectedLoop(loop: LoopMarker, options: { history?: boolean } = {}): void {
    if (!selectedTrack) return;
    setProjectState((draft) => ({
      ...draft,
      bgmTracks: draft.bgmTracks.map((track) => (track.id === selectedTrack.id ? { ...track, loop, status: "edited", validation: "Loop marker edited locally." } : track))
    }), { history: options.history });
  }

  function updateSelectedPlaylistRule(rule: PlaylistRule): void {
    if (!selectedPlaylistItem) return;
    if (isPlaylistItemRuleLocked(selectedPlaylistItem.id)) {
      setStatus(language === "ja" ? "再生中の曲は遷移条件を変更できません。" : "Cannot change the currently playing sequence rule.");
      return;
    }
    updatePlaylistItem(selectedPlaylistItem.id, { rule: normalizePlaylistRuleForTrack(rule, selectedTrack) });
  }

  function isPlaylistItemRuleLocked(itemId: string): boolean {
    const currentPlayback = playbackRef.current;
    return currentPlayback.mode === "playlist" && currentPlayback.itemId === itemId;
  }

  function updatePlaylistItem(id: string, patch: Partial<PlaylistItem>): void {
    setProjectState((draft) => ({
      ...draft,
      playlist: draft.playlist.map((item) => {
        if (item.id !== id) return item;
        if (patch.rule && isPlaylistItemRuleLocked(item.id)) return item;
        const track = draft.bgmTracks.find((candidate) => candidate.id === item.trackId) ?? null;
        return {
          ...item,
          ...patch,
          rule: patch.rule ? normalizePlaylistRuleForTrack(patch.rule, track) : item.rule
        };
      })
    }));
  }

  function applyPlaylistRuleToAll(rule: PlaylistRule): void {
    setProjectState((draft) => ({
      ...draft,
      playlist: draft.playlist.map((item) => {
        if (isPlaylistItemRuleLocked(item.id)) return item;
        const track = draft.bgmTracks.find((candidate) => candidate.id === item.trackId) ?? null;
        return { ...item, rule: normalizePlaylistRuleForTrack(rule, track) };
      })
    }));
    setStatus(language === "ja" ? "Playlistルールを全曲へ適用しました。" : "Playlist rule applied to all tracks.");
  }

  function applyPlaylistLoopCountToAll(loopCount: number, itemIds?: string[]): void {
    const safeLoopCount = Math.round(clampNumber(loopCount, 1, 99, defaultPlaylistLoopCount));
    const targetItemIds = itemIds && itemIds.length > 0 ? new Set(itemIds) : null;
    setProjectState((draft) => ({
      ...draft,
      playlist: draft.playlist.map((item) => {
        if (targetItemIds && !targetItemIds.has(item.id)) return item;
        if (isPlaylistItemRuleLocked(item.id)) return item;
        const track = draft.bgmTracks.find((candidate) => candidate.id === item.trackId) ?? null;
        const fadeOutMs = getRuleFadeMs(item.rule);
        return {
          ...item,
          rule: normalizePlaylistRuleForTrack(
            { mode: "loop-count", loopCount: safeLoopCount, fadeOutMs, durationMs: getStoredDurationMs(item.rule) },
            track
          )
        };
      })
    }));
    setStatus(
      targetItemIds
        ? language === "ja"
          ? `Loop数を選択中の${targetItemIds.size}曲へ適用しました。`
          : `Loop count applied to ${targetItemIds.size} selected tracks.`
        : language === "ja"
          ? "Loop数をSequence全体へ適用しました。"
          : "Loop count applied to the sequence."
    );
  }

  function applyPlaylistDurationToAll(durationSeconds: number, itemIds?: string[]): void {
    const safeDurationMs = Math.max(1000, Math.round(durationSeconds * 1000));
    const targetItemIds = itemIds && itemIds.length > 0 ? new Set(itemIds) : null;
    setProjectState((draft) => ({
      ...draft,
      playlist: draft.playlist.map((item) => {
        if (targetItemIds && !targetItemIds.has(item.id)) return item;
        if (isPlaylistItemRuleLocked(item.id)) return item;
        const track = draft.bgmTracks.find((candidate) => candidate.id === item.trackId) ?? null;
        return {
          ...item,
          rule: normalizePlaylistRuleForTrack(
            { mode: "duration", durationMs: safeDurationMs, fadeOutMs: getRuleFadeMs(item.rule), loopCount: getStoredLoopCount(item.rule) },
            track
          )
        };
      })
    }));
    setStatus(
      targetItemIds
        ? language === "ja"
          ? `Play時間を選択中の${targetItemIds.size}曲へ適用しました。`
          : `Play time applied to ${targetItemIds.size} selected tracks.`
        : language === "ja"
          ? "Play時間をSequence全体へ適用しました。"
          : "Play time applied to the sequence."
    );
  }

  function applyPlaylistFadeToAll(fadeOutMs: number, itemIds?: string[]): void {
    const safeFadeOutMs = Math.max(0, Math.round(fadeOutMs));
    const targetItemIds = itemIds && itemIds.length > 0 ? new Set(itemIds) : null;
    setProjectState((draft) => ({
      ...draft,
      playlist: draft.playlist.map((item) => {
        if (targetItemIds && !targetItemIds.has(item.id)) return item;
        if (isPlaylistItemRuleLocked(item.id)) return item;
        const track = draft.bgmTracks.find((candidate) => candidate.id === item.trackId) ?? null;
        return { ...item, rule: normalizePlaylistRuleForTrack({ ...item.rule, fadeOutMs: safeFadeOutMs } as PlaylistRule, track) };
      })
    }));
    setStatus(
      targetItemIds
        ? language === "ja"
          ? `Fadeを選択中の${targetItemIds.size}曲へ適用しました。`
          : `Fade applied to ${targetItemIds.size} selected tracks.`
        : language === "ja"
          ? "Fadeを全曲へ適用しました。"
          : "Playlist fade applied to all tracks."
    );
  }

  function movePlaylistItem(id: string, direction: -1 | 1): void {
    runLayoutTransition(() => {
      setProjectState((draft) => {
        const index = draft.playlist.findIndex((item) => item.id === id);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= draft.playlist.length) return draft;
        const playlist = [...draft.playlist];
        const [item] = playlist.splice(index, 1);
        if (!item) return draft;
        playlist.splice(nextIndex, 0, item);
        return { ...draft, playlist };
      });
    });
  }

  function reorderPlaylistItem(id: string, targetIndex: number): void {
    runLayoutTransition(() => {
      setProjectState((draft) => {
        const playlist = reorderPlaylistItems(draft.playlist, id, targetIndex);
        if (playlist === draft.playlist) return draft;
        return { ...draft, playlist };
      });
    });
  }

  function removePlaylistItemToSource(id: string): void {
    const item = projectRef.current.playlist.find((candidate) => candidate.id === id);
    const track = item ? projectRef.current.bgmTracks.find((candidate) => candidate.id === item.trackId) : null;
    if (!item || !track) return;
    runLayoutTransition(() => {
      setProjectState((draft) => ({
        ...draft,
        activePlaylistId: null,
        playlistRating: 0,
        playlistCumulativePlayMs: 0,
        selectedTrackId: track.id,
        sourceHiddenTrackIds: draft.sourceHiddenTrackIds.filter((trackId) => trackId !== track.id),
        playlist: draft.playlist.filter((candidate) => candidate.id !== id)
      }));
    });
    setStatus(language === "ja" ? `BGM Sourceへ戻しました: ${track.fileName}` : `Moved back to BGM Source: ${track.fileName}`);
  }

  function updatePlaylistName(name: string): void {
    setProjectState((draft) => ({ ...draft, playlistName: name }), { history: false });
  }

  function updatePlaylistRating(rating: number): void {
    const safeRating = sanitizePlaylistRating(rating);
    setProjectState((draft) => ({
      ...draft,
      playlistRating: safeRating,
      savedPlaylists: draft.activePlaylistId
        ? draft.savedPlaylists.map((playlist) => (playlist.id === draft.activePlaylistId ? { ...playlist, rating: safeRating } : playlist))
        : draft.savedPlaylists
    }));
  }

  function updateSavedPlaylistRating(id: string, rating: number): void {
    const safeRating = sanitizePlaylistRating(rating);
    setProjectState((draft) => ({
      ...draft,
      playlistRating: draft.activePlaylistId === id ? safeRating : draft.playlistRating,
      savedPlaylists: draft.savedPlaylists.map((playlist) => (playlist.id === id ? { ...playlist, rating: safeRating } : playlist))
    }));
  }

  function updatePlaylistEndBehavior(playlistEndBehavior: PlaylistEndBehavior): void {
    if (projectRef.current.allListRepeatEnabled) {
      setStatus(language === "ja" ? "All List Repeat中はRepeat Sequenceを変更できません。" : "Repeat Sequence is locked while All List Repeat is active.");
      return;
    }
    setProjectState((draft) => ({ ...draft, playlistEndBehavior }));
    setStatus(
      language === "ja"
        ? playlistEndBehavior === "repeat"
          ? "SequencerをRepeatにしました。"
          : "SequencerをOne Shotにしました。"
        : playlistEndBehavior === "repeat"
          ? "Sequencer Repeat enabled."
          : "Sequencer One Shot enabled."
    );
  }

  function updateAllListRepeatEnabled(allListRepeatEnabled: boolean): void {
    setProjectState((draft) => ({ ...draft, allListRepeatEnabled }));
    setStatus(
      language === "ja"
        ? allListRepeatEnabled
          ? "All List RepeatをONにしました。"
          : "All List RepeatをOFFにしました。"
        : allListRepeatEnabled
          ? "All List Repeat enabled."
          : "All List Repeat disabled."
    );
  }

  async function clearCurrentSequence(): Promise<void> {
    if (projectRef.current.playlist.length === 0) return;
    if (
      !(await requestConfirm({
        title: t("clearSequence"),
        message: t("clearSequenceConfirmMessage"),
        detail: t("clearSequenceConfirmDetail"),
        confirmLabel: t("clear"),
        danger: true
      }))
    ) {
      return;
    }
    stopPlayback();
    setProjectState((draft) => ({
      ...draft,
      activePlaylistId: null,
      playlistRating: 0,
      playlistCumulativePlayMs: 0,
      playlist: []
    }));
    setStatus(language === "ja" ? "Sequenceを空にしました。" : "Sequence cleared.");
  }

  async function savePlaylistAs(): Promise<void> {
    if (!projectRef.current.playlistCreated || projectRef.current.playlist.length === 0) {
      setStatus(language === "ja" ? "先にBuild Play ListでSequenceを作成してください。" : "Build Play List first.");
      return;
    }
    const fallbackName = sanitizePlaylistName(projectRef.current.playlistName, `Play List ${projectRef.current.savedPlaylists.length + 1}`);
    const name = await requestPrompt({
      title: language === "ja" ? "Play List保存" : "Save Play List",
      message: "PLAY LIST名を入力してください。",
      initialValue: fallbackName,
      confirmLabel: t("save")
    });
    if (name === null) return;
    const safeName = sanitizePlaylistName(name, fallbackName);
    if (!safeName) return;
    setProjectState((draft) => {
      const saved = createSavedPlaylist(safeName, draft.playlist, createLocalId(), draft.playlistRating, draft.playlistCumulativePlayMs);
      return {
        ...draft,
        playlistName: saved.name,
        playlistRating: saved.rating,
        playlistCumulativePlayMs: saved.cumulativePlayMs,
        activePlaylistId: saved.id,
        savedPlaylists: [...draft.savedPlaylists, saved]
      };
    });
    setStatus(language === "ja" ? `Play Listを保存しました: ${safeName}` : `Play List saved: ${safeName}`);
  }

  async function buildCurrentList(): Promise<void> {
    const currentProject = projectRef.current;
    if (!currentProject.playlistCreated || currentProject.playlist.length === 0) {
      setStatus(language === "ja" ? "Listを完成する前に曲を追加してください。" : "Add songs before building a List.");
      return;
    }
    const fallbackName = sanitizePlaylistName(currentProject.playlistName, `List ${currentProject.savedPlaylists.length + 1}`);
    const playlistForFile = createSavedPlaylist(fallbackName, currentProject.playlist, createLocalId(), currentProject.playlistRating, currentProject.playlistCumulativePlayMs);
    const trackIds = new Set(playlistForFile.items.map((item) => item.trackId));
    const tracks = currentProject.bgmTracks.filter((track) => trackIds.has(track.id)).map((track) => cloneBgmTrack(track));
    const payload: SequenceFile = {
      fileKind: "gaminglooper.sequence",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      playlist: playlistForFile,
      tracks,
      playlistEndBehavior: currentProject.playlistEndBehavior
    };
    let exportResult: { path: string; playlistName: string } | null = null;
    try {
      exportResult = await window.gamingLooper.exportSequenceFile(payload);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sequence save failed.");
      return;
    }
    if (!exportResult) return;
    const safeName = sanitizePlaylistName(exportResult.playlistName, fallbackName);
    if (!safeName) return;
    const sameNamePlaylist = projectRef.current.savedPlaylists.find((playlist) => playlist.name.trim() === safeName);
    if (
      sameNamePlaylist &&
      !(await requestConfirm({
        title: language === "ja" ? "同名Listを上書き" : "Overwrite list with same name?",
        message:
          language === "ja"
            ? `「${safeName}」はすでに存在します。上書きしますか？`
            : `"${safeName}" already exists. Overwrite it?`,
        detail: language === "ja" ? "OKを押すと既存のList内容を現在のSequenceで上書きします。" : "OK will replace the existing list with the current sequence.",
        confirmLabel: language === "ja" ? "OK" : "OK"
      }))
    ) {
      setStatus(language === "ja" ? `Sequenceファイルは保存しました。List登録はキャンセルしました: ${safeName}` : `Sequence file saved. List mount canceled: ${safeName}`);
      return;
    }
    const totalPlaybackMs = getPlaylistItemsTotalMs(projectRef.current.playlist, projectRef.current.bgmTracks);
    const expAward = calculateListBuildExpAward(totalPlaybackMs);
    const targetPlaylistId = sameNamePlaylist?.id ?? createLocalId();
    const expIdentityGroups = [
      createListBuildExpIdentities(targetPlaylistId, expAward),
      createListRegistrationExpIdentities(targetPlaylistId, listRegistrationExpAward)
    ].filter((group) => group.length > 0);
    const expIdentities = expIdentityGroups.flat();
    const effectiveExpAward = queueLoadExpIdentityAwardAnimations(projectRef.current, expIdentityGroups);
    setProjectState((draft) => {
      const cumulativePlayMs =
        sameNamePlaylist?.id === draft.activePlaylistId
          ? draft.playlistCumulativePlayMs
          : sameNamePlaylist?.cumulativePlayMs ?? draft.playlistCumulativePlayMs;
      const saved = createSavedPlaylist(safeName, draft.playlist, targetPlaylistId, draft.playlistRating, cumulativePlayMs);
      const exists = draft.savedPlaylists.some((playlist) => playlist.id === saved.id);
      const nextProject = {
        ...draft,
        playlistName: saved.name,
        playlistRating: saved.rating,
        playlistCumulativePlayMs: saved.cumulativePlayMs,
        activePlaylistId: saved.id,
        savedPlaylists: exists
          ? draft.savedPlaylists.map((playlist) => (playlist.id === saved.id ? saved : playlist))
          : [...draft.savedPlaylists, saved]
      };
      return recordLoadExpIdentities(nextProject, expIdentities);
    });
    setStatus(`${language === "ja" ? (sameNamePlaylist ? "Listを上書きしました" : "Listを完成しました") : sameNamePlaylist ? "List overwritten" : "List built"}: ${safeName}${projectRef.current.visual.loadExpEnabled && effectiveExpAward > 0 ? ` / EXP +${effectiveExpAward}` : ""}`);
  }

  function overwriteActivePlaylist(): void {
    const currentProject = projectRef.current;
    if (!currentProject.playlistCreated || currentProject.playlist.length === 0) {
      setStatus(language === "ja" ? "先にBuild Play ListでSequenceを作成してください。" : "Build Play List first.");
      return;
    }
    if (!currentProject.activePlaylistId) {
      setStatus(language === "ja" ? "先に別名保存するか保存済みPlay Listを読み込んでください。" : "Save As or load a saved Play List first.");
      return;
    }
    const name = sanitizePlaylistName(currentProject.playlistName, "Play List");
    setProjectState((draft) => {
      const activeId = draft.activePlaylistId;
      if (!activeId) return draft;
      const saved = createSavedPlaylist(name, draft.playlist, activeId, draft.playlistRating, draft.playlistCumulativePlayMs);
      const exists = draft.savedPlaylists.some((playlist) => playlist.id === activeId);
      return {
        ...draft,
        playlistName: saved.name,
        playlistRating: saved.rating,
        playlistCumulativePlayMs: saved.cumulativePlayMs,
        activePlaylistId: saved.id,
        savedPlaylists: exists
          ? draft.savedPlaylists.map((playlist) => (playlist.id === activeId ? saved : playlist))
          : draft.savedPlaylists
      };
    });
    setStatus(language === "ja" ? `Play Listを上書きしました: ${name}` : `Play List overwritten: ${name}`);
  }

  async function confirmSequenceUpdateBeforeClose(): Promise<boolean> {
    const currentProject = projectRef.current;
    if (!hasCurrentPlaylistChanges(currentProject)) return true;

    if (currentProject.activePlaylistId && currentProject.savedPlaylists.some((playlist) => playlist.id === currentProject.activePlaylistId)) {
      const shouldUpdate = await requestConfirm({
        title: t("sequenceUpdatePendingTitle"),
        message: t("sequenceUpdatePendingMessage"),
        detail: t("sequenceUpdatePendingDetail"),
        confirmLabel: t("updateSequenceData"),
        cancelLabel: t("closeWithoutSequenceUpdate")
      });
      if (shouldUpdate) {
        overwriteActivePlaylist();
        setProjectDirty(true);
        window.gamingLooper.setProjectDirty(true);
      }
      return true;
    }

    return requestConfirm({
      title: t("sequenceUpdatePendingTitle"),
      message: t("sequenceUnsavedCloseMessage"),
      detail: t("sequenceUnsavedCloseDetail"),
      confirmLabel: t("closeWithoutSequenceUpdate"),
      cancelLabel: language === "ja" ? "キャンセル" : "Cancel"
    });
  }

  function loadSavedPlaylist(id: string): boolean {
    commitPlaylistListeningTime();
    const currentProject = projectRef.current;
    const saved = currentProject.savedPlaylists.find((playlist) => playlist.id === id);
    if (!saved) {
      setStatus(language === "ja" ? "保存済みPlay Listが見つかりません。" : "Saved Play List not found.");
      return false;
    }
    const trackIds = new Set(currentProject.bgmTracks.map((track) => track.id));
    const items = normalizePlaylistItems(saved.items, trackIds);
    setProjectState((draft) => ({
      ...draft,
      playlistCreated: true,
      playlistName: saved.name,
      playlistRating: sanitizePlaylistRating(saved.rating),
      playlistCumulativePlayMs: sanitizePlaylistCumulativeMs(saved.cumulativePlayMs),
      activePlaylistId: saved.id,
      playlist: clonePlaylistItems(items),
      selectedTrackId: draft.selectedTrackId && items.some((item) => item.trackId === draft.selectedTrackId) ? draft.selectedTrackId : items[0]?.trackId ?? draft.selectedTrackId
    }));
    setStatus(language === "ja" ? `Play Listを読み込みました: ${saved.name}` : `Play List loaded: ${saved.name}`);
    return true;
  }

  async function activateSavedPlaylist(id: string): Promise<void> {
    if (!loadSavedPlaylist(id)) return;
    setView("main");
    await playPlaylistAt(0);
  }

  async function deleteSavedPlaylist(id: string): Promise<void> {
    const playlist = projectRef.current.savedPlaylists.find((item) => item.id === id);
    if (!playlist) return;
    if (
      !(await requestConfirm({
        title: language === "ja" ? "Seq Listを削除" : "Delete Seq List",
        message: language === "ja" ? `「${playlist.name}」を削除しますか？` : `Delete "${playlist.name}"?`,
        detail: language === "ja" ? "保存済みSeq Listだけを削除します。音声ファイル本体は削除しません。" : "Only the saved Seq List entry is removed. Audio files are not deleted.",
        confirmLabel: language === "ja" ? "削除" : "Delete",
        danger: true
      }))
    ) {
      return;
    }
    setProjectState((draft) => ({
      ...draft,
      activePlaylistId: draft.activePlaylistId === id ? null : draft.activePlaylistId,
      savedPlaylists: draft.savedPlaylists.filter((item) => item.id !== id)
    }));
    setStatus(language === "ja" ? `Seq Listを削除しました: ${playlist.name}` : `Seq List deleted: ${playlist.name}`);
  }

  async function duplicateSavedPlaylist(id: string): Promise<void> {
    const playlist = projectRef.current.savedPlaylists.find((item) => item.id === id);
    if (!playlist) return;
    const baseName = language === "ja" ? `${playlist.name} のコピー` : `${playlist.name} Copy`;
    const name = getUniqueSavedPlaylistName(baseName, projectRef.current.savedPlaylists);
    const duplicate = {
      ...cloneSavedPlaylist(playlist),
      id: createLocalId(),
      name
    };
    let exportResult: { path: string; playlistName: string } | null = null;
    try {
      exportResult = await window.gamingLooper.exportSequenceFile(createSequenceFilePayload(projectRef.current, duplicate));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sequence save failed.");
      return;
    }
    if (!exportResult) return;
    const savedName = sanitizePlaylistName(exportResult.playlistName, name);
    const savedDuplicate = {
      ...duplicate,
      name: savedName
    };
    setProjectState((draft) => ({
      ...draft,
      savedPlaylists: [...draft.savedPlaylists, savedDuplicate]
    }));
    setStatus(language === "ja" ? `Seq Listを複製して保存しました: ${savedName}` : `Seq List duplicated and saved: ${savedName}`);
  }

  async function exportSavedPlaylist(id: string): Promise<void> {
    const currentProject = projectRef.current;
    const playlist = currentProject.savedPlaylists.find((item) => item.id === id);
    if (!playlist) {
      setStatus(language === "ja" ? "書き出すSequenceが見つかりません。" : "Sequence not found.");
      return;
    }
    const trackIds = new Set(playlist.items.map((item) => item.trackId));
    const tracks = currentProject.bgmTracks.filter((track) => trackIds.has(track.id)).map((track) => cloneBgmTrack(track));
    const payload: SequenceFile = {
      fileKind: "gaminglooper.sequence",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      playlist: cloneSavedPlaylist(playlist),
      tracks,
      playlistEndBehavior: currentProject.playlistEndBehavior
    };
    try {
      const result = await window.gamingLooper.exportSequenceFile(payload);
      if (!result) return;
      setStatus(language === "ja" ? `Sequenceを書き出しました: ${result.playlistName}` : `Sequence exported: ${result.playlistName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sequence export failed.");
    }
  }

  async function importSequenceFile(): Promise<void> {
    try {
      const result = await window.gamingLooper.importSequenceFile();
      if (!result) return;
      const imported = normalizeImportedSequenceFile(result.sequence);
      if (!imported) {
        setStatus(language === "ja" ? "Sequenceファイルを読み込めませんでした。" : "Sequence file could not be loaded.");
        return;
      }
      const sameNamePlaylist = projectRef.current.savedPlaylists.find((playlist) => playlist.name.trim() === imported.playlist.name.trim());
      if (
        sameNamePlaylist &&
        !(await requestConfirm({
          title: language === "ja" ? "同名Sequenceを上書き" : "Overwrite Sequence?",
          message:
            language === "ja"
              ? `同名のSequence「${imported.playlist.name}」があります。上書きしますか？`
              : `A Sequence named "${imported.playlist.name}" already exists. Overwrite it?`,
          detail: language === "ja" ? "OKを押すと保存済みSequenceの内容が読み込んだファイルで置き換わります。" : "OK replaces the saved Sequence with the imported file.",
          confirmLabel: language === "ja" ? "OK" : "OK"
        }))
      ) {
        return;
      }
      const importedPlaylist = mergeImportedSequence(imported, sameNamePlaylist?.id);
      setStatus(language === "ja" ? `Sequenceを読み込みました: ${importedPlaylist.name}` : `Sequence imported: ${importedPlaylist.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Sequence import failed.");
    }
  }

  function normalizeImportedSequenceFile(sequence: SequenceFile): { playlist: SavedPlaylist; tracks: BgmTrack[]; playlistEndBehavior: PlaylistEndBehavior } | null {
    const tempProject = normalizeProject({
      ...createEmptyProject(),
      bgmTracks: Array.isArray(sequence.tracks) ? sequence.tracks : [],
      savedPlaylists: [sequence.playlist],
      playlistEndBehavior: sequence.playlistEndBehavior
    });
    const playlist = tempProject.savedPlaylists[0];
    if (!playlist) return null;
    return {
      playlist,
      tracks: tempProject.bgmTracks,
      playlistEndBehavior: tempProject.playlistEndBehavior
    };
  }

  function mergeImportedSequence(imported: { playlist: SavedPlaylist; tracks: BgmTrack[]; playlistEndBehavior: PlaylistEndBehavior }, overwriteId?: string): SavedPlaylist {
    const currentProject = projectRef.current;
    const existingIds = new Set(currentProject.bgmTracks.map((track) => track.id));
    const existingByIdentity = new Map(currentProject.bgmTracks.map((track) => [getTrackImportIdentity(track), track]));
    const trackIdMap = new Map<string, string>();
    const tracksToAdd: BgmTrack[] = [];

    for (const track of imported.tracks) {
      const identity = getTrackImportIdentity(track);
      const existing = existingByIdentity.get(identity);
      if (existing) {
        trackIdMap.set(track.id, existing.id);
        continue;
      }
      const nextTrack = cloneBgmTrack(track);
      if (existingIds.has(nextTrack.id)) {
        nextTrack.id = createLocalId();
      }
      existingIds.add(nextTrack.id);
      existingByIdentity.set(identity, nextTrack);
      trackIdMap.set(track.id, nextTrack.id);
      tracksToAdd.push(nextTrack);
    }

    const mappedItems = imported.playlist.items
      .map((item) => {
        const trackId = trackIdMap.get(item.trackId);
        return trackId ? { ...item, id: createLocalId(), trackId } : null;
      })
      .filter((item): item is PlaylistItem => Boolean(item));
    const saved = createSavedPlaylist(imported.playlist.name, mappedItems, overwriteId ?? createLocalId(), imported.playlist.rating, imported.playlist.cumulativePlayMs);
    const expIdentityGroups = tracksToAdd.map((track) => [getFileIdentity(track.file)]);
    const expIdentities = expIdentityGroups.flat();
    queueLoadExpIdentityAwardAnimations(projectRef.current, expIdentityGroups);

    setProjectState((draft) => {
      const exists = draft.savedPlaylists.some((playlist) => playlist.id === saved.id);
      const nextProject = {
        ...draft,
        bgmTracks: [...draft.bgmTracks, ...tracksToAdd],
        playlistCreated: true,
        playlistName: saved.name,
        playlistRating: saved.rating,
        playlistCumulativePlayMs: saved.cumulativePlayMs,
        activePlaylistId: saved.id,
        playlistEndBehavior: imported.playlistEndBehavior,
        playlist: clonePlaylistItems(saved.items),
        savedPlaylists: exists
          ? draft.savedPlaylists.map((playlist) => (playlist.id === saved.id ? saved : playlist))
          : [...draft.savedPlaylists, saved],
        selectedTrackId: saved.items[0]?.trackId ?? draft.selectedTrackId
      };
      return recordLoadExpIdentities(nextProject, expIdentities);
    });
    return saved;
  }

  async function copyPlaylistRules(): Promise<void> {
    const text = JSON.stringify(
      projectRef.current.playlist.map((item) => ({
        trackId: item.trackId,
        enabled: item.enabled,
        rule: item.rule,
        note: item.note
      })),
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Playlist rules copied.");
    } catch {
      await requestPrompt({
        title: "Copy Playlist Rules",
        message: "Clipboard access failed. Copy this JSON manually.",
        initialValue: text,
        confirmLabel: "Close",
        multiline: true,
        readOnly: true
      });
    }
  }

  async function pastePlaylistRules(): Promise<void> {
    const text =
      (await navigator.clipboard.readText().catch(() => "")) ||
      (await requestPrompt({
        title: "Paste Playlist Rules",
        message: "Paste playlist rules JSON.",
        initialValue: "",
        placeholder: "[]",
        confirmLabel: "Paste",
        multiline: true
      })) ||
      "";
    if (!text.trim()) return;
    try {
      const payload = JSON.parse(text) as unknown;
      const rules = Array.isArray(payload) ? payload : [];
      setProjectState((draft) => ({
        ...draft,
        playlist: draft.playlist.map((item, index) => {
          const source = rules.find((candidate) => isPlaylistRuleBackup(candidate) && candidate.trackId === item.trackId) ?? rules[index];
          if (!isPlaylistRuleBackup(source)) return item;
          return {
            ...item,
            enabled: typeof source.enabled === "boolean" ? source.enabled : item.enabled,
            rule: normalizePlaylistRule(source.rule, item.rule),
            note: typeof source.note === "string" ? source.note : item.note
          };
        })
      }));
      setStatus("Playlist rules pasted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Playlist rule paste failed.");
    }
  }

  function updateTrackVolume(trackId: string, volume: number): void {
    const safeVolume = clampTrackVolume(volume);
    setProjectState((draft) => ({
      ...draft,
      bgmTracks: draft.bgmTracks.map((track) => (track.id === trackId ? { ...track, volume: safeVolume } : track))
    }));
    if (playback.mode !== "stopped" && playback.trackId === trackId) {
      audioRef.current.setCurrentBgmVolume(safeVolume);
    }
  }

  function updateDetectionSettings(settings: DetectionSettings): void {
    const detection = sanitizeDetectionSettings(settings);
    setProjectState((draft) => ({ ...draft, detection }));
  }

  function updateUiSettings(patch: Partial<UiSettings>): void {
    const keys = Object.keys(patch);
    const layoutOnly =
      keys.length > 0 && keys.every((key) => key === "mainPlaylistRatio" || key === "mainWaveformRatio" || key === "mainAnalyzerHeight");
    setProjectState((draft) => ({ ...draft, ui: sanitizeUiSettings({ ...draft.ui, ...patch }) }), { history: !layoutOnly });
  }

  async function selectAudioRoot(): Promise<void> {
    const audioRootPath = await window.gamingLooper.selectAudioRoot();
    if (!audioRootPath) return;
    setProjectState((draft) => ({
      ...draft,
      fileSettings: { ...draft.fileSettings, audioRootPath }
    }));
  }

}

interface TitleMenuItem {
  label: string;
  command?: TitleMenuCommand;
  shortcut?: string;
  disabled?: boolean;
  active?: boolean;
  separator?: boolean;
}

function TitleMenuBar({
  language,
  openMenu,
  canUndo,
  canRedo,
  debugMode,
  debugPlaybackRate,
  onOpenChange,
  onCommand
}: {
  language: UiLanguage;
  openMenu: TitleMenuId | null;
  canUndo: boolean;
  canRedo: boolean;
  debugMode: boolean;
  debugPlaybackRate: number;
  onOpenChange: (menu: TitleMenuId | null) => void;
  onCommand: (command: TitleMenuCommand) => void;
}): ReactElement {
  const labels = getTitleMenuLabels(language);
  const menus: Array<{ id: TitleMenuId; label: string; items: TitleMenuItem[] }> = [
    {
      id: "file",
      label: labels.file,
      items: [
        { label: labels.saveState, command: "save", shortcut: "Ctrl+S" },
        { label: labels.loadState, command: "load", shortcut: "Ctrl+Shift+O" },
        { label: labels.initializeState, command: "initialize" },
        { label: "", separator: true },
        { label: labels.openSaveFolder, command: "open-save-folder" },
        { label: labels.exportBackup, command: "export-backup" },
        { label: labels.importBackup, command: "import-backup" },
        { label: "", separator: true },
        { label: labels.importBgm, command: "import-bgm" },
        { label: labels.importSe, command: "import-se" },
        { label: "", separator: true },
        { label: labels.quit, command: "quit" }
      ]
    },
    {
      id: "edit",
      label: labels.edit,
      items: [
        { label: labels.undo, command: "undo", shortcut: "Ctrl+Z", disabled: !canUndo },
        { label: labels.redo, command: "redo", shortcut: "Ctrl+Y", disabled: !canRedo },
        ...(import.meta.env.DEV
          ? [
              { label: "", separator: true },
              {
                label: `${labels.debugMode} ${debugMode ? "ON" : "OFF"}`,
                command: "toggle-debug" as const,
                active: debugMode
              },
              ...(debugMode
                ? [
                    { label: "", separator: true },
                    { label: labels.trueInitialize, command: "debug-true-initialize" as const },
                    { label: "", separator: true },
                    { label: "Debug Speed 1x", command: "debug-speed-1" as const, active: debugPlaybackRate === 1 },
                    { label: "Debug Speed 4x", command: "debug-speed-4" as const, active: debugPlaybackRate === 4 },
                    { label: "Debug Speed 8x", command: "debug-speed-8" as const, active: debugPlaybackRate === 8 }
                  ]
                : [])
            ]
          : [])
      ]
    }
  ];

  return (
    <nav className="title-menu" aria-label={labels.menu}>
      {menus.map((menu) => (
        <div className="title-menu-group" key={menu.id}>
          <button
            className={`title-menu-button ${openMenu === menu.id ? "active" : ""}`}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenChange(openMenu === menu.id ? null : menu.id);
            }}
            onMouseEnter={() => {
              if (openMenu) onOpenChange(menu.id);
            }}
            aria-haspopup="menu"
            aria-expanded={openMenu === menu.id}
          >
            {menu.label}
          </button>
          {openMenu === menu.id ? (
            <div className="title-menu-popover" role="menu" onPointerDown={(event) => event.stopPropagation()}>
              {menu.items.map((item, index) =>
                item.separator ? (
                  <span className="title-menu-separator" key={`${menu.id}-separator-${index}`} />
                ) : (
                  <button
                    className={`title-menu-item ${item.active ? "active" : ""}`}
                    type="button"
                    key={`${menu.id}-${item.command ?? index}`}
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.command) onCommand(item.command);
                    }}
                    role="menuitem"
                  >
                    <span>{item.label}</span>
                    {item.shortcut ? <em>{item.shortcut}</em> : null}
                  </button>
                )
              )}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

function getTitleMenuLabels(language: UiLanguage): Record<string, string> {
  if (language === "en") {
    return {
      menu: "Application menu",
      file: "File",
      edit: "Edit",
      view: "View",
      window: "Window",
      help: "Help",
      saveState: "Save App State",
      loadState: "Load App State",
      initializeState: "Initialize App State",
      openSaveFolder: "Open Save Folder",
      exportBackup: "Save Settings...",
      importBackup: "Load Settings...",
      importBgm: "Import BGM...",
      importSe: "Import SE...",
      quit: "Quit",
      undo: "Undo",
      redo: "Redo",
      debugMode: "Debug Mode",
      trueInitialize: "True Initialize",
      main: "Main",
      listBuilder: "List Builder",
      config: "Config",
      minimize: "Minimize",
      maximize: "Maximize / Restore",
      close: "Close",
      readme: "README",
      shortcuts: "Shortcuts"
    };
  }
  return {
    menu: "アプリケーションメニュー",
    file: "ファイル",
    edit: "編集",
    view: "表示",
    window: "ウィンドウ",
    help: "ヘルプ",
    saveState: "アプリ状態を保存",
    loadState: "アプリ状態をロード",
    initializeState: "アプリ状態を初期化",
    openSaveFolder: "保存場所を開く",
    exportBackup: "設定の保存...",
    importBackup: "設定の読み込み...",
    importBgm: "BGMを読み込み...",
    importSe: "SEを読み込み...",
    quit: "終了",
    undo: "元に戻す",
    redo: "やり直し",
    debugMode: "デバッグモード",
    trueInitialize: "真初期化",
    main: "Main",
    listBuilder: "List Builder",
    config: "Config",
    minimize: "最小化",
    maximize: "最大化 / 復元",
    close: "閉じる",
    readme: "README",
    shortcuts: "操作一覧"
  };
}

function MainView({
  project,
  selectedTrack,
  selectedPlaylistItem,
  playback,
  positionMs,
  playlistCumulativeDisplayMs,
  positionStore,
  voiceCount,
  activeKeys,
  sePreloadMap,
  seReadySummary,
  lastPlayedSeFile,
  sePositionMs,
  detectionProgress,
  gamingnessProgress,
  gamingnessEffectStrength,
  bgmAnalyser,
  seAnalyser,
  seTransientLevel,
  t,
  onSelectTrack,
  onPlayPlaylist,
  onPlayPlaylistIndex,
  onPreviousPlaylistTrack,
  onNextPlaylistTrack,
  onPlaylistEndBehaviorChange,
  canUpdateSequenceData,
  onUpdateSequenceData,
  onOpenSequenceBuilder,
  onStop,
  onBgmSeek,
  onTrackVolumeChange,
  onLoopChange,
  onLoopDragStart,
  onLoopDragEnd,
  onPlaylistRatingChange,
  onAssignSe,
  onTriggerSe,
  onStopSe,
  onUnloadSe,
  onIconWheel,
  onIconSelect,
  onSeSettingsChange,
  onTransferSeAssignment,
  onSaveSeSet,
  onLoadSeSet,
  onEditSeSet,
  onStopAllSe,
  onVoiceLimitChange,
  onCancelDetection,
  onUiSettingsChange
}: {
  project: GamingProject;
  selectedTrack: BgmTrack | null;
  selectedPlaylistItem: PlaylistItem | null;
  playback: PlaybackState;
  positionMs: number;
  playlistCumulativeDisplayMs: number;
  positionStore: PositionStore;
  voiceCount: number;
  activeKeys: Set<SeKey>;
  sePreloadMap: SePreloadMap;
  seReadySummary: SeReadySummary;
  lastPlayedSeFile: SeFile | null;
  sePositionMs: number;
  detectionProgress: DetectionProgress | null;
  gamingnessProgress: GamingnessProgress;
  gamingnessEffectStrength: number;
  bgmAnalyser: AnalyserNode | null;
  seAnalyser: AnalyserNode | null;
  seTransientLevel: number;
  t: Translator;
  onSelectTrack: (trackId: string) => void;
  onPlayPlaylist: () => void;
  onPlayPlaylistIndex: (index: number, startElapsedMs?: number) => void;
  onPreviousPlaylistTrack: () => void;
  onNextPlaylistTrack: () => void;
  onPlaylistEndBehaviorChange: (behavior: PlaylistEndBehavior) => void;
  canUpdateSequenceData: boolean;
  onUpdateSequenceData: () => void;
  onOpenSequenceBuilder: () => void;
  onStop: () => void;
  onBgmSeek: (ms: number) => void;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
  onLoopChange: (loop: LoopMarker, options?: { history?: boolean }) => void;
  onLoopDragStart: () => void;
  onLoopDragEnd: () => void;
  onPlaylistRatingChange: (rating: number) => void;
  onAssignSe: (key: SeKey) => void;
  onTriggerSe: (key: SeKey) => void;
  onStopSe: (key: SeKey) => void;
  onUnloadSe: (key: SeKey) => void;
  onIconWheel: (key: SeKey, delta: number) => void;
  onIconSelect: (key: SeKey, iconId: SeIconId) => void;
  onSeSettingsChange: (key: SeKey, patch: Partial<Pick<SeAssignment, "volume" | "pan">>) => void;
  onTransferSeAssignment: (sourceKey: SeKey, targetKey: SeKey, options: { copy: boolean }) => void;
  onSaveSeSet: () => void;
  onLoadSeSet: () => void;
  onEditSeSet: () => void;
  onStopAllSe: () => void;
  onVoiceLimitChange: (value: number) => void;
  onCancelDetection: () => void;
  onUiSettingsChange: (patch: Partial<UiSettings>) => void;
}): ReactElement {
  const workGridRef = useRef<HTMLDivElement | null>(null);
  const rightStackRef = useRef<HTMLDivElement | null>(null);
  const mainViewRef = useRef<HTMLDivElement | null>(null);
  const playlistRatio = project.ui.mainPlaylistRatio;
  const waveformRatio = project.ui.mainWaveformRatio;
  const analyzerHeight = project.ui.mainAnalyzerHeight;
  const isPlaylistPlaying = playback.mode === "playlist";
  const playlistReady = project.playlistCreated;
  const sequencerRepeats = project.playlistEndBehavior === "repeat";
  const allListRepeatActive = project.allListRepeatEnabled;
  const enabledPlaylistCount = playlistReady ? getEnabledPlaylistItems(project.playlist).length : 0;
  const canNavigatePlaylist = enabledPlaylistCount > 1;
  const sequenceItems = playlistReady ? getEnabledPlaylistItems(project.playlist) : [];
  const sequenceTotalMs = getPlaylistItemsTotalMs(sequenceItems, project.bgmTracks);
  const sequencePositionMs = getSequencePlaybackPositionMs(sequenceItems, project.bgmTracks, playback);
  const sequenceName = playlistReady ? sanitizePlaylistName(project.playlistName, "Play List") : t("noListBuilt");
  const cumulativePlaybackText = formatCumulativePlaybackTime(playlistCumulativeDisplayMs, project.ui.language);
  const isSelectedScanning = Boolean(detectionProgress && selectedTrack?.id === detectionProgress.currentTrackId);
  const isDeepScanning = Boolean(isSelectedScanning && project.detection.mode === "deep");
  const isSelectedBgmPlaying = Boolean(selectedTrack && playback.mode !== "stopped" && playback.trackId === selectedTrack.id);

  function updatePlaylistSplit(clientX: number): void {
    const rect = workGridRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    onUiSettingsChange({ mainPlaylistRatio: clampPercent(((clientX - rect.left) / rect.width) * 100, 24, 58) });
  }

  function updateWaveformSplit(clientY: number): void {
    const rect = rightStackRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    onUiSettingsChange({ mainWaveformRatio: clampPercent(((clientY - rect.top) / rect.height) * 100, 30, 68) });
  }

  function updateAnalyzerHeight(clientY: number): void {
    const rect = mainViewRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    const maxHeight = Math.max(118, Math.min(360, rect.height - 260));
    onUiSettingsChange({ mainAnalyzerHeight: clampNumber(rect.bottom - clientY, 104, maxHeight, analyzerHeight) });
  }

  return (
    <div
      className="view main-view"
      ref={mainViewRef}
      style={{ "--analyzer-pane": `${analyzerHeight}px` } as CSSProperties}
    >
      <section className="panel transport-panel">
        <div className="transport-buttons">
          <button
            className="icon-button transport-skip-button"
            type="button"
            onClick={onPreviousPlaylistTrack}
            title={t("previousTrack")}
            aria-label={t("previousTrack")}
            disabled={!canNavigatePlaylist}
          >
            <SkipBack size={18} />
          </button>
          <button
            className={`transport-action ${isPlaylistPlaying ? "playlist-playing" : ""} ${playlistReady ? "" : "playlist-uncreated"}`}
            type="button"
            aria-disabled={playlistReady ? undefined : "true"}
            onClick={onPlayPlaylist}
          >
            <ListMusic size={18} />
            <PlaylistPlayGlyph active={isPlaylistPlaying} />
            {t("playlist")}
          </button>
          <button
            className="icon-button transport-skip-button"
            type="button"
            onClick={onNextPlaylistTrack}
            title={t("nextTrack")}
            aria-label={t("nextTrack")}
            disabled={!canNavigatePlaylist}
          >
            <SkipForward size={18} />
          </button>
          <button className="icon-button" type="button" onClick={onStop} title={t("stop")}>
            <Square size={17} />
          </button>
          <div className={`sequencer-end-mode-toggle ${allListRepeatActive ? "all-list-repeat-locked" : ""}`} role="group" aria-label={t("sequencerEndMode")}>
            <button
              className={sequencerRepeats ? "active" : ""}
              type="button"
              onClick={() => onPlaylistEndBehaviorChange("repeat")}
              title={t("sequencerRepeat")}
              aria-pressed={sequencerRepeats}
              disabled={allListRepeatActive}
            >
              <Repeat size={15} />
              <span>{t("sequencerRepeat")}</span>
            </button>
            <button
              className={!sequencerRepeats ? "active" : ""}
              type="button"
              onClick={() => onPlaylistEndBehaviorChange("stop")}
              title={t("sequencerOneShot")}
              aria-pressed={!sequencerRepeats}
              disabled={allListRepeatActive}
            >
              <span>{t("oneShot")}</span>
            </button>
          </div>
          {allListRepeatActive ? (
            <div
              className="all-list-repeat-status"
              role="status"
              aria-label={t("allListRepeat")}
            >
              <span className="all-list-repeat-lamp" aria-hidden="true" />
              <span>{t("allListRepeat")}</span>
            </div>
          ) : null}
        </div>
        <div className="now-playing sequence-now-playing">
          <span className={`now-dot ${isPlaylistPlaying ? "" : "idle"}`} />
          <div className="sequence-summary-main">
            <span className="eyebrow">Sequence</span>
            <strong>{sequenceName}</strong>
          </div>
          {playlistReady ? (
            <SequenceStars rating={project.playlistRating} onChange={onPlaylistRatingChange} />
          ) : null}
          <button
            className={`thin-button sequence-update-button ${canUpdateSequenceData ? "active" : ""}`}
            type="button"
            onClick={onUpdateSequenceData}
            disabled={!canUpdateSequenceData}
          >
            {t("updateSequenceData")}
          </button>
          <div className="sequence-summary-stat">
            <span className="eyebrow">{t("cumulativePlayTime")}</span>
            <strong>{cumulativePlaybackText}</strong>
          </div>
        </div>
        <div className="sequence-time-readout time-readout" aria-label={`${formatTimeSeconds(sequencePositionMs)} / ${formatTimeSeconds(sequenceTotalMs)}`}>
          {formatTimeSeconds(sequencePositionMs)} / {formatTimeSeconds(sequenceTotalMs)}
        </div>
      </section>
      <div
        className="main-work-grid"
        ref={workGridRef}
        style={{ "--playlist-pane": `${playlistRatio}%` } as CSSProperties}
      >
        <BgmPlaylistPanel
          project={project}
          selectedTrack={selectedTrack}
          playback={playback}
          positionMs={positionMs}
          playlistCreated={project.playlistCreated}
          onSelectTrack={onSelectTrack}
          onPlayPlaylistIndex={onPlayPlaylistIndex}
          onBuildPlaylist={onOpenSequenceBuilder}
          t={t}
        />
        <ResizeDivider
          orientation="vertical"
          label="Resize playlist and waveform panels"
          onDrag={updatePlaylistSplit}
        />
        <div
          className="main-right-stack"
          ref={rightStackRef}
          style={{ "--waveform-pane": `${waveformRatio}%` } as CSSProperties}
        >
          <div className="waveform-split-stack">
            <div className="monitor-progress-anchor">
              <WaveformView
                track={selectedTrack}
                currentMs={positionMs}
                positionStore={positionStore}
                volume={selectedTrack?.volume ?? 1}
                onVolumeChange={selectedTrack ? (volume) => onTrackVolumeChange(selectedTrack.id, volume) : undefined}
                onLoopChange={onLoopChange}
                onLoopDragStart={onLoopDragStart}
                onLoopDragEnd={onLoopDragEnd}
                onSeek={onBgmSeek}
                showPlayhead={isSelectedBgmPlaying}
                busLabel="BGM"
                panelTitle="BGM Monitor"
                compact
                language={project.ui.language}
                isScanning={isSelectedScanning}
                isDeepScanning={isDeepScanning}
                hideEmptyLabel
              />
              {detectionProgress ? <DetectionProgressView progress={detectionProgress} language={project.ui.language} onCancel={onCancelDetection} /> : null}
            </div>
            <WaveformView
              track={lastPlayedSeFile}
              currentMs={sePositionMs}
              busLabel="SE"
              panelTitle="SE Monitor"
              compact
              language={project.ui.language}
              showPlayhead={sePositionMs > POSITION_RESET_EPSILON_MS}
              hideEmptyLabel
            />
          </div>
          <ResizeDivider
            orientation="horizontal"
            label="Resize waveform and SE pad panels"
            onDrag={updateWaveformSplit}
          />
          <SePad
            assignments={project.seAssignments}
            activeKeys={activeKeys}
            voiceCount={voiceCount}
            voiceLimit={project.mix.seVoiceLimit}
            preloadMap={sePreloadMap}
            readySummary={seReadySummary}
            language={project.ui.language}
            onAssign={onAssignSe}
            onTrigger={onTriggerSe}
            onStopKey={onStopSe}
            onUnload={onUnloadSe}
            onIconWheel={onIconWheel}
            onIconSelect={onIconSelect}
            onSettingsChange={onSeSettingsChange}
            onTransferAssignment={onTransferSeAssignment}
            currentSeSetName={project.activeSeSetName}
            onSaveSet={onSaveSeSet}
            onLoadSet={onLoadSeSet}
            onEditSeSet={onEditSeSet}
            onStopAll={onStopAllSe}
            onVoiceLimitChange={onVoiceLimitChange}
          />
        </div>
      </div>
      <div className="analyzer-resize-shell">
        <ResizeDivider
          orientation="horizontal"
          label="Resize analyzer panel"
          onDrag={updateAnalyzerHeight}
        />
        <AnalyzerPanel
          bgmAnalyser={bgmAnalyser}
          seAnalyser={seAnalyser}
          bands={project.visual.analyzerBands}
          fps={project.visual.analyzerFps}
          autoLevel={project.visual.analyzerAutoLevel}
          manualLevel={project.visual.analyzerManualLevel}
          voiceCount={voiceCount}
          seTransientLevel={seTransientLevel}
          gamingnessEffectStrength={gamingnessEffectStrength}
        />
      </div>
    </div>
  );
}

const BgmPlaylistPanel = memo(function BgmPlaylistPanel({
  project,
  selectedTrack,
  playback,
  positionMs,
  playlistCreated,
  onSelectTrack,
  onPlayPlaylistIndex,
  onBuildPlaylist,
  t
}: {
  project: GamingProject;
  selectedTrack: BgmTrack | null;
  playback: PlaybackState;
  positionMs: number;
  playlistCreated: boolean;
  onSelectTrack: (trackId: string) => void;
  onPlayPlaylistIndex: (index: number, startElapsedMs?: number) => void;
  onBuildPlaylist: () => void;
  t: Translator;
}): ReactElement {
  const rows = playlistCreated ? project.playlist.slice(0, Math.max(5, project.playlist.length)) : [];
  const enabledRows = playlistCreated ? getEnabledPlaylistItems(project.playlist) : [];
  const playlistPanelEmpty = project.bgmTracks.length === 0 && rows.length === 0;
  return (
    <section className={`panel playlist-panel ${playlistPanelEmpty ? "playlist-empty-disabled" : ""}`} data-bgm-sequence-drop-zone="true">
      <div className="panel-title-row">
        <h2>{t("bgmPlaylist")}</h2>
        <span className="subtle">{playlistCreated ? `${project.playlist.length} ${t("tracks")}` : t("notCreated")}</span>
      </div>
      <div className="playlist-list">
        {!playlistCreated ? (
          <button className="playlist-create-state" type="button" data-bgm-sequence-drop-zone="true" onClick={onBuildPlaylist}>
            <strong>{t("createPlaylist")}</strong>
            <span>{project.bgmTracks.length} {t("bgmReady")}</span>
          </button>
        ) : null}
        {playlistCreated && rows.length === 0 ? <div className="empty-list">{t("playlistEmpty")}</div> : null}
        {rows.map((item, index) => {
          const track = project.bgmTracks.find((candidate) => candidate.id === item.trackId);
          if (!track) return null;
          const active = selectedTrack?.id === track.id;
          const playlistActive = playback.mode === "playlist" && playback.itemId === item.id;
          const rowPlaying = playlistActive || (playback.mode === "track" && playback.trackId === track.id);
          const plannedMs = getPlaylistPlayMs(track, item.rule);
          const elapsedMs = rowPlaying ? getPlaybackElapsedMs(playback, plannedMs) : 0;
          const enabledIndex = enabledRows.findIndex((candidate) => candidate.id === item.id);
          return (
            <button
              className={`playlist-row ${active ? "selected" : ""}`}
              type="button"
              key={item.id}
              onClick={() => onSelectTrack(track.id)}
              onDoubleClick={() => {
                if (enabledIndex >= 0) onPlayPlaylistIndex(enabledIndex);
              }}
            >
              <span className="row-play">{playlistActive ? <PlaylistPlayGlyph active compact /> : playback.mode === "track" && playback.trackId === track.id ? <Play size={14} /> : index + 1}</span>
              <span className="row-main">
                <span className="row-title-line">
                  <strong>{track.fileName}</strong>
                  <PlaylistProgressBar
                    track={track}
                    item={item}
                    elapsedMs={elapsedMs}
                    active={playlistActive}
                    onSeek={(startElapsedMs) => {
                      if (enabledIndex >= 0) onPlayPlaylistIndex(enabledIndex, startElapsedMs);
                    }}
                  />
                </span>
                <span>{rowPlaying ? `${formatTimeSeconds(elapsedMs)} / ${formatTimeSeconds(plannedMs)}` : formatTimeSeconds(plannedMs)}</span>
              </span>
              <span className="row-rule">
                {playback.mode === "playlist" && playback.itemId === item.id ? getLiveRuleText(track, item, playback, elapsedMs, project.ui.language) : formatRuleForTrack(track, item.rule, project.ui.language)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}, areBgmPlaylistPanelPropsEqual);

function SequenceStars({ rating, onChange }: { rating: number; onChange: (rating: number) => void }): ReactElement {
  const safeRating = sanitizePlaylistRating(rating);
  const [previewRating, setPreviewRating] = useState<number | null>(null);
  const [previewSuppressed, setPreviewSuppressed] = useState(false);
  const previewActive = previewRating !== null && !previewSuppressed;
  const values = [1, 2, 3];
  return (
    <div className="sequence-stars-control" onPointerLeave={() => {
      setPreviewRating(null);
      setPreviewSuppressed(false);
    }} onContextMenu={(event) => {
      event.preventDefault();
      onChange(0);
    }}>
      <span className="sequence-stars-label">Fav</span>
      {values.map((value, index) => {
        const nextRating = value === safeRating ? value - 1 : value;
        const filled = !previewActive && index < safeRating;
        const previewFilled = previewActive && index < (previewRating ?? 0);
        return (
          <button
            key={value}
            className={`sequence-star ${filled ? "filled" : ""} ${previewFilled ? "preview" : ""}`}
            type="button"
            aria-label={`Sequence Stars ${value}`}
            onPointerEnter={() => {
              if (!previewSuppressed) setPreviewRating(nextRating);
            }}
            onFocus={() => {
              if (!previewSuppressed) setPreviewRating(nextRating);
            }}
            onBlur={() => {
              setPreviewRating(null);
              setPreviewSuppressed(false);
            }}
            onClick={() => {
              setPreviewRating(null);
              setPreviewSuppressed(true);
              onChange(nextRating);
            }}
          >
            {filled ? "★" : "☆"}
          </button>
        );
      })}
    </div>
  );
}

function PlaylistProgressBar({
  track,
  item,
  elapsedMs,
  active,
  onSeek
}: {
  track: BgmTrack;
  item: PlaylistItem;
  elapsedMs: number;
  active: boolean;
  onSeek?: (elapsedMs: number) => void;
}): ReactElement {
  const plannedMs = getPlaylistPlayMs(track, item.rule);
  const safePlannedMs = Math.max(1, plannedMs);
  const progressPct = clampPercent((Math.max(0, Math.min(elapsedMs, safePlannedMs)) / safePlannedMs) * 100, 0, 100);
  const fadeMs = getPlaylistFadeMs(track, item.rule);
  const fadeStartPct = fadeMs > 0 ? clampPercent(((safePlannedMs - fadeMs) / safePlannedMs) * 100, 0, 100) : 100;
  const loopStartMs = shouldShowPlaylistLoopRegion(track, item.rule) ? sampleToMs(track.loop!.startSample, track.sampleRate) : null;
  const loopStartPct = loopStartMs !== null ? clampPercent((Math.min(loopStartMs, safePlannedMs) / safePlannedMs) * 100, 0, 100) : null;
  const loopMarkers = getPlaylistLoopMarkerPercents(track, item.rule, safePlannedMs);

  return (
    <span
      className={`playlist-progress ${active ? "active" : ""}`}
      aria-label={`${formatTimeSeconds(elapsedMs)} / ${formatTimeSeconds(safePlannedMs)}`}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = clampNumber((event.clientX - rect.left) / rect.width, 0, 1, 0);
        onSeek?.(ratio * safePlannedMs);
      }}
    >
      {loopStartPct !== null ? <span className="playlist-progress-loop" style={{ left: `${loopStartPct}%`, width: `${100 - loopStartPct}%` } as CSSProperties} /> : null}
      {fadeMs > 0 ? <span className="playlist-progress-fade" style={{ left: `${fadeStartPct}%`, width: `${100 - fadeStartPct}%` } as CSSProperties} /> : null}
      {loopMarkers.map((pct) => (
        <span className="playlist-progress-loop-marker" key={pct.toFixed(2)} style={{ left: `${pct}%` } as CSSProperties} />
      ))}
      <span className="playlist-progress-fill" style={{ width: `${progressPct}%` } as CSSProperties} />
    </span>
  );
}

function getPlaylistLoopMarkerPercents(track: BgmTrack, rule: PlaylistRule, plannedMs: number): number[] {
  if (!track.loop || rule.mode !== "loop-count") return [];
  const introMs = sampleToMs(track.loop.startSample, track.sampleRate);
  const loopMs = Math.max(1, sampleToMs(track.loop.lengthSamples, track.sampleRate));
  const count = Math.min(12, Math.max(0, Math.floor(rule.loopCount) - 1));
  return Array.from({ length: count }, (_, index) => clampPercent(((introMs + loopMs * (index + 1)) / plannedMs) * 100, 0, 100)).filter((pct) => pct > 0 && pct < 100);
}

function getPlaylistAudioOffsetMs(track: BgmTrack, rule: PlaylistRule, elapsedMs: number): number {
  const plannedMs = getPlaylistPlayMs(track, rule);
  const safeElapsedMs = Math.max(0, Math.min(Math.max(1, plannedMs), elapsedMs));
  if (!shouldLoopPlaylistPlayback(track, rule)) return Math.max(0, Math.min(track.durationMs, safeElapsedMs));
  const introMs = sampleToMs(track.loop.startSample, track.sampleRate);
  const loopMs = Math.max(1, sampleToMs(track.loop.lengthSamples, track.sampleRate));
  if (safeElapsedMs <= introMs) return Math.max(0, Math.min(track.durationMs, safeElapsedMs));
  const loopElapsedMs = (safeElapsedMs - introMs) % loopMs;
  return Math.max(0, Math.min(track.durationMs, introMs + loopElapsedMs));
}

function shouldLoopPlaylistPlayback(track: BgmTrack, rule: PlaylistRule): track is BgmTrack & { loop: NonNullable<BgmTrack["loop"]> } {
  return Boolean(track.loop && rule.mode !== "straight");
}

function shouldShowPlaylistLoopRegion(track: BgmTrack, rule: PlaylistRule): track is BgmTrack & { loop: NonNullable<BgmTrack["loop"]> } {
  return shouldLoopPlaylistPlayback(track, rule);
}

function getPlaybackElapsedMs(playback: PlaybackState, plannedMs: number): number {
  if (playback.mode === "stopped") return 0;
  return Math.max(0, Math.min(plannedMs, (performance.now() - playback.startedAt) * getPlaybackRate(playback)));
}

function sanitizePlaybackRate(rate: number): number {
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function getPlaybackRate(playback: PlaybackState): number {
  return playback.mode === "stopped" ? 1 : sanitizePlaybackRate(playback.rate);
}

function rebasePlaybackForRate(playback: PlaybackState, now: number, nextRate: number): PlaybackState {
  if (playback.mode === "stopped") return playback;
  const safeNextRate = sanitizePlaybackRate(nextRate);
  const elapsedAtOldRateMs = Math.max(0, (now - playback.startedAt) * getPlaybackRate(playback));
  return { ...playback, startedAt: now - elapsedAtOldRateMs / safeNextRate, rate: safeNextRate };
}

function rebasePlaylistListeningSessionForRate(
  session: PlaylistListeningSession | null,
  now: number,
  nextRate: number
): PlaylistListeningSession | null {
  if (!session) return null;
  const safeNextRate = sanitizePlaybackRate(nextRate);
  const elapsedAtOldRateMs = Math.max(0, (now - session.startedAt) * sanitizePlaybackRate(session.rate));
  return { ...session, startedAt: now - elapsedAtOldRateMs / safeNextRate, rate: safeNextRate };
}

function getSequencePlaybackPositionMs(items: PlaylistItem[], tracks: BgmTrack[], playback: PlaybackState): number {
  if (playback.mode !== "playlist") return 0;
  let elapsedBeforeCurrentMs = 0;
  for (const item of items) {
    const track = tracks.find((candidate) => candidate.id === item.trackId);
    if (!track) continue;
    const itemPlayMs = getPlaylistPlayMs(track, item.rule);
    if (item.id === playback.itemId) {
      return elapsedBeforeCurrentMs + getPlaybackElapsedMs(playback, itemPlayMs);
    }
    elapsedBeforeCurrentMs += itemPlayMs;
  }
  return 0;
}

function getLivePlaylistCumulativeDisplayMs(project: GamingProject, session: PlaylistListeningSession | null, now = performance.now()): number {
  const baseMs =
    session?.playlistId
      ? project.savedPlaylists.find((playlist) => playlist.id === session.playlistId)?.cumulativePlayMs ?? project.playlistCumulativePlayMs
      : project.playlistCumulativePlayMs;
  const sessionElapsedMs = session ? Math.max(0, now - session.startedAt) * sanitizePlaybackRate(session.rate) : 0;
  return sanitizePlaylistCumulativeMs(baseMs + sessionElapsedMs);
}

function formatCumulativePlaybackTime(ms: number, language: UiLanguage): string {
  const totalSeconds = Math.max(0, Math.floor(sanitizePlaylistCumulativeMs(ms) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (language === "ja") {
    return `${hours}時間 ${String(minutes).padStart(2, "0")}分 ${String(seconds).padStart(2, "0")}秒`;
  }
  return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function areBgmPlaylistPanelPropsEqual(
  previous: {
    project: GamingProject;
    selectedTrack: BgmTrack | null;
    playback: PlaybackState;
    positionMs: number;
    playlistCreated: boolean;
    onSelectTrack: (trackId: string) => void;
    onPlayPlaylistIndex: (index: number) => void;
    onBuildPlaylist: () => void;
    t: Translator;
  },
  next: {
    project: GamingProject;
    selectedTrack: BgmTrack | null;
    playback: PlaybackState;
    positionMs: number;
    playlistCreated: boolean;
    onSelectTrack: (trackId: string) => void;
    onPlayPlaylistIndex: (index: number) => void;
    onBuildPlaylist: () => void;
    t: Translator;
  }
): boolean {
  if (
    previous.project !== next.project ||
    previous.selectedTrack !== next.selectedTrack ||
    previous.playback !== next.playback ||
    previous.playlistCreated !== next.playlistCreated ||
    previous.t !== next.t
  ) {
    return false;
  }
  if (previous.playback.mode === "playlist" || next.playback.mode === "playlist") {
    return previous.positionMs === next.positionMs;
  }
  return true;
}

function ResizeDivider({
  orientation,
  label,
  className,
  onDrag
}: {
  orientation: "vertical" | "horizontal";
  label: string;
  className?: string;
  onDrag: (clientPosition: number) => void;
}): ReactElement {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const isVertical = orientation === "vertical";

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
    onDrag(isVertical ? event.clientX : event.clientY);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!draggingRef.current) return;
    event.preventDefault();
    onDrag(isVertical ? event.clientX : event.clientY);
  }

  function endDrag(): void {
    draggingRef.current = false;
    setDragging(false);
  }

  return (
    <button
      className={`resize-divider ${orientation} ${className ?? ""} ${dragging ? "dragging" : ""}`}
      type="button"
      aria-label={label}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    />
  );
}

function PlaylistPlayGlyph({ active, compact = false }: { active: boolean; compact?: boolean }): ReactElement {
  return (
    <span className={`playlist-play-glyph ${active ? "active" : ""} ${compact ? "compact" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function GamingnessExpPanel({
  progress,
  compact = false,
  overflowAnimationKey = 0,
  awardPopups = []
}: {
  progress: GamingnessProgress;
  compact?: boolean;
  overflowAnimationKey?: number;
  awardPopups?: ExpAwardPopup[];
}): ReactElement {
  const nextText = progress.nextTarget === null ? "MAXED" : `${progress.assetCount}/${progress.nextTarget}`;
  const levelTone = clampNumber(progress.level / gamingnessThresholds.length, 0, 1, 0);
  return (
    <div
      className={`gaming-exp-panel ${compact ? "compact" : ""}`}
      style={{ "--load-exp-gaming": levelTone } as CSSProperties}
      aria-label="Loaded audio EXP"
    >
      {overflowAnimationKey > 0 ? (
        <div className="exp-overflow-burst" key={overflowAnimationKey} aria-hidden="true">
          <span>OVERFLOW</span>
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : null}
      {awardPopups.length > 0 ? (
        <div className="exp-award-floats" aria-hidden="true">
          {awardPopups.map((popup) => (
            <span className={`exp-award-float ${popup.limited ? "limited" : ""}`} key={popup.id}>
              {popup.text}
            </span>
          ))}
        </div>
      ) : null}
      <div className="gaming-exp-bar">
        <span style={{ width: `${progress.progressPct}%` }} />
      </div>
      <div className="gaming-exp-meta">
        <span className="gaming-exp-level">LV {progress.level + 1}</span>
        <span>{nextText}</span>
      </div>
      <div className="gaming-exp-counts">
        <span>BGM {progress.bgmCount}</span>
        <span>SE {progress.seCount}</span>
      </div>
    </div>
  );
}

function DebugExpControls({ enabled, onAdd }: { enabled: boolean; onAdd: (amount: number) => void }): ReactElement {
  return (
    <div className="debug-exp-controls" aria-label="Debug EXP controls">
      <span>DEBUG</span>
      <div>
        <button type="button" disabled={!enabled} onClick={() => onAdd(10)} title={enabled ? "Add 10 EXP" : "EXP/LV Mode is OFF"}>
          +10
        </button>
        <button type="button" disabled={!enabled} onClick={() => onAdd(100)} title={enabled ? "Add 100 EXP" : "EXP/LV Mode is OFF"}>
          +100
        </button>
      </div>
    </div>
  );
}

function getReadmeSeen(): boolean {
  try {
    return window.localStorage.getItem(README_SEEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markReadmeSeen(): void {
  try {
    window.localStorage.setItem(README_SEEN_STORAGE_KEY, "1");
  } catch {
    // Local storage can be unavailable in restricted preview contexts.
  }
}

function DetectionProgressView({ progress, language, onCancel }: { progress: DetectionProgress; language: UiLanguage; onCancel: () => void }): ReactElement {
  const [nowMs, setNowMs] = useState(Date.now());
  const percent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  const isJa = language === "ja";

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="detect-progress" role="status" aria-live="polite">
      <div className="detect-progress-card">
        <div className="detect-progress-title">
            <span className="spinner" />
            <div>
            <strong>{progress.cancelRequested ? (isJa ? "Auto Loop中止中" : "Canceling Auto Loop") : isJa ? "Auto Loop検出中" : "Auto Loop scanning"}</strong>
            <span>{progress.currentFile}</span>
          </div>
        </div>
        <div className="detect-progress-meter" aria-label="Auto Loop progress">
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="detect-progress-meta">
          <span>
            {isJa ? `${progress.completed}/${progress.total} 完了` : `${progress.completed}/${progress.total} complete`}
          </span>
          <span>{isJa ? "経過" : "Elapsed"} {formatElapsedSeconds((nowMs - progress.startedAtMs) / 1000)}</span>
        </div>
        <div className="detect-progress-note">
          {progress.cancelRequested ? (isJa ? "現在のファイル処理後に停止します。" : "Stopping after the current file finishes.") : isJa ? `検出中 ${progress.current}/${progress.total}` : `Scanning ${progress.current}/${progress.total}.`}
        </div>
        <button className="thin-button" type="button" onClick={onCancel} disabled={progress.cancelRequested}>
          {progress.cancelRequested ? (isJa ? "中止要求済み" : "Cancel requested") : isJa ? "中止" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function HelpModal({
  mode,
  language,
  t,
  onClose
}: {
  mode: HelpModalMode;
  language: UiLanguage;
  t: Translator;
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const title = mode === "guide" ? "GamingLooper README" : t("shortcuts");
  return (
    <div className="help-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="help-modal panel" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel-title-row">
          <h2>{title}</h2>
          <button className="thin-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {mode === "guide" ? (
          <>
            <HelpSequenceQuickStart language={language} />
            <div className="help-section-list">
              {getHelpSections(language).map((section) => (
                <section className="help-section" key={section.title}>
                  <h3>{section.title}</h3>
                  {section.body.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className="shortcut-list">
            {getShortcutRows(language).map((row) => (
              <div className="shortcut-row" key={row.keys}>
                <kbd>{row.keys}</kbd>
                <span>{row.description}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HelpSequenceQuickStart({ language }: { language: UiLanguage }): ReactElement {
  const isJa = language === "ja";
  const steps = isJa
    ? [
        {
          title: "BGM Source",
          label: "素材にする曲を読み込む",
          action: "音声ファイルをドロップ、またはBGM読込で追加します。",
          result: "ここに並んだ曲が、Sequenceに使う候補になります。",
          icon: <FileMusic size={22} />
        },
        {
          title: "Build Sequencer",
          label: "聴きたい曲を並べる",
          action: "使う曲だけをBuild Sequencerへ送ります。",
          result: "並べた順番が、そのまま再生順になります。",
          icon: <ListOrdered size={22} />
        },
        {
          title: "Rules",
          label: "曲ごとの聴き方を決める",
          action: "Loopなら「何周するか」、Timeなら「何秒再生するか」を指定します。",
          result: "Fadeを設定すると、次の曲へ移る前の余韻を調整できます。",
          icon: <Hammer size={22} />
        },
        {
          title: "Complete & Save Sequence",
          label: "再生できるListとして保存する",
          action: "完成した流れに名前を付けて保存します。",
          result: "保存したSequenceはMain Viewで読み込み、設定した曲順・Loop・Time・Fadeのまま再生できます。",
          icon: <Library size={22} />
        }
      ]
    : [
        {
          title: "BGM Source",
          label: "Load tracks to use as material",
          action: "Drop audio files here, or use Import BGM.",
          result: "Tracks listed here become candidates for the Sequence.",
          icon: <FileMusic size={22} />
        },
        {
          title: "Build Sequencer",
          label: "Arrange the tracks you want to hear",
          action: "Send only the tracks you want into Build Sequencer.",
          result: "The order you arrange here becomes the playback order.",
          icon: <ListOrdered size={22} />
        },
        {
          title: "Rules",
          label: "Choose how each track plays",
          action: "Use Loop to choose how many repeats, or Time to choose how many seconds to play.",
          result: "Fade controls the tail before moving to the next track.",
          icon: <Hammer size={22} />
        },
        {
          title: "Complete & Save Sequence",
          label: "Save it as a playable List",
          action: "Name and save the finished flow.",
          result: "Main View can load the saved Sequence and play it back with the order, Loop, Time, and Fade you set.",
          icon: <Library size={22} />
        }
      ];
  const seSteps = isJa
    ? [
        {
          title: "SE Pad Key",
          label: "使うキーを選ぶ",
          action: "Main ViewのSE Padで空のキーをクリックし、SEを割り当てるキーを決めます。",
          result: "そのキーがSEを鳴らす操作場所になります。",
          icon: <Music2 size={22} />
        },
        {
          title: "Load SE File",
          label: "SEファイルを読み込む",
          action: "選んだキーへSEファイルを読み込みます。読み込み完了後、そのキーでSEを鳴らせます。",
          result: "SEはBGM Listではなく、キーごとの割り当てとして管理されます。",
          icon: <FileMusic size={22} />
        },
        {
          title: "Tune Vol / Pan / Icon",
          label: "音量・定位・見た目を調整する",
          action: "キーごとのVol、Pan、アイコン、色を調整し、BGMに対して埋もれないか確認します。",
          result: "SEの聞こえ方と操作時の見分けやすさが整います。",
          icon: <Settings size={22} />
        },
        {
          title: "Save SE Set",
          label: "完成した割り当てを保存する",
          action: "現在のSE Pad状態をSE Setとして保存します。",
          result: "同じキー割り当て、Vol、Pan、アイコン、Voice Limitをあとから呼び出せます。",
          icon: <Library size={22} />
        }
      ]
    : [
        {
          title: "SE Pad Key",
          label: "Choose the key you want to use",
          action: "Click an empty key in the Main View SE Pad to choose where the SE will live.",
          result: "That key becomes the trigger point for the SE.",
          icon: <Music2 size={22} />
        },
        {
          title: "Load SE File",
          label: "Import the SE file",
          action: "Load an SE file into the selected key. Once ready, that key can play the SE.",
          result: "The SE is managed as a key assignment, not as part of the BGM List.",
          icon: <FileMusic size={22} />
        },
        {
          title: "Tune Vol / Pan / Icon",
          label: "Adjust loudness, placement, and readability",
          action: "Tune Vol, Pan, icon, and color per key while checking how the SE sits against the BGM.",
          result: "The SE becomes easier to hear, place, and identify during use.",
          icon: <Settings size={22} />
        },
        {
          title: "Save SE Set",
          label: "Save the finished assignment layout",
          action: "Save the current SE Pad state as an SE Set.",
          result: "Reload the same key assignments, Vol, Pan, icons, and Voice Limit later.",
          icon: <Library size={22} />
        }
      ];
  const purpose = isJa
    ? {
        eyebrow: "WHAT GAMINGLOOPER IS FOR",
        title: "BGMとSEの流れを実際に試し、好みのループ回数やトラックタイムに編集して再生するアプリ",
        body:
          "GamingLooperには大きく2つの目的があります。1つは、ゲームBGMの流れとSEの鳴り方を同じ画面で試し、実際に再生しながらバランスを確認すること。もう1つは、ゲームのサウンドトラックを読み込み、曲順、ループ回数、トラックタイム、フェードを好みに編集して、Main Viewで再生できるListを作ることです。",
        points: ["BGMとSEを同じ画面で試聴", "SE Padをキーごとに調整", "好みのLoop・Track Timeで再生"],
        cards: [
          {
            title: "ゲームBGMの流れを、実際に鳴らしながら組んで確認する",
            body:
              "Main Viewでは、BGMを再生しながらSE PadにSEを割り当て、キーごとのVol、Pan、アイコンを調整できます。戦闘、メニュー、通知、決定音などを実際に鳴らし、BGMに対してSEが埋もれないか、左右定位が適切か、同時発音数が多すぎないかを確認します。完成した割り当てはSE Setとして保存・呼び出しできます。",
            jumpLabel: "HOW TO ASSIGN SE TO KEYS",
            jumpTarget: "help-assign-se"
          },
          {
            title: "ゲームのサウンドトラックを、任意のループ数やプレイ時間で再生する",
            body:
              "Sequence Builderでは、BGM Sourceに読み込んだ曲をBuild Sequencerへ送り、曲順、Loop回数、Time再生秒数、Fade秒数を決めます。Complete & Save Sequenceで実ファイルとして保存すると、Main ViewのPlay Listとして再生できるListになります。",
            jumpLabel: "HOW TO BUILD SEQUENCE",
            jumpTarget: "help-build-sequence"
          }
        ]
      }
    : {
        eyebrow: "WHAT GAMINGLOOPER IS FOR",
        title: "Audition BGM and SE, then build soundtrack files into playable Sequences.",
        body:
          "GamingLooper has two main purposes. First, it lets you audition game BGM flow and SE playback in the same workspace while actually listening. Second, it lets you import game soundtrack files and build Sequence Lists with the loop count, play duration, and fade behavior you choose.",
        points: ["Audition BGM and SE together", "Tune each SE Pad key", "Design soundtrack Sequence playback"],
        cards: [
          {
            title: "Build game BGM flow and check it while it plays",
            body:
              "In Main View, play BGM while assigning SE files to the SE Pad. Tune Vol, Pan, and icons per key, then check whether UI sounds, alerts, hits, or menu sounds sit correctly against the BGM. Save and reload the finished key layout as an SE Set.",
            jumpLabel: "HOW TO ASSIGN SE TO KEYS",
            jumpTarget: "help-assign-se"
          },
          {
            title: "Import game soundtracks and play them with custom loops or time rules",
            body:
              "In Sequence Builder, move songs from BGM Source into Build Sequencer, set song order, Loop count, Time seconds, and Fade seconds, then save the Sequence file with Complete & Save Sequence.",
            jumpLabel: "HOW TO BUILD SEQUENCE",
            jumpTarget: "help-build-sequence"
          }
        ]
      };
  const renderHelpFlow = (items: Array<{ title: string; label: string; action: string; result: string; icon: ReactElement }>, label: string): ReactElement => (
    <div className="help-flow-diagram" aria-label={label}>
      {items.map((step, index) => (
        <div className="help-flow-part" key={step.title}>
          <div className="help-flow-card">
            <span className="help-flow-index">{index + 1}</span>
            <span className="help-flow-icon">{step.icon}</span>
            <strong>{step.title}</strong>
            <em>{step.label}</em>
            <p>{step.action}</p>
            <small>{step.result}</small>
          </div>
          {index < items.length - 1 ? (
            <span className="help-flow-arrow" aria-hidden="true">↓</span>
          ) : null}
        </div>
      ))}
    </div>
  );
  return (
    <section className="help-sequence-quickstart" aria-label="GamingLooper quick start">
      <div className="help-result-strip help-purpose-card">
        <span>{purpose.eyebrow}</span>
        <strong>{purpose.title}</strong>
        <p>{purpose.body}</p>
        <div className="help-purpose-points" aria-hidden="true">
          {purpose.points.map((point) => (
            <i key={point}>{point}</i>
          ))}
        </div>
        <div className="help-purpose-grid">
          {purpose.cards.map((card) => {
            const jumpTarget = "jumpTarget" in card ? card.jumpTarget : null;
            return (
              <article className="help-purpose-detail" key={card.title}>
                <strong>{card.title}</strong>
                <p>{card.body}</p>
                {"jumpLabel" in card && card.jumpLabel && jumpTarget ? (
                  <a
                    className="help-purpose-jump"
                    href={`#${jumpTarget}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(jumpTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {card.jumpLabel}
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
      <div className="help-hero-copy" id="help-assign-se">
        <span>FIRST TOUCH</span>
        <h3>HOW TO ASSIGN SE TO KEYS</h3>
        <p>
          {isJa
            ? "SE Padは、キーごとにSEファイルを割り当て、Vol、Pan、アイコン、Voice Limitを調整して、BGMと同時に鳴らしながら使い心地を確認するための場所です。下の順番どおりに進めると、呼び出して使えるSE Setができます。"
            : "SE Pad starts by assigning SE files to keys, then tuning Vol, Pan, icons, and Voice Limit while listening against the BGM. Follow the steps below to create a reusable SE Set."}
        </p>
      </div>
      {renderHelpFlow(seSteps, isJa ? "SEをキーに割り当てる手順" : "SE key assignment steps")}
      <div className="help-hero-copy" id="help-build-sequence">
        <span>FIRST TOUCH</span>
        <h3>HOW TO BUILD SEQUENCE</h3>
        <p>
          {isJa
            ? "ゲームのサウンドトラックを、好きなループ回数や再生時間で聴けるListにします。短く確認したい曲はTimeで再生時間を決め、じっくり聴きたい曲はLoopで何周するかを決めます。曲順とFadeを整えて保存すると、Main Viewでその流れをそのまま再生できます。"
            : "Build a List that plays game soundtrack files with the loop count or play duration you choose. Use Time when you want to check a track briefly, or Loop when you want to hear it repeat. Arrange the order, adjust Fade, then save it so Main View can play that flow back."}
        </p>
      </div>
      {renderHelpFlow(steps, isJa ? "Sequenceを作る手順" : "Sequence build steps")}
    </section>
  );
}

function ConfirmDialog({
  dialog,
  onCancel,
  onConfirm
}: {
  dialog: ConfirmDialogState;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (dialog.alertOnly) onConfirm();
        else onCancel();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialog.alertOnly, onCancel, onConfirm]);

  return (
    <div className="confirm-modal-backdrop" role="presentation" onMouseDown={dialog.alertOnly ? onConfirm : onCancel}>
      <section className={`confirm-modal panel ${dialog.danger ? "danger" : ""}`} role="dialog" aria-modal="true" aria-label={dialog.title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="confirm-modal-head">
          <span className="brand-mark small">GL</span>
          <h2>{dialog.title}</h2>
        </div>
        <p className="confirm-message">{dialog.message}</p>
        {dialog.detail ? <p className="confirm-detail">{dialog.detail}</p> : null}
        <div className="confirm-actions">
          <button className={`thin-button ${dialog.danger ? "danger-button" : ""}`} type="button" onClick={onConfirm} autoFocus>
            {dialog.confirmLabel ?? "OK"}
          </button>
          {dialog.alertOnly ? null : (
            <button className="thin-button" type="button" onClick={onCancel}>
              {dialog.cancelLabel ?? "Cancel"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function PromptDialog({
  dialog,
  onCancel,
  onConfirm
}: {
  dialog: PromptDialogState;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}): ReactElement {
  const [value, setValue] = useState(dialog.initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setValue(dialog.initialValue);
  }, [dialog.initialValue]);

  useEffect(() => {
    const target = dialog.multiline ? textareaRef.current : inputRef.current;
    if (!target) return;
    target.focus();
    target.select();
  }, [dialog.multiline]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Enter" && (!dialog.multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onConfirm(value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [dialog.multiline, onCancel, onConfirm, value]);

  return (
    <div className="confirm-modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="confirm-modal prompt-modal panel" role="dialog" aria-modal="true" aria-label={dialog.title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="confirm-modal-head">
          <span className="brand-mark small">GL</span>
          <h2>{dialog.title}</h2>
        </div>
        {dialog.message ? <p className="confirm-message">{dialog.message}</p> : null}
        {dialog.multiline ? (
          <textarea
            ref={textareaRef}
            className="prompt-field multiline"
            value={value}
            placeholder={dialog.placeholder}
            readOnly={dialog.readOnly}
            onChange={(event) => setValue(event.target.value)}
          />
        ) : (
          <input
            ref={inputRef}
            className="prompt-field"
            value={value}
            placeholder={dialog.placeholder}
            readOnly={dialog.readOnly}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <div className="confirm-actions">
          <button className="thin-button" type="button" onClick={() => onConfirm(value)}>
            {dialog.confirmLabel ?? "OK"}
          </button>
          <button className="thin-button" type="button" onClick={onCancel}>
            {dialog.cancelLabel ?? "Cancel"}
          </button>
        </div>
      </section>
    </div>
  );
}

type TrackContextMenuState =
  | { kind: "builder"; itemId: string; trackId: string; x: number; y: number }
  | { kind: "source"; trackId: string; x: number; y: number }
  | { kind: "saved-list"; playlistId: string; x: number; y: number };

function LoopPlaylistView({
  project,
  selectedTrack,
  selectedPlaylistItem,
  detectionSettings,
  playback,
  positionMs,
  positionStore,
  detectionProgress,
  t,
  onAddTrackToPlaylist,
  onAddTracksToPlaylist,
  onImportBgm,
  onClearBgmSource,
  onAutoLoopSourceTracks,
  onPlaylistNameChange,
  onBuildList,
  onClearSequence,
  onSavePlaylistAs,
  onOverwritePlaylist,
  canLoadStoredLists,
  onEditSavedPlaylist,
  onActivateSavedPlaylist,
  onExportSavedPlaylist,
  onDeleteSavedPlaylist,
  onDuplicateSavedPlaylist,
  onSavedPlaylistRatingChange,
  onAllListRepeatChange,
  onImportSequenceFile,
  onSelectTrack,
  onLoopChange,
  onLoopDragStart,
  onLoopDragEnd,
  onPlaylistRuleChange,
  onPlaylistItemChange,
  onApplyPlaylistRuleToAll,
  onApplyPlaylistLoopCountToAll,
  onApplyPlaylistDurationToAll,
  onApplyPlaylistFadeToAll,
  onInvalidPlayTime,
  onCopyPlaylistRules,
  onPastePlaylistRules,
  onMovePlaylistItem,
  onReorderPlaylistItem,
  onRemovePlaylistItemToSource,
  onDuplicatePlaylistItem,
  onDeletePlaylistItem,
  onDeleteSourceTrack,
  onPlayTrack,
  onStop,
  onPlayBeforeLoop,
  onBgmSeek,
  onCancelDetection,
  onConfirm,
  onPrompt
}: {
  project: GamingProject;
  selectedTrack: BgmTrack | null;
  selectedPlaylistItem: PlaylistItem | null;
  detectionSettings: DetectionSettings;
  playback: PlaybackState;
  positionMs: number;
  positionStore: PositionStore;
  detectionProgress: DetectionProgress | null;
  t: Translator;
  onAddTrackToPlaylist: (trackId: string, targetIndex?: number) => void;
  onAddTracksToPlaylist: (trackIds: string[], targetIndex?: number) => void;
  onImportBgm: () => void;
  onClearBgmSource: (trackIds: string[]) => void;
  onAutoLoopSourceTracks: (trackIds: string[]) => void;
  onPlaylistNameChange: (name: string) => void;
  onBuildList: () => void;
  onClearSequence: () => void;
  onSavePlaylistAs: () => void;
  onOverwritePlaylist: () => void;
  canLoadStoredLists: boolean;
  onEditSavedPlaylist: (id: string) => void;
  onActivateSavedPlaylist: (id: string) => void;
  onExportSavedPlaylist: (id: string) => void;
  onDeleteSavedPlaylist: (id: string) => void | Promise<void>;
  onDuplicateSavedPlaylist: (id: string) => void | Promise<void>;
  onSavedPlaylistRatingChange: (id: string, rating: number) => void;
  onAllListRepeatChange: (enabled: boolean) => void;
  onImportSequenceFile: () => void;
  onSelectTrack: (trackId: string) => void;
  onLoopChange: (loop: LoopMarker, options?: { history?: boolean }) => void;
  onLoopDragStart: () => void;
  onLoopDragEnd: () => void;
  onPlaylistRuleChange: (rule: PlaylistRule) => void;
  onPlaylistItemChange: (id: string, patch: Partial<PlaylistItem>) => void;
  onApplyPlaylistRuleToAll: (rule: PlaylistRule) => void;
  onApplyPlaylistLoopCountToAll: (loopCount: number, itemIds?: string[]) => void;
  onApplyPlaylistDurationToAll: (durationSeconds: number, itemIds?: string[]) => void;
  onApplyPlaylistFadeToAll: (fadeOutMs: number, itemIds?: string[]) => void;
  onInvalidPlayTime: (minimumSeconds: number) => void;
  onCopyPlaylistRules: () => void;
  onPastePlaylistRules: () => void;
  onMovePlaylistItem: (id: string, direction: -1 | 1) => void;
  onReorderPlaylistItem: (id: string, targetIndex: number) => void;
  onRemovePlaylistItemToSource: (id: string) => void;
  onDuplicatePlaylistItem: (id: string) => void;
  onDeletePlaylistItem: (id: string) => void;
  onDeleteSourceTrack: (trackId: string) => void;
  onPlayTrack: (trackId?: string) => void;
  onStop: () => void;
  onPlayBeforeLoop: () => void;
  onBgmSeek: (ms: number) => void;
  onCancelDetection: () => void;
  onConfirm: (dialog: ConfirmDialogState) => Promise<boolean>;
  onPrompt: (dialog: PromptDialogState) => Promise<string | null>;
}): ReactElement {
  const playlistTracks = project.playlist
    .map((item) => ({ item, track: project.bgmTracks.find((track) => track.id === item.trackId) ?? null }))
    .filter((entry): entry is { item: PlaylistItem; track: BgmTrack } => Boolean(entry.track));
  const playlistTrackIds = useMemo(() => new Set(project.playlist.map((item) => item.trackId)), [project.playlist]);
  const sourceHiddenTrackIds = useMemo(() => new Set(project.sourceHiddenTrackIds), [project.sourceHiddenTrackIds]);
  const sourceTracks = useMemo(() => project.bgmTracks.filter((track) => !playlistTrackIds.has(track.id) && !sourceHiddenTrackIds.has(track.id)), [playlistTrackIds, project.bgmTracks, sourceHiddenTrackIds]);
  const listLoaded = Boolean(project.activePlaylistId);
  const savedListDimmed = !listLoaded && !canLoadStoredLists;
  const builderSequenceDimmed = sourceTracks.length === 0 && playlistTracks.length === 0;
  const sequenceMonitorDimmed = !selectedTrack;
  const scanningTrackId = detectionProgress?.currentTrackId ?? null;
  const scanWaitingTrackIds = useMemo(() => new Set(detectionProgress?.pendingTrackIds ?? []), [detectionProgress?.pendingTrackIds]);
  const [draggingPlaylistItemId, setDraggingPlaylistItemId] = useState<string | null>(null);
  const [selectedPlaylistItemIds, setSelectedPlaylistItemIds] = useState<Set<string>>(() => new Set());
  const [draggingSourceTrackId, setDraggingSourceTrackId] = useState<string | null>(null);
  const [selectedSourceTrackIds, setSelectedSourceTrackIds] = useState<Set<string>>(() => new Set());
  const [sourceSearchQuery, setSourceSearchQuery] = useState("");
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [addedPlaylistItemId, setAddedPlaylistItemId] = useState<string | null>(null);
  const [completedPlaylistId, setCompletedPlaylistId] = useState<string | null>(null);
  const [pickedPlaylistId, setPickedPlaylistId] = useState<string | null>(null);
  const [reorderedPlaylistItemId, setReorderedPlaylistItemId] = useState<string | null>(null);
  const [sourceReturnTarget, setSourceReturnTarget] = useState(false);
  const [selectedSavedPlaylistId, setSelectedSavedPlaylistId] = useState<string | null>(project.activePlaylistId ?? project.savedPlaylists[0]?.id ?? null);
  const [duplicateBlocked, setDuplicateBlocked] = useState(false);
  const [playlistDragGhost, setPlaylistDragGhost] = useState<{ id: string; left: number; top: number; width: number } | null>(null);
  const playlistDragOffsetYRef = useRef(0);
  const [sourceDragGhost, setSourceDragGhost] = useState<{ trackIds: string[]; left: number; top: number; width: number } | null>(null);
  const sourceDragOffsetRef = useRef({ x: 0, y: 0 });
  const playlistRowDragBlockedRef = useRef(false);
  const previousPlaylistLengthRef = useRef(project.playlist.length);
  const previousPlaylistItemIdsRef = useRef(project.playlist.map((item) => item.id));
  const previousSavedListLengthRef = useRef(project.savedPlaylists.length);
  const sourceSelectionAnchorRef = useRef<string | null>(null);
  const playlistSelectionAnchorRef = useRef<string | null>(null);
  const sourceDragTrackIdsRef = useRef<string[]>([]);
  const sourcePointerDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    trackIds: string[];
    rowHeightPx: number;
    rowWidthPx: number;
    active: boolean;
    selectingRange: boolean;
    cardMoveLocked: boolean;
  } | null>(null);
  const sourceRangeSelectionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    source: "blank" | "card";
    selectedIds: string[];
  } | null>(null);
  const sourceSuppressClickRef = useRef(false);
  const [sourceRangeSelectionBox, setSourceRangeSelectionBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [listBuilderColumns, setListBuilderColumns] = useState({ list: 22, source: 40 });
  const listBuilderLayoutRef = useRef<HTMLDivElement | null>(null);
  const sourceTrackScrollRef = useRef<HTMLDivElement | null>(null);
  const builderSequenceScrollRef = useRef<HTMLDivElement | null>(null);
  const visibleSourceTracks = useMemo(() => filterAndSortSourceTracks(sourceTracks, sourceSearchQuery), [sourceSearchQuery, sourceTracks]);
  const visibleSourceTrackIds = useMemo(() => visibleSourceTracks.map((track) => track.id), [visibleSourceTracks]);
  const draggableSourceTrackIds = useMemo(
    () => sourceTracks.filter((track) => track.id !== scanningTrackId && !scanWaitingTrackIds.has(track.id)).map((track) => track.id),
    [scanWaitingTrackIds, scanningTrackId, sourceTracks]
  );
  const draggableSourceTrackIdSet = useMemo(() => new Set(draggableSourceTrackIds), [draggableSourceTrackIds]);
  const visibleDraggableSourceTrackIds = useMemo(
    () => visibleSourceTracks.filter((track) => track.id !== scanningTrackId && !scanWaitingTrackIds.has(track.id)).map((track) => track.id),
    [scanWaitingTrackIds, scanningTrackId, visibleSourceTracks]
  );
  const selectedSourceTracks = visibleSourceTracks.filter((track) => selectedSourceTrackIds.has(track.id) && draggableSourceTrackIdSet.has(track.id));
  const canAutoLoopSelectedSource =
    !detectionProgress &&
    selectedSourceTracks.length > 0;
  const sourceTracksForAdd =
    selectedSourceTracks.length > 0
      ? selectedSourceTracks
      : visibleSourceTracks.filter((track) => track.id === selectedTrack?.id && draggableSourceTrackIdSet.has(track.id));
  const hasSelectedSourceForAdd = sourceTracksForAdd.length > 0;
  const selectedPlaylistTracks = playlistTracks.filter(({ item }) => selectedPlaylistItemIds.has(item.id));
  const bulkPlaylistTargets = selectedPlaylistTracks.length > 1 ? selectedPlaylistTracks : playlistTracks;
  const bulkPlaylistTargetItemIds = selectedPlaylistTracks.length > 1 ? selectedPlaylistTracks.map(({ item }) => item.id) : undefined;
  const hasBulkPlaylistSelection = selectedPlaylistTracks.length > 1;
  const completeSequenceShouldGlow = project.playlist.length > 0 && hasCurrentPlaylistChanges(project);
  const isSelectedBgmPlaying = Boolean(selectedTrack && playback.mode !== "stopped" && playback.trackId === selectedTrack.id);
  const [builderRuleTooltip, setBuilderRuleTooltip] = useState<{ text: string; left: number; top: number; placement: "above" | "below" } | null>(null);
  const [playTimeDrafts, setPlayTimeDrafts] = useState<Record<string, string>>({});
  const [trackContextMenu, setTrackContextMenu] = useState<TrackContextMenuState | null>(null);
  const builderRuleTooltipTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => clearBuilderRuleTooltipTimer();
  }, []);

  useEffect(() => {
    if (!trackContextMenu) return undefined;
    const close = (): void => setTrackContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
    };
  }, [trackContextMenu]);

  useEffect(() => {
    setPlayTimeDrafts((current) => {
      const validIds = new Set(project.playlist.map((item) => item.id));
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => validIds.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [project.playlist]);

  useEffect(() => {
    setSelectedSourceTrackIds((current) => {
      const validIds = new Set(sourceTracks.map((track) => track.id));
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)));
      return next.size === current.size && Array.from(next).every((id) => current.has(id)) ? current : next;
    });
    if (sourceSelectionAnchorRef.current && !sourceTracks.some((track) => track.id === sourceSelectionAnchorRef.current)) {
      sourceSelectionAnchorRef.current = null;
    }
  }, [sourceTracks]);

  useEffect(() => {
    setSelectedPlaylistItemIds((current) => {
      const validIds = new Set(project.playlist.map((item) => item.id));
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)));
      return next.size === current.size && Array.from(next).every((id) => current.has(id)) ? current : next;
    });
    if (playlistSelectionAnchorRef.current && !project.playlist.some((item) => item.id === playlistSelectionAnchorRef.current)) {
      playlistSelectionAnchorRef.current = null;
    }
  }, [project.playlist]);

  useEffect(() => {
    const previousIds = new Set(previousPlaylistItemIdsRef.current);
    if (project.playlist.length > previousPlaylistLengthRef.current) {
      const addedItem = project.playlist.find((item) => !previousIds.has(item.id)) ?? project.playlist[project.playlist.length - 1] ?? null;
      setAddedPlaylistItemId(addedItem?.id ?? null);
    }
    previousPlaylistLengthRef.current = project.playlist.length;
    previousPlaylistItemIdsRef.current = project.playlist.map((item) => item.id);
  }, [project.playlist]);

  useEffect(() => {
    if (!addedPlaylistItemId) return undefined;
    const animationFrame = window.requestAnimationFrame(() => {
      const scroll = builderSequenceScrollRef.current;
      if (!scroll) return;
      const target = Array.from(scroll.querySelectorAll<HTMLElement>("[data-playlist-item-id]")).find(
        (row) => row.dataset.playlistItemId === addedPlaylistItemId
      );
      if (!target) return;
      const scrollRect = scroll.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const padding = 10;
      if (targetRect.top < scrollRect.top + padding) {
        scroll.scrollTo({ top: scroll.scrollTop + targetRect.top - scrollRect.top - padding, behavior: "smooth" });
      } else if (targetRect.bottom > scrollRect.bottom - padding) {
        scroll.scrollTo({ top: scroll.scrollTop + targetRect.bottom - scrollRect.bottom + padding, behavior: "smooth" });
      }
    });
    const timeout = window.setTimeout(() => setAddedPlaylistItemId(null), 720);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [addedPlaylistItemId]);

  useEffect(() => {
    if (project.savedPlaylists.length > previousSavedListLengthRef.current) {
      setCompletedPlaylistId(project.savedPlaylists[project.savedPlaylists.length - 1]?.id ?? null);
    }
    previousSavedListLengthRef.current = project.savedPlaylists.length;
  }, [project.savedPlaylists]);

  useEffect(() => {
    if (!completedPlaylistId) return undefined;
    const timeout = window.setTimeout(() => setCompletedPlaylistId(null), 920);
    return () => window.clearTimeout(timeout);
  }, [completedPlaylistId]);

  useEffect(() => {
    if (!pickedPlaylistId) return undefined;
    const timeout = window.setTimeout(() => setPickedPlaylistId(null), 560);
    return () => window.clearTimeout(timeout);
  }, [pickedPlaylistId]);

  useEffect(() => {
    if (!reorderedPlaylistItemId) return undefined;
    const timeout = window.setTimeout(() => setReorderedPlaylistItemId(null), 640);
    return () => window.clearTimeout(timeout);
  }, [reorderedPlaylistItemId]);

  useEffect(() => {
    if (!duplicateBlocked) return undefined;
    const timeout = window.setTimeout(() => setDuplicateBlocked(false), 620);
    return () => window.clearTimeout(timeout);
  }, [duplicateBlocked]);

  useEffect(() => {
    if (project.activePlaylistId) {
      setSelectedSavedPlaylistId(project.activePlaylistId);
      return;
    }
    if (selectedSavedPlaylistId && project.savedPlaylists.some((playlist) => playlist.id === selectedSavedPlaylistId)) {
      return;
    }
    setSelectedSavedPlaylistId(project.savedPlaylists[0]?.id ?? null);
  }, [project.activePlaylistId, project.savedPlaylists, selectedSavedPlaylistId]);

  function requestAddTracks(trackIds: string[], targetIndex?: number): void {
    if (trackIds.some((trackId) => playlistTrackIds.has(trackId))) {
      setDuplicateBlocked(true);
    }
    if (trackIds.length === 1) {
      onAddTrackToPlaylist(trackIds[0], targetIndex);
      return;
    }
    onAddTracksToPlaylist(trackIds, targetIndex);
  }

  function getDraggedSourceTrackIds(event: ReactDragEvent<HTMLElement>): string[] {
    const parsedIds = parseSourceTrackDragIds(
      event.dataTransfer.getData(SOURCE_TRACKS_DRAG_TYPE),
      event.dataTransfer.getData(SOURCE_TRACK_DRAG_TYPE),
      event.dataTransfer.getData("text/plain")
    );
    const ids = parsedIds.length > 0 ? parsedIds : sourceDragTrackIdsRef.current;
    return filterSourceDragDropIds(ids, draggableSourceTrackIds);
  }

  function clearDragState(): void {
    sourceDragTrackIdsRef.current = [];
    sourcePointerDragRef.current = null;
    sourceRangeSelectionRef.current = null;
    setDraggingSourceTrackId(null);
    setDraggingPlaylistItemId(null);
    setDropTargetIndex(null);
    setSourceReturnTarget(false);
    setPlaylistDragGhost(null);
    setSourceDragGhost(null);
    setSourceRangeSelectionBox(null);
    playlistRowDragBlockedRef.current = false;
  }

  function blocksPlaylistRowDrag(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest("input, button, select, textarea, label, .builder-rule-panel"));
  }

  function handlePlaylistRowPointerDownCapture(event: ReactPointerEvent<HTMLElement>): void {
    playlistRowDragBlockedRef.current = blocksPlaylistRowDrag(event.target);
  }

  function clearPlaylistRowPointerBlock(): void {
    playlistRowDragBlockedRef.current = false;
  }

  function handlePlaylistRowClick(event: ReactMouseEvent<HTMLElement>, itemId: string, trackId: string): void {
    if (blocksPlaylistRowDrag(event.target)) {
      onSelectTrack(trackId);
      return;
    }
    const clickedIndex = playlistTracks.findIndex(({ item }) => item.id === itemId);
    if (event.shiftKey) {
      const anchorId = playlistSelectionAnchorRef.current;
      const anchorIndex = anchorId ? playlistTracks.findIndex(({ item }) => item.id === anchorId) : -1;
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const [start, end] = anchorIndex <= clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
        setSelectedPlaylistItemIds(new Set(playlistTracks.slice(start, end + 1).map(({ item }) => item.id)));
      } else {
        setSelectedPlaylistItemIds((current) => new Set([...current, itemId]));
        playlistSelectionAnchorRef.current = itemId;
      }
      onSelectTrack(trackId);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      setSelectedPlaylistItemIds((current) => {
        const next = new Set(current);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
      playlistSelectionAnchorRef.current = itemId;
      onSelectTrack(trackId);
      return;
    }
    playlistSelectionAnchorRef.current = itemId;
    setSelectedPlaylistItemIds(new Set([itemId]));
    onSelectTrack(trackId);
  }

  function getTrackContextMenuPosition(event: ReactMouseEvent<HTMLElement>): { x: number; y: number } {
    const width = 218;
    const height = 164;
    return {
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8))
    };
  }

  function handlePlaylistRowDoubleClick(event: ReactMouseEvent<HTMLElement>, itemId: string, trackId: string): void {
    if (blocksPlaylistRowDrag(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    clearDragState();
    playlistSelectionAnchorRef.current = itemId;
    setSelectedPlaylistItemIds(new Set([itemId]));
    onSelectTrack(trackId);
    onPlayTrack(trackId);
  }

  function handlePlaylistRowContextMenu(event: ReactMouseEvent<HTMLElement>, itemId: string, trackId: string): void {
    if (blocksPlaylistRowDrag(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    clearDragState();
    playlistSelectionAnchorRef.current = itemId;
    setSelectedPlaylistItemIds(new Set([itemId]));
    setSelectedSourceTrackIds(new Set());
    onSelectTrack(trackId);
    const position = getTrackContextMenuPosition(event);
    setTrackContextMenu({ kind: "builder", itemId, trackId, ...position });
  }

  function updatePlaylistDragGhostY(clientY: number): void {
    if (clientY <= 0) return;
    setPlaylistDragGhost((current) => (current ? { ...current, top: clientY - playlistDragOffsetYRef.current } : current));
  }

  function hideNativeDragImage(event: ReactDragEvent<HTMLElement>): void {
    const dragImage = document.createElement("canvas");
    dragImage.width = 1;
    dragImage.height = 1;
    event.dataTransfer.setDragImage(dragImage, 0, 0);
  }

  function getSourceSelectionViewportRect(startX: number, startY: number, clientX: number, clientY: number): DOMRect {
    let left = Math.min(startX, clientX);
    let right = Math.max(startX, clientX);
    let top = Math.min(startY, clientY);
    let bottom = Math.max(startY, clientY);
    if (right - left < 8) {
      left -= 4;
      right += 4;
    }
    if (bottom - top < 8) {
      top -= 4;
      bottom += 4;
    }
    return new DOMRect(left, top, right - left, bottom - top);
  }

  function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
  }

  function updateSourceRangeSelection(clientX: number, clientY: number): void {
    const selection = sourceRangeSelectionRef.current;
    const scroll = sourceTrackScrollRef.current;
    if (!selection || !scroll) return;
    const scrollRect = scroll.getBoundingClientRect();
    const viewportRect = getSourceSelectionViewportRect(selection.startX, selection.startY, clientX, clientY);
    const left = Math.max(0, viewportRect.left - scrollRect.left + scroll.scrollLeft);
    const top = Math.max(0, viewportRect.top - scrollRect.top + scroll.scrollTop);
    const right = Math.min(scroll.scrollWidth, viewportRect.right - scrollRect.left + scroll.scrollLeft);
    const bottom = Math.min(scroll.scrollHeight, viewportRect.bottom - scrollRect.top + scroll.scrollTop);
    const rows = Array.from(scroll.querySelectorAll<HTMLElement>(".source-track-row[data-source-track-id]"));
    const selectedIds = rows
      .filter((row) => rectsIntersect(row.getBoundingClientRect(), viewportRect))
      .map((row) => row.dataset.sourceTrackId)
      .filter((id): id is string => Boolean(id))
      .filter((id) => draggableSourceTrackIdSet.has(id));
    selection.selectedIds = selectedIds;
    setSelectedSourceTrackIds(new Set(selectedIds));
    if (selectedIds.length > 0) {
      sourceSelectionAnchorRef.current = selectedIds[selectedIds.length - 1] ?? null;
    }
    setSourceRangeSelectionBox({
      left: Math.max(0, Math.min(left, right)),
      top: Math.max(0, Math.min(top, bottom)),
      width: Math.max(0, Math.abs(right - left)),
      height: Math.max(0, Math.abs(bottom - top))
    });
  }

  function beginSourceRangeSelection(event: ReactPointerEvent<HTMLElement>): void {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest(".source-track-row, button, input, select, textarea, label")
    ) {
      return;
    }
    if (visibleSourceTracks.length === 0) return;
    sourcePointerDragRef.current = null;
    sourceDragTrackIdsRef.current = [];
    setDraggingSourceTrackId(null);
    setDropTargetIndex(null);
    sourceRangeSelectionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      source: "blank",
      selectedIds: []
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    updateSourceRangeSelection(event.clientX, event.clientY);
  }

  function finishSourceRangeSelection(clientX: number, clientY: number): void {
    const selection = sourceRangeSelectionRef.current;
    if (!selection) return;
    updateSourceRangeSelection(clientX, clientY);
    const selectedIds = sourceRangeSelectionRef.current?.selectedIds ?? [];
    sourceRangeSelectionRef.current = null;
    sourcePointerDragRef.current = null;
    sourceSuppressClickRef.current = selection.source === "card";
    setSourceRangeSelectionBox(null);
    if (selectedIds.length > 0) {
      onSelectTrack(selectedIds[selectedIds.length - 1] ?? selectedIds[0]);
    }
  }

  function getSourcePointerDropIndex(clientX: number, clientY: number): number | null {
    const target = document.elementFromPoint(clientX, clientY);
    if (!(target instanceof HTMLElement) || !listBuilderLayoutRef.current?.contains(target)) return null;
    const row = target.closest<HTMLElement>(".builder-song-row[data-builder-index]");
    if (row?.dataset.builderIndex) {
      const index = Number(row.dataset.builderIndex);
      if (Number.isFinite(index)) return Math.max(0, Math.min(index, playlistTracks.length));
    }
    const dropZone = target.closest(".builder-sequence-zone, .source-to-sequence-guide, .list-builder-divider-right");
    return dropZone ? playlistTracks.length : null;
  }

  function beginSourcePointerDrag(event: ReactPointerEvent<HTMLElement>, trackId: string): void {
    if (event.button !== 0) return;
    const trackIds = getSourceDragTrackIds(trackId);
    if (trackIds.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    sourceDragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    sourcePointerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      trackIds,
      rowHeightPx: rect.height,
      rowWidthPx: rect.width,
      active: false,
      selectingRange: false,
      cardMoveLocked: false
    };
  }

  function handleSourcePointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const rangeSelection = sourceRangeSelectionRef.current;
    if (rangeSelection && rangeSelection.pointerId === event.pointerId) {
      event.preventDefault();
      updateSourceRangeSelection(event.clientX, event.clientY);
      return;
    }
    const drag = sourcePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (
      !drag.selectingRange &&
      !drag.cardMoveLocked &&
      shouldLockSourceDragToCardMove({ deltaX, deltaY, rowHeightPx: drag.rowHeightPx, rowWidthPx: drag.rowWidthPx })
    ) {
      drag.cardMoveLocked = true;
    }
    if (
      !drag.cardMoveLocked &&
      !drag.selectingRange &&
      shouldSwitchSourceDragToRangeSelection({ deltaX, deltaY, rowHeightPx: drag.rowHeightPx })
    ) {
      drag.selectingRange = true;
      drag.active = false;
      sourceDragTrackIdsRef.current = [];
      setDraggingPlaylistItemId(null);
      setDraggingSourceTrackId(null);
      setSourceDragGhost(null);
      setDropTargetIndex(null);
      sourceRangeSelectionRef.current = {
        pointerId: drag.pointerId,
        startX: drag.startX,
        startY: drag.startY,
        source: "card",
        selectedIds: []
      };
      event.preventDefault();
      updateSourceRangeSelection(event.clientX, event.clientY);
      return;
    }
    if (drag.selectingRange) {
      event.preventDefault();
      updateSourceRangeSelection(event.clientX, event.clientY);
      return;
    }
    const distance = Math.hypot(deltaX, deltaY);
    if (!drag.active && distance < 6) return;
    if (!drag.active) {
      drag.active = true;
      sourceDragTrackIdsRef.current = drag.trackIds;
      setDraggingPlaylistItemId(null);
      setDraggingSourceTrackId(drag.trackIds[0] ?? null);
      setSourceDragGhost({
        trackIds: drag.trackIds,
        left: event.clientX - sourceDragOffsetRef.current.x,
        top: event.clientY - sourceDragOffsetRef.current.y,
        width: drag.rowWidthPx
      });
    }
    event.preventDefault();
    setSourceDragGhost((current) =>
      current
        ? {
            ...current,
            left: event.clientX - sourceDragOffsetRef.current.x,
            top: event.clientY - sourceDragOffsetRef.current.y
          }
        : current
    );
    setDropTargetIndex(getSourcePointerDropIndex(event.clientX, event.clientY));
  }

  function handleSourcePointerEnd(event: ReactPointerEvent<HTMLElement>): void {
    const rangeSelection = sourceRangeSelectionRef.current;
    if (rangeSelection && rangeSelection.pointerId === event.pointerId) {
      event.preventDefault();
      finishSourceRangeSelection(event.clientX, event.clientY);
      return;
    }
    const drag = sourcePointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.selectingRange) {
      event.preventDefault();
      finishSourceRangeSelection(event.clientX, event.clientY);
      return;
    }
    const targetIndex = drag.active ? getSourcePointerDropIndex(event.clientX, event.clientY) : null;
    if (targetIndex !== null) {
      event.preventDefault();
      requestAddTracks(drag.trackIds, targetIndex);
    }
    clearDragState();
  }

  function handleSourceTrackClick(event: ReactMouseEvent<HTMLElement>, trackId: string): void {
    if (sourceSuppressClickRef.current) {
      sourceSuppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const clickedIndex = visibleSourceTracks.findIndex((track) => track.id === trackId);
    if (event.shiftKey && sourceSelectionAnchorRef.current) {
      const anchorIndex = visibleSourceTracks.findIndex((track) => track.id === sourceSelectionAnchorRef.current);
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const [start, end] = anchorIndex <= clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
        const selectedIds = visibleSourceTracks
          .slice(start, end + 1)
          .filter((track) => draggableSourceTrackIdSet.has(track.id))
          .map((track) => track.id);
        setSelectedSourceTrackIds(new Set(selectedIds));
        onSelectTrack(trackId);
        return;
      }
    }
    if (event.ctrlKey || event.metaKey) {
      if (!draggableSourceTrackIdSet.has(trackId)) {
        onSelectTrack(trackId);
        return;
      }
      setSelectedSourceTrackIds((current) => {
        const next = new Set(current);
        if (next.has(trackId)) {
          next.delete(trackId);
        } else {
          next.add(trackId);
        }
        return next;
      });
      sourceSelectionAnchorRef.current = trackId;
      onSelectTrack(trackId);
      return;
    }
    sourceSelectionAnchorRef.current = trackId;
    setSelectedSourceTrackIds(draggableSourceTrackIdSet.has(trackId) ? new Set([trackId]) : new Set());
    onSelectTrack(trackId);
  }

  function handleSourceTrackDoubleClick(event: ReactMouseEvent<HTMLElement>, trackId: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (!draggableSourceTrackIdSet.has(trackId)) return;
    clearDragState();
    sourceSelectionAnchorRef.current = trackId;
    setSelectedSourceTrackIds(new Set([trackId]));
    onSelectTrack(trackId);
    requestAddTracks([trackId], playlistTracks.length);
  }

  function handleSourceTrackContextMenu(event: ReactMouseEvent<HTMLElement>, trackId: string): void {
    event.preventDefault();
    event.stopPropagation();
    clearDragState();
    sourceSelectionAnchorRef.current = trackId;
    setSelectedSourceTrackIds(draggableSourceTrackIdSet.has(trackId) ? new Set([trackId]) : new Set());
    setSelectedPlaylistItemIds(new Set());
    onSelectTrack(trackId);
    const position = getTrackContextMenuPosition(event);
    setTrackContextMenu({ kind: "source", trackId, ...position });
  }

  function handleSourceTrackKeyDown(event: ReactKeyboardEvent<HTMLElement>, trackId: string): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    sourceSelectionAnchorRef.current = trackId;
    setSelectedSourceTrackIds(draggableSourceTrackIdSet.has(trackId) ? new Set([trackId]) : new Set());
    onSelectTrack(trackId);
  }

  function getSourceDragTrackIds(trackId: string): string[] {
    return selectSourceDragTrackIds(
      trackId,
      selectedSourceTrackIds,
      visibleDraggableSourceTrackIds,
      scanningTrackId
    );
  }

  function handleSequenceZoneDragOver(event: ReactDragEvent<HTMLElement>): void {
    const isSourceDrag = sourceDragTrackIdsRef.current.length > 0 || Boolean(draggingSourceTrackId) || hasSourceTrackDragType(event.dataTransfer.types);
    if (!isSourceDrag && !draggingPlaylistItemId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    updatePlaylistDragGhostY(event.clientY);
    setDropTargetIndex(playlistTracks.length);
  }

  function handleSequenceZoneDragLeave(event: ReactDragEvent<HTMLElement>): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    setDropTargetIndex(null);
  }

  function handleSequenceZoneDrop(event: ReactDragEvent<HTMLElement>): void {
    event.preventDefault();
    const playlistItemId = event.dataTransfer.getData(PLAYLIST_ITEM_DRAG_TYPE);
    if (playlistItemId) {
      onReorderPlaylistItem(playlistItemId, playlistTracks.length);
      clearDragState();
      return;
    }
    const trackIds = getDraggedSourceTrackIds(event);
    if (trackIds.length > 0) requestAddTracks(trackIds, playlistTracks.length);
    clearDragState();
  }

  function handlePlaylistDrop(event: ReactDragEvent<HTMLElement>, targetIndex: number): void {
    event.preventDefault();
    event.stopPropagation();
    const playlistItemId = event.dataTransfer.getData(PLAYLIST_ITEM_DRAG_TYPE);
    if (playlistItemId) {
      const currentIndex = playlistTracks.findIndex((entry) => entry.item.id === playlistItemId);
      onReorderPlaylistItem(playlistItemId, targetIndex);
      if (currentIndex >= 0 && currentIndex !== targetIndex && currentIndex + 1 !== targetIndex) {
        setReorderedPlaylistItemId(playlistItemId);
      }
      clearDragState();
      return;
    }
    const trackIds = getDraggedSourceTrackIds(event);
    if (trackIds.length > 0) {
      requestAddTracks(trackIds, targetIndex);
      clearDragState();
    }
  }

  function handleSourceZoneDragOver(event: ReactDragEvent<HTMLElement>): void {
    if (!draggingPlaylistItemId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setSourceReturnTarget(true);
    setDropTargetIndex(null);
  }

  function handleSourceZoneDragLeave(event: ReactDragEvent<HTMLElement>): void {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    setSourceReturnTarget(false);
  }

  function handleSourceZoneDrop(event: ReactDragEvent<HTMLElement>): void {
    event.preventDefault();
    const playlistItemId = event.dataTransfer.getData(PLAYLIST_ITEM_DRAG_TYPE);
    if (playlistItemId) onRemovePlaylistItemToSource(playlistItemId);
    clearDragState();
  }

  function clearBuilderRuleTooltipTimer(): void {
    if (builderRuleTooltipTimerRef.current === null) return;
    window.clearTimeout(builderRuleTooltipTimerRef.current);
    builderRuleTooltipTimerRef.current = null;
  }

  function getBuilderRuleTooltipTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLElement>(".rule-tooltip-anchor[data-rule-tooltip]");
  }

  function scheduleBuilderRuleTooltip(anchor: HTMLElement, delayMs: number): void {
    const text = anchor.dataset.ruleTooltip;
    if (!text) return;
    clearBuilderRuleTooltipTimer();
    builderRuleTooltipTimerRef.current = window.setTimeout(() => {
      const rect = anchor.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const placement = rect.top < 92 ? "below" : "above";
      setBuilderRuleTooltip({
        text,
        left: clampNumber(centerX, 18, Math.max(18, window.innerWidth - 18), centerX),
        top: placement === "above" ? rect.top - 9 : rect.bottom + 9,
        placement
      });
      builderRuleTooltipTimerRef.current = null;
    }, delayMs);
  }

  function hideBuilderRuleTooltip(): void {
    clearBuilderRuleTooltipTimer();
    setBuilderRuleTooltip(null);
  }

  function handleBuilderRuleTooltipPointerOver(event: ReactPointerEvent<HTMLElement>): void {
    const target = getBuilderRuleTooltipTarget(event.target);
    if (!target || !event.currentTarget.contains(target)) return;
    scheduleBuilderRuleTooltip(target, 620);
  }

  function handleBuilderRuleTooltipPointerOut(event: ReactPointerEvent<HTMLElement>): void {
    const target = getBuilderRuleTooltipTarget(event.target);
    if (!target) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && target.contains(relatedTarget)) return;
    hideBuilderRuleTooltip();
  }

  function handleBuilderRuleTooltipFocus(event: ReactFocusEvent<HTMLElement>): void {
    const target = getBuilderRuleTooltipTarget(event.target);
    if (!target || !event.currentTarget.contains(target)) return;
    scheduleBuilderRuleTooltip(target, 120);
  }

  function handleBuilderRuleTooltipBlur(event: ReactFocusEvent<HTMLElement>): void {
    const target = getBuilderRuleTooltipTarget(event.target);
    const relatedTarget = event.relatedTarget;
    if (target && relatedTarget instanceof Node && target.contains(relatedTarget)) return;
    hideBuilderRuleTooltip();
  }

  function updatePlayTimeDraft(itemId: string, value: string): void {
    setPlayTimeDrafts((current) => ({ ...current, [itemId]: value }));
  }

  function resetPlayTimeDraft(itemId: string): void {
    setPlayTimeDrafts((current) => {
      if (!(itemId in current)) return current;
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  function commitPlayTimeDraft(item: PlaylistItem, track: BgmTrack, rawValue: string): void {
    const rule = item.rule;
    const playTimeSeconds = Number(rawValue);
    if (!canUsePlayTimeSeconds(playTimeSeconds, track, rule)) {
      const minimumSeconds = getMinimumPlayTimeSeconds(track, rule);
      onInvalidPlayTime(minimumSeconds);
      resetPlayTimeDraft(item.id);
      return;
    }
    resetPlayTimeDraft(item.id);
    onPlaylistRuleChangeForItem(
      item,
      track,
      { mode: "duration", durationMs: Math.round(playTimeSeconds * 1000), fadeOutMs: getRuleFadeMs(rule), loopCount: getStoredLoopCount(rule) },
      onPlaylistItemChange
    );
  }

  function loadSavedPlaylistFromCard(id: string): void {
    setSelectedSavedPlaylistId(id);
    setPickedPlaylistId(id);
    onEditSavedPlaylist(id);
  }

  function activateSavedPlaylistFromCard(event: ReactMouseEvent<HTMLElement>, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    setSelectedSavedPlaylistId(id);
    setPickedPlaylistId(id);
    onActivateSavedPlaylist(id);
  }

  function handleSavedPlaylistCardKeyDown(event: ReactKeyboardEvent<HTMLElement>, id: string): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    loadSavedPlaylistFromCard(id);
  }

  function stopSavedPlaylistRatingEvent(event: ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>): void {
    event.stopPropagation();
  }

  function handleSavedPlaylistContextMenu(event: ReactMouseEvent<HTMLElement>, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    clearDragState();
    setSelectedSavedPlaylistId(id);
    setSelectedPlaylistItemIds(new Set());
    setSelectedSourceTrackIds(new Set());
    const position = getTrackContextMenuPosition(event);
    setTrackContextMenu({ kind: "saved-list", playlistId: id, ...position });
  }

  function updateListBuilderLeftSplit(clientX: number): void {
    const rect = listBuilderLayoutRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const nextList = clampPercent(((clientX - rect.left) / rect.width) * 100, 14, 36);
    setListBuilderColumns((current) => ({ ...current, list: Math.min(nextList, 100 - current.source - 24) }));
  }

  function updateListBuilderRightSplit(clientX: number): void {
    const rect = listBuilderLayoutRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const nextSource = clampPercent(100 - ((clientX - rect.left) / rect.width) * 100, 24, 52);
    setListBuilderColumns((current) => ({ ...current, source: Math.min(nextSource, 100 - current.list - 24) }));
  }

  function getBulkInitialValue(kind: "loop-count" | "duration" | "fade"): number {
    const first = bulkPlaylistTargets[0];
    if (!first) {
      if (kind === "loop-count") return defaultPlaylistLoopCount;
      return kind === "duration" ? defaultPlaylistDurationMs / 1000 : 0;
    }
    if (kind === "loop-count") return getStoredLoopCount(first.item.rule);
    if (kind === "duration") return Math.round(getPlaylistDurationInputMs(first.track, first.item.rule) / 1000);
    return Math.round(getPlaylistFadeMs(first.track, first.item.rule) / 1000);
  }

  function getBulkPlayTimeViolation(kind: "loop-count" | "duration" | "fade", safeValue: number): number | null {
    if (kind === "loop-count") return null;
    let violation: number | null = null;
    for (const { item, track } of bulkPlaylistTargets) {
      if (kind === "duration") {
        const nextRule = { mode: "duration", durationMs: safeValue * 1000, fadeOutMs: getRuleFadeMs(item.rule), loopCount: getStoredLoopCount(item.rule) } as PlaylistRule;
        if (!canUsePlayTimeSeconds(safeValue, track, nextRule)) {
          const minimumSeconds = getMinimumPlayTimeSeconds(track, nextRule);
          if (!violation || minimumSeconds > violation) {
            violation = minimumSeconds;
          }
        }
        continue;
      }
      if (item.rule.mode !== "duration") continue;
      const nextRule = { ...item.rule, fadeOutMs: safeValue * 1000 } as PlaylistRule;
      const playTimeSeconds = Math.round(getPlaylistDurationInputMs(track, item.rule) / 1000);
      if (!canUsePlayTimeSeconds(playTimeSeconds, track, nextRule)) {
        const minimumSeconds = getMinimumPlayTimeSeconds(track, nextRule);
        if (!violation || minimumSeconds > violation) {
          violation = minimumSeconds;
        }
      }
    }
    return violation;
  }

  async function requestBulkSequenceChange(kind: "loop-count" | "duration" | "fade"): Promise<void> {
    if (bulkPlaylistTargets.length === 0) return;
    const isJa = project.ui.language === "ja";
    const label =
      kind === "loop-count"
        ? t("loopCountTimes")
        : kind === "duration"
          ? t("playTimeSeconds")
          : t("fadeOutSeconds");
    const rawValue = await onPrompt({
      title: isJa ? `${label}を入力` : `Enter ${label}`,
      message: hasBulkPlaylistSelection
        ? isJa
          ? "選択中のSequencer曲へ適用する数値を入力してください。"
          : "Enter the value to apply to the selected sequencer songs."
        : isJa
          ? "Sequence全体へ適用する数値を入力してください。"
          : "Enter the value to apply to the whole sequence.",
      initialValue: String(getBulkInitialValue(kind)),
      placeholder: kind === "loop-count" ? String(defaultPlaylistLoopCount) : kind === "duration" ? String(defaultPlaylistDurationMs / 1000) : "0",
      confirmLabel: isJa ? "次へ" : "Next"
    });
    if (rawValue === null) return;
    const numericValue = Number(rawValue);
    const minValue = kind === "fade" ? 0 : 1;
    if (!Number.isFinite(numericValue) || numericValue < minValue) return;
    const safeValue = kind === "loop-count" ? Math.round(clampNumber(numericValue, 1, 99, defaultPlaylistLoopCount)) : Math.max(minValue, Math.round(numericValue));
    const playTimeViolation = getBulkPlayTimeViolation(kind, safeValue);
    if (playTimeViolation) {
      onInvalidPlayTime(playTimeViolation);
      return;
    }
    const detail = isJa
      ? `${hasBulkPlaylistSelection ? `選択中の${bulkPlaylistTargets.length}曲` : `全${playlistTracks.length}曲`}の${label}を${safeValue}に変更します。`
      : `Apply ${label} = ${safeValue} to ${hasBulkPlaylistSelection ? `${bulkPlaylistTargets.length} selected` : `all ${playlistTracks.length}`} track${bulkPlaylistTargets.length === 1 ? "" : "s"}.`;
    const confirmed = await onConfirm({
      title: t("bulkApplyConfirmTitle"),
      message: t("bulkApplyConfirmMessage"),
      detail,
      confirmLabel: isJa ? "実行" : "Apply"
    });
    if (!confirmed) return;
    if (kind === "loop-count") {
      onApplyPlaylistLoopCountToAll(safeValue, bulkPlaylistTargetItemIds);
      return;
    }
    if (kind === "duration") {
      onApplyPlaylistDurationToAll(safeValue, bulkPlaylistTargetItemIds);
      return;
    }
    onApplyPlaylistFadeToAll(safeValue * 1000, bulkPlaylistTargetItemIds);
  }

  function getTrackContextMenuItems(state: TrackContextMenuState): Array<{ id: string; label: string; danger?: boolean; disabled?: boolean; onSelect: () => void }> {
    const isJa = project.ui.language === "ja";
    const isProcessing = state.kind === "builder" || state.kind === "source" ? scanningTrackId === state.trackId || scanWaitingTrackIds.has(state.trackId) : false;
    const run = (action: () => void | Promise<void>) => (): void => {
      setTrackContextMenu(null);
      void action();
    };
    if (state.kind === "saved-list") {
      return [
        {
          id: "duplicate-as",
          label: isJa ? "別名をつけて複製" : "Duplicate As",
          onSelect: run(() => onDuplicateSavedPlaylist(state.playlistId))
        },
        {
          id: "delete",
          label: isJa ? "削除" : "Delete",
          danger: true,
          onSelect: run(() => onDeleteSavedPlaylist(state.playlistId))
        }
      ];
    }
    if (state.kind === "builder") {
      return [
        {
          id: "move-source",
          label: isJa ? "BGM Sourceへ戻す" : "Move to BGM Source",
          disabled: isProcessing,
          onSelect: run(() => onRemovePlaylistItemToSource(state.itemId))
        },
        {
          id: "duplicate",
          label: isJa ? "複製" : "Duplicate",
          disabled: isProcessing,
          onSelect: run(() => onDuplicatePlaylistItem(state.itemId))
        },
        {
          id: "loop-scan",
          label: "Loop Scan",
          disabled: Boolean(detectionProgress) || isProcessing,
          onSelect: run(() => onAutoLoopSourceTracks([state.trackId]))
        },
        {
          id: "delete",
          label: isJa ? "削除" : "Delete",
          danger: true,
          disabled: isProcessing,
          onSelect: run(() => onDeletePlaylistItem(state.itemId))
        }
      ];
    }
    return [
      {
        id: "send-builder",
        label: isJa ? "Build Sequencerへ送る" : "Send to Build Sequencer",
        disabled: isProcessing || !draggableSourceTrackIdSet.has(state.trackId),
        onSelect: run(() => requestAddTracks([state.trackId], playlistTracks.length))
      },
      {
        id: "loop-scan",
        label: "Loop Scan",
        disabled: Boolean(detectionProgress) || isProcessing,
        onSelect: run(() => onAutoLoopSourceTracks([state.trackId]))
      },
      {
        id: "delete",
        label: isJa ? "削除" : "Delete",
        danger: true,
        disabled: isProcessing,
        onSelect: run(() => onDeleteSourceTrack(state.trackId))
      }
    ];
  }

  return (
    <div className="view loop-view">
      <div
        className="list-builder-layout"
        ref={listBuilderLayoutRef}
        onPointerMove={handleSourcePointerMove}
        onPointerUp={handleSourcePointerEnd}
        onPointerCancel={handleSourcePointerEnd}
        style={{
          "--list-builder-list": `${listBuilderColumns.list}%`,
          "--list-builder-source": `${listBuilderColumns.source}%`
        } as CSSProperties}
      >
        <section className={`panel saved-list-zone ${savedListDimmed ? "list-not-loaded" : ""} ${completedPlaylistId ? "list-just-completed" : ""}`}>
          <div className="panel-title-row">
            <h2 className="panel-heading-with-icon">
              <span className="panel-title-icon sequence-title-icon" aria-hidden="true">
                <Library size={16} />
              </span>
              {t("list")}
            </h2>
            <div className="saved-list-title-actions">
              <button
                className={`thin-button all-list-repeat-button ${project.allListRepeatEnabled ? "active" : ""}`}
                type="button"
                onClick={() => onAllListRepeatChange(!project.allListRepeatEnabled)}
                aria-pressed={project.allListRepeatEnabled}
                title={t("allListRepeat")}
              >
                <Repeat size={14} />
                <span>{t("allListRepeat")}</span>
              </button>
              <span className="subtle saved-list-count">{project.savedPlaylists.length} {t("savedCount")}</span>
            </div>
          </div>
          <div className="saved-list-scroll">
            {project.savedPlaylists.length > 0 ? (
              project.savedPlaylists.map((playlist) => {
                const totalMs = getPlaylistItemsTotalMs(playlist.items, project.bgmTracks);
                return (
                  <div className="saved-list-entry" key={playlist.id}>
                    <div
                      className={`saved-list-card ${project.activePlaylistId === playlist.id ? "selected" : ""} ${selectedSavedPlaylistId === playlist.id ? "load-target" : ""} ${completedPlaylistId === playlist.id ? "just-completed" : ""} ${pickedPlaylistId === playlist.id ? "picked" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => loadSavedPlaylistFromCard(playlist.id)}
                      onDoubleClick={(event) => activateSavedPlaylistFromCard(event, playlist.id)}
                      onKeyDown={(event) => handleSavedPlaylistCardKeyDown(event, playlist.id)}
                      onContextMenu={(event) => handleSavedPlaylistContextMenu(event, playlist.id)}
                    >
                      <strong>{playlist.name}</strong>
                      <span className="saved-list-song-count">{playlist.items.length} {t("songs")}</span>
                      <div
                        className="saved-list-stars"
                        onPointerDown={stopSavedPlaylistRatingEvent}
                        onClick={stopSavedPlaylistRatingEvent}
                        onDoubleClick={stopSavedPlaylistRatingEvent}
                        onContextMenu={stopSavedPlaylistRatingEvent}
                        onKeyDown={stopSavedPlaylistRatingEvent}
                      >
                        <SequenceStars rating={playlist.rating} onChange={(rating) => onSavedPlaylistRatingChange(playlist.id, rating)} />
                      </div>
                      <span className="saved-list-total-time">{t("total")} {formatTimeSeconds(totalMs)}</span>
                    </div>
                    <button className="thin-button saved-list-file-button" type="button" onClick={() => onExportSavedPlaylist(playlist.id)}>
                      {t("exportSequence")}
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="list-builder-empty">
                <CompleteSequenceIcon />
                <strong>{t("noListBuilt")}</strong>
              </div>
            )}
          </div>
          <div className="saved-list-actions">
            <button className="load-list-button" type="button" onClick={onImportSequenceFile}>
              {t("importSequence")}
            </button>
          </div>
        </section>

        <ResizeDivider
          orientation="vertical"
          className="list-builder-divider list-builder-divider-left"
          label="Resize Sequence List and Build Sequencer panels"
          onDrag={updateListBuilderLeftSplit}
        />

        <section
          className={`panel builder-sequence-zone ${builderSequenceDimmed ? "source-empty-disabled" : ""} ${draggingSourceTrackId ? "accepts-source" : ""} ${draggingPlaylistItemId ? "accepts-reorder" : ""} ${dropTargetIndex === playlistTracks.length ? "end-drop-target" : ""} ${duplicateBlocked ? "duplicate-blocked" : ""} ${pickedPlaylistId ? "list-retrieved" : ""}`}
          onPointerOver={handleBuilderRuleTooltipPointerOver}
          onPointerOut={handleBuilderRuleTooltipPointerOut}
          onFocus={handleBuilderRuleTooltipFocus}
          onBlur={handleBuilderRuleTooltipBlur}
          onDragOver={handleSequenceZoneDragOver}
          onDragLeave={handleSequenceZoneDragLeave}
          onDrop={handleSequenceZoneDrop}
        >
          <div className="panel-title-row">
            <h2 className="panel-heading-with-icon">
              <span className="panel-title-icon sequence-title-icon" aria-hidden="true">
                <ListOrdered size={16} />
              </span>
              {t("buildSequencer")}
            </h2>
            <span className="subtle">{playlistTracks.length} {t("songs")} / {formatTimeSeconds(getPlaylistItemsTotalMs(project.playlist, project.bgmTracks))}</span>
          </div>
          <div className="playlist-manager compact">
            <input
              type="text"
              value={project.playlistName}
              disabled={!project.playlistCreated && project.playlist.length === 0}
              aria-label={t("listName")}
              placeholder={project.ui.language === "ja" ? "シーケンス名を入力してください" : "Enter a sequence name"}
              onChange={(event) => onPlaylistNameChange(event.target.value)}
            />
            <button className="thin-button" type="button" disabled={!project.playlistCreated} onClick={onSavePlaylistAs}>
              {t("saveAs")}
            </button>
            <button className="thin-button" type="button" disabled={!project.playlistCreated || !project.activePlaylistId} onClick={onOverwritePlaylist}>
              {t("overwrite")}
            </button>
          </div>
          <div className="builder-sequence-scroll" ref={builderSequenceScrollRef}>
            {playlistTracks.length > 0 ? playlistTracks.map(({ item, track }, index) => {
              const rule = item.rule;
              const canUseLoopRules = Boolean(track.loop);
              const displayRuleMode: PlaylistRule["mode"] = canUseLoopRules ? rule.mode : "straight";
              const isScanningTrack = scanningTrackId === track.id;
              const isPlaylistItemPlaying = playback.mode === "playlist" && playback.itemId === item.id;
              const ruleControlsDisabled = isPlaylistItemPlaying;
              const isPlaylistRowSelected = selectedPlaylistItemIds.has(item.id) || (selectedPlaylistItemIds.size === 0 && selectedTrack?.id === track.id);
              const playTimeSeconds = Math.round(getPlaylistDurationInputMs(track, rule) / 1000);
              const playTimeInputValue = playTimeDrafts[item.id] ?? String(playTimeSeconds);
              const previousRuleMode = getAdjacentPlaylistRuleMode(displayRuleMode, -1);
              const nextRuleMode = getAdjacentPlaylistRuleMode(displayRuleMode, 1);
              return (
                <article
                  className={`builder-song-row ${isPlaylistRowSelected ? "selected" : ""} ${selectedPlaylistItemIds.has(item.id) ? "multi-selected" : ""} ${draggingPlaylistItemId === item.id ? "dragging" : ""} ${dropTargetIndex === index ? "drop-target" : ""} ${index === playlistTracks.length - 1 && dropTargetIndex === playlistTracks.length ? "append-drop-target" : ""} ${addedPlaylistItemId === item.id ? "recently-added" : ""} ${reorderedPlaylistItemId === item.id ? "reordered-flash" : ""} ${pickedPlaylistId ? "retrieved-row" : ""} ${isScanningTrack ? "auto-loop-processing" : ""} ${ruleControlsDisabled ? "rule-edit-locked" : ""}`}
                  style={{ viewTransitionName: draggingPlaylistItemId ? viewTransitionName("playlist-item", item.id) : "none" } as CSSProperties}
                  key={item.id}
                  data-playlist-item-id={item.id}
                  data-builder-index={index}
                  draggable={!isScanningTrack}
                  onPointerDownCapture={handlePlaylistRowPointerDownCapture}
                  onPointerUpCapture={clearPlaylistRowPointerBlock}
                  onPointerCancelCapture={clearPlaylistRowPointerBlock}
                  onClick={(event) => handlePlaylistRowClick(event, item.id, track.id)}
                  onDoubleClick={(event) => handlePlaylistRowDoubleClick(event, item.id, track.id)}
                  onContextMenu={(event) => handlePlaylistRowContextMenu(event, item.id, track.id)}
                  onDragStart={(event) => {
                    if (isScanningTrack || playlistRowDragBlockedRef.current || blocksPlaylistRowDrag(event.target)) {
                      event.preventDefault();
                      playlistRowDragBlockedRef.current = false;
                      return;
                    }
                    const rect = event.currentTarget.getBoundingClientRect();
                    playlistDragOffsetYRef.current = event.clientY - rect.top;
                    hideNativeDragImage(event);
                    setPlaylistDragGhost({ id: item.id, left: rect.left, top: rect.top, width: rect.width });
                    event.dataTransfer.setData(PLAYLIST_ITEM_DRAG_TYPE, item.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingSourceTrackId(null);
                    setDraggingPlaylistItemId(item.id);
                  }}
                  onDragEnd={clearDragState}
                  onDrag={(event) => updatePlaylistDragGhostY(event.clientY)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = "move";
                    updatePlaylistDragGhostY(event.clientY);
                    setDropTargetIndex(index);
                  }}
                  onDrop={(event) => handlePlaylistDrop(event, index)}
                >
                  <span className="builder-drag-handle" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="builder-song-index">{index + 1}</span>
                  <div className="builder-song-file">
                    <strong>{track.fileName}</strong>
                    <span>{t("performanceTime")} {formatTimeSeconds(getPlaylistPlayMs(track, rule))}</span>
                  </div>
                  <div className="builder-rule-panel">
                    <span className="builder-rule-title rule-tooltip-anchor" data-rule-tooltip={getBuilderRuleTooltip("transition", project.ui.language)}>{t("transitionCondition")}</span>
                    <div className="builder-rule-mode">
                      {canUseLoopRules ? (
                        <div
                          className="rule-mode-stepper rule-tooltip-anchor"
                          role="group"
                          aria-label={t("transitionCondition")}
                          data-rule-tooltip={getBuilderRuleTooltip(getPlaylistRuleModeTooltipKey(displayRuleMode), project.ui.language)}
                        >
                          <button
                            className="rule-mode-arrow"
                            type="button"
                            disabled={ruleControlsDisabled || !previousRuleMode}
                            title={previousRuleMode ? getPlaylistRuleModeLabel(previousRuleMode, t) : ""}
                            aria-label={previousRuleMode ? `${getPlaylistRuleModeLabel(previousRuleMode, t)}へ変更` : ""}
                            onClick={() => {
                              if (ruleControlsDisabled) return;
                              if (!previousRuleMode) return;
                              onPlaylistRuleChangeForItem(item, track, createPlaylistRuleForMode(previousRuleMode, rule, track), onPlaylistItemChange);
                            }}
                          >
                            <ChevronLeft size={13} />
                          </button>
                          <span className={`rule-mode-current mode-${displayRuleMode}`}>
                            {getPlaylistRuleModeLabel(displayRuleMode, t)}
                          </span>
                          <button
                            className="rule-mode-arrow"
                            type="button"
                            disabled={ruleControlsDisabled || !nextRuleMode}
                            title={nextRuleMode ? getPlaylistRuleModeLabel(nextRuleMode, t) : ""}
                            aria-label={nextRuleMode ? `${getPlaylistRuleModeLabel(nextRuleMode, t)}へ変更` : ""}
                            onClick={() => {
                              if (ruleControlsDisabled) return;
                              if (!nextRuleMode) return;
                              onPlaylistRuleChangeForItem(item, track, createPlaylistRuleForMode(nextRuleMode, rule, track), onPlaylistItemChange);
                            }}
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      ) : (
                        <span className="rule-locked">{t("straight")}</span>
                      )}
                    </div>
                  </div>
                  <div className="builder-rule-fields">
                    {displayRuleMode === "loop-count" ? (
                      <label className="builder-field builder-loops-field rule-tooltip-anchor" data-rule-tooltip={getBuilderRuleTooltip("loopCount", project.ui.language)}>
                        {t("loopCountTimes")}
                        <input
                          type="number"
                          min="1"
                          max="99"
                          draggable={false}
                          disabled={!canUseLoopRules || ruleControlsDisabled}
                          value={rule.loopCount}
                          onDragStart={(event) => event.preventDefault()}
                          onChange={(event) => {
                            const loopCount = Number(event.target.value);
                            const nextRule = { mode: "loop-count", loopCount, fadeOutMs: getRuleFadeMs(rule) } as PlaylistRule;
                            onPlaylistRuleChangeForItem(item, track, { ...nextRule, durationMs: getStoredDurationMs(rule) }, onPlaylistItemChange);
                          }}
                        />
                      </label>
                    ) : displayRuleMode === "straight" ? (
                      <div className="builder-field builder-straight-field">
                        <span>{t("straight")}</span>
                        <span className="builder-straight-value">{formatTimeSeconds(track.durationMs)}</span>
                      </div>
                    ) : (
                      <label className="builder-field builder-play-time-field rule-tooltip-anchor" data-rule-tooltip={getBuilderRuleTooltip("playTime", project.ui.language)}>
                        <span>{t("playTimeSeconds")}</span>
                        <input
                          type="number"
                          min="1"
                          draggable={false}
                          disabled={!canUseLoopRules || ruleControlsDisabled}
                          value={playTimeInputValue}
                          onDragStart={(event) => event.preventDefault()}
                          onChange={(event) => updatePlayTimeDraft(item.id, event.target.value)}
                          onBlur={(event) => commitPlayTimeDraft(item, track, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.code === "NumpadEnter") {
                              event.preventDefault();
                              event.stopPropagation();
                              commitPlayTimeDraft(item, track, event.currentTarget.value);
                              event.currentTarget.blur();
                              return;
                            }
                            if (event.key === "Escape") {
                              resetPlayTimeDraft(item.id);
                            }
                          }}
                        />
                      </label>
                    )}
                    <label className="builder-field builder-fade-field rule-tooltip-anchor" data-rule-tooltip={getBuilderRuleTooltip("fade", project.ui.language)}>
                      {t("fadeOutSeconds")}
                      <input
                        type="number"
                        min="0"
                        draggable={false}
                        value={Math.round(getPlaylistFadeMs(track, rule) / 1000)}
                        disabled={!canUseLoopRules || displayRuleMode === "straight" || ruleControlsDisabled}
                        onDragStart={(event) => event.preventDefault()}
                        onChange={(event) => {
                          const nextRule = { ...rule, fadeOutMs: Number(event.target.value) * 1000 } as PlaylistRule;
                          if (
                            displayRuleMode === "duration" &&
                            !canUsePlayTimeSeconds(Math.round(getPlaylistDurationInputMs(track, rule) / 1000), track, nextRule)
                          ) {
                            onInvalidPlayTime(getMinimumPlayTimeSeconds(track, nextRule));
                            return;
                          }
                          onPlaylistRuleChangeForItem(item, track, nextRule, onPlaylistItemChange);
                        }}
                      />
                    </label>
                  </div>
                  {ruleControlsDisabled ? (
                    <div
                      className="builder-now-playing-card"
                      role="status"
                      aria-label={
                        project.ui.language === "ja"
                          ? "Now Playing。再生中の曲は遷移条件を変更できません。"
                          : "Now Playing. Rule controls are disabled for the currently playing song."
                      }
                    >
                      <span>Now Playing</span>
                    </div>
                  ) : null}
                </article>
              );
            }) : (
              <div className={`list-builder-empty large ${draggingSourceTrackId ? "drop-ready" : ""}`}>
                <span className="source-drop-icon sequence-empty-icon" aria-hidden="true">
                  <DropFlowIcon kind="file" />
                </span>
                <strong>{t("noSequenceSongs")}</strong>
              </div>
            )}
          </div>
          {playlistDragGhost && draggingPlaylistItemId ? (() => {
            const ghost = playlistTracks.find(({ item }) => item.id === playlistDragGhost.id);
            if (!ghost) return null;
            return (
              <div className="builder-song-drag-ghost" style={{ left: playlistDragGhost.left, top: playlistDragGhost.top, width: playlistDragGhost.width } as CSSProperties}>
                <span className="builder-drag-handle" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="builder-song-index">{playlistTracks.findIndex(({ item }) => item.id === playlistDragGhost.id) + 1}</span>
                <div className="builder-song-file">
                  <strong>{ghost.track.fileName}</strong>
                  <span>{formatLoopConfidence(ghost.track, project.ui.language)}</span>
                </div>
              </div>
            );
          })() : null}
          <div
            className="builder-bulk-action-row"
            role="group"
            tabIndex={0}
            aria-label={project.ui.language === "ja" ? "Sequencer一括変更" : "Sequencer bulk edit"}
          >
            <div className="builder-bulk-action-summary">
              <strong>{project.ui.language === "ja" ? (hasBulkPlaylistSelection ? "一括変更" : "全曲変更") : (hasBulkPlaylistSelection ? "Bulk Edit" : "Edit All Tracks")}</strong>
              <span>
                {project.ui.language === "ja"
                  ? hasBulkPlaylistSelection
                    ? `対象: 選択中 ${bulkPlaylistTargets.length}曲`
                    : `対象: 全${playlistTracks.length}曲`
                  : hasBulkPlaylistSelection
                    ? `Target: ${bulkPlaylistTargets.length} selected songs`
                    : `Target: all ${playlistTracks.length} songs`}
              </span>
              <ChevronDown className="builder-bulk-action-handle" size={15} aria-hidden="true" />
            </div>
            <div className="builder-bulk-action-buttons">
              <button className="thin-button" type="button" disabled={bulkPlaylistTargets.length === 0} onClick={() => void requestBulkSequenceChange("loop-count")}>
                {project.ui.language === "ja" ? "Loop数" : "Loop Count"}
              </button>
              <button className="thin-button" type="button" disabled={bulkPlaylistTargets.length === 0} onClick={() => void requestBulkSequenceChange("duration")}>
                {project.ui.language === "ja" ? "Play時間" : "Play Time"}
              </button>
              <button className="thin-button" type="button" disabled={bulkPlaylistTargets.length === 0} onClick={() => void requestBulkSequenceChange("fade")}>
                {project.ui.language === "ja" ? "フェードアウト" : "Fade Out"}
              </button>
            </div>
          </div>
          <div className="builder-complete-row">
            <div className="builder-complete-actions">
              <button className={`primary-button complete-list-button ${completeSequenceShouldGlow ? "attention" : ""}`} type="button" disabled={project.playlist.length === 0} onClick={onBuildList}>
                <CompleteSequenceIcon />
                <span className="complete-list-button-label">{t("completeSequence")}</span>
              </button>
              <button className="thin-button danger clear-sequence-button" type="button" disabled={project.playlist.length === 0} onClick={onClearSequence}>
                {t("clearSequence")}
              </button>
            </div>
          </div>
        </section>

        <ResizeDivider
          orientation="vertical"
          className="list-builder-divider list-builder-divider-right"
          label="Resize Build Sequencer and BGM Source panels"
          onDrag={updateListBuilderRightSplit}
        />

        {sourceTracks.length > 0 ? (
          <button
            className={`source-to-sequence-guide ${hasSelectedSourceForAdd ? "active" : "idle"}`}
            type="button"
            aria-disabled={hasSelectedSourceForAdd ? undefined : "true"}
            tabIndex={hasSelectedSourceForAdd ? 0 : -1}
            aria-label={project.ui.language === "ja" ? "選択中のBGM SourceをBuild Sequencerへ追加" : "Add selected BGM Source to Build Sequencer"}
            title={project.ui.language === "ja" ? "選択中のBGM SourceをBuild Sequencerへ追加" : "Add selected BGM Source to Build Sequencer"}
            onDragOver={handleSequenceZoneDragOver}
            onDragLeave={handleSequenceZoneDragLeave}
            onDrop={handleSequenceZoneDrop}
            onClick={() => {
              const trackIds = hasSelectedSourceForAdd ? sourceTracksForAdd.map((track) => track.id) : [];
              if (trackIds.length > 0) requestAddTracks(trackIds, playlistTracks.length);
            }}
          >
            <span className="source-guide-chevrons">
              <span className="source-guide-chevron-left">◁</span>
              <span className="source-guide-chevron-middle">◁</span>
              <span className="source-guide-chevron-right">◁</span>
            </span>
          </button>
        ) : null}

        <section
          className={`panel bgm-source-zone ${draggingPlaylistItemId ? "accepts-return" : ""} ${sourceReturnTarget ? "return-target" : ""}`}
          onDragOver={handleSourceZoneDragOver}
          onDragLeave={handleSourceZoneDragLeave}
          onDrop={handleSourceZoneDrop}
        >
          <div className="panel-title-row">
            <h2 className="panel-heading-with-icon">
              <span className="panel-title-icon source-title-icon" aria-hidden="true">
                <FileMusic size={16} />
              </span>
              {t("bgmSource")}
            </h2>
            <span className="subtle">{sourceTracks.length} {t("files")}</span>
          </div>
          <div
            className={`source-track-scroll ${sourceRangeSelectionBox ? "range-selecting" : ""}`}
            ref={sourceTrackScrollRef}
            onPointerDown={beginSourceRangeSelection}
          >
            {sourceRangeSelectionBox ? (
              <div
                className="source-range-selection-box"
                style={{
                  left: sourceRangeSelectionBox.left,
                  top: sourceRangeSelectionBox.top,
                  width: sourceRangeSelectionBox.width,
                  height: sourceRangeSelectionBox.height
                } as CSSProperties}
              />
            ) : null}
            {sourceTracks.length > 0 && visibleSourceTracks.length > 0 ? visibleSourceTracks.map((track) => {
              const isScanningTrack = scanningTrackId === track.id;
              const isWaitingTrack = scanWaitingTrackIds.has(track.id);
              const canDragSourceTrack = !isScanningTrack && !isWaitingTrack;
              const isSourceSelected = selectedSourceTrackIds.has(track.id) && canDragSourceTrack;
              const isDraggingSource = draggingSourceTrackId === track.id || (Boolean(draggingSourceTrackId) && isSourceSelected);
              return (
                <div
                  className={`source-track-row ${selectedTrack?.id === track.id ? "selected" : ""} ${isSourceSelected ? "multi-selected" : ""} ${isDraggingSource ? "dragging-source" : ""} ${isScanningTrack ? "auto-loop-processing" : ""} ${isWaitingTrack ? "scan-waiting" : ""}`}
                  role="button"
                  tabIndex={0}
                  key={track.id}
                  data-source-track-id={track.id}
                  draggable={false}
                  onPointerDown={(event) => beginSourcePointerDrag(event, track.id)}
                  onClick={(event) => handleSourceTrackClick(event, track.id)}
                  onDoubleClick={(event) => handleSourceTrackDoubleClick(event, track.id)}
                  onContextMenu={(event) => handleSourceTrackContextMenu(event, track.id)}
                  onKeyDown={(event) => handleSourceTrackKeyDown(event, track.id)}
                  onDragStart={(event) => {
                    if (!canDragSourceTrack) {
                      event.preventDefault();
                      return;
                    }
                    const dragTrackIds = getSourceDragTrackIds(track.id);
                    if (dragTrackIds.length === 0) {
                      event.preventDefault();
                      return;
                    }
                    sourceDragTrackIdsRef.current = dragTrackIds;
                    event.dataTransfer.setData(SOURCE_TRACKS_DRAG_TYPE, JSON.stringify(dragTrackIds));
                    event.dataTransfer.setData(SOURCE_TRACK_DRAG_TYPE, dragTrackIds[0]);
                    event.dataTransfer.setData("text/plain", dragTrackIds[0]);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingPlaylistItemId(null);
                    setDraggingSourceTrackId(dragTrackIds[0]);
                    if (!selectedSourceTrackIds.has(track.id)) {
                      sourceSelectionAnchorRef.current = track.id;
                      setSelectedSourceTrackIds(new Set([track.id]));
                      onSelectTrack(track.id);
                    }
                  }}
                  onDragEnd={clearDragState}
                >
                  <strong>{track.fileName}</strong>
                  <span>{track.filePath}</span>
                  {isScanningTrack ? <span className="source-scan-badge">{t("nowScanning")}</span> : null}
                  {isWaitingTrack ? <span className="source-scan-badge waiting">{t("scanWaiting")}</span> : null}
                  {!isScanningTrack && !isWaitingTrack ? (
                    <span className={`source-scan-badge loop-status ${track.loop ? "looped" : "non-looped"}`}>
                      {track.loop ? t("looped") : t("nonLooped")}
                    </span>
                  ) : null}
                </div>
              );
            }) : sourceTracks.length > 0 ? (
              <div className="list-builder-empty source-search-empty">
                <Search size={22} aria-hidden="true" />
                <strong>{t("noSourceSearchResults")}</strong>
              </div>
            ) : (
              <button className="list-builder-empty source-drop-empty source-drop-import-button" type="button" onClick={onImportBgm}>
                <span className="source-drop-icon bgm-file-drop-icon-shell" aria-hidden="true">
                  <BgmFileDropIcon />
                </span>
                <strong>{t("dropSongsHere")}</strong>
              </button>
            )}
          </div>
          {sourceDragGhost && draggingSourceTrackId ? (() => {
            const ghostTrack = sourceTracks.find((track) => track.id === sourceDragGhost.trackIds[0]);
            if (!ghostTrack) return null;
            return (
              <div className="source-track-drag-ghost" style={{ left: sourceDragGhost.left, top: sourceDragGhost.top, width: sourceDragGhost.width } as CSSProperties}>
                <FileMusic size={18} aria-hidden="true" />
                <div>
                  <strong>{ghostTrack.fileName}</strong>
                  <span>
                    {sourceDragGhost.trackIds.length > 1
                      ? project.ui.language === "ja"
                        ? `${sourceDragGhost.trackIds.length} 曲を移動`
                        : `${sourceDragGhost.trackIds.length} songs selected`
                      : ghostTrack.filePath}
                  </span>
                </div>
              </div>
            );
          })() : null}
          <div className="source-zone-actions">
            {sourceTracks.length > 0 ? (
              <label className="source-search-control">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  value={sourceSearchQuery}
                  placeholder={t("sourceSearchPlaceholder")}
                  aria-label={t("sourceSearchPlaceholder")}
                  onChange={(event) => setSourceSearchQuery(event.target.value)}
                />
              </label>
            ) : null}
            <button className="thin-button source-import-button" type="button" onClick={onImportBgm}>
              {t("importBgm")}
            </button>
            <button
              className="thin-button source-auto-loop-button"
              type="button"
              disabled={!canAutoLoopSelectedSource}
              onClick={() => onAutoLoopSourceTracks(selectedSourceTracks.map((track) => track.id))}
            >
              {t("autoLoop")}
            </button>
            <button
              className="thin-button danger"
              type="button"
              disabled={visibleSourceTracks.length === 0}
              onClick={() => onClearBgmSource(visibleSourceTrackIds)}
            >
              {t("sourceClear")}
            </button>
          </div>
        </section>
        <section className={`panel list-builder-waveform ${sequenceMonitorDimmed ? "source-empty-disabled" : ""}`}>
          {detectionProgress ? <DetectionProgressView progress={detectionProgress} language={project.ui.language} onCancel={onCancelDetection} /> : null}
          <WaveformView
            track={selectedTrack}
            currentMs={positionMs}
            positionStore={positionStore}
            editable
            compact
            language={project.ui.language}
            onLoopChange={onLoopChange}
            onLoopDragStart={onLoopDragStart}
            onLoopDragEnd={onLoopDragEnd}
            onSeek={onBgmSeek}
            showPlayhead={isSelectedBgmPlaying}
            busLabel="BGM"
            panelTitle="BGM Monitor"
            showLoopUnitToggle
            footerActions={
              <>
                <button className="thin-button monitor-transport-button" type="button" disabled={!selectedTrack} onClick={() => onPlayTrack()}>
                  <Play size={14} />
                  {project.ui.language === "ja" ? "再生" : "Play"}
                </button>
                <button className="thin-button monitor-transport-button" type="button" disabled={!selectedTrack} onClick={onStop}>
                  <Square size={13} />
                  {project.ui.language === "ja" ? "停止" : "Stop"}
                </button>
                <button className="thin-button monitor-transport-button" type="button" disabled={!selectedTrack?.loop} onClick={onPlayBeforeLoop}>
                  <Undo2 size={14} />
                  {project.ui.language === "ja" ? "ループ確認" : "Loop Check"}
                </button>
              </>
            }
            hideEmptyLabel
            isScanning={Boolean(detectionProgress && selectedTrack?.id === detectionProgress.currentTrackId)}
            isDeepScanning={Boolean(detectionProgress && selectedTrack?.id === detectionProgress.currentTrackId && detectionSettings.mode === "deep")}
          />
          {false ? (
          <div className="list-builder-monitor-transport">
            <button className="thin-button monitor-transport-button" type="button" disabled={!selectedTrack} onClick={() => onPlayTrack()}>
              <Play size={14} />
              {project.ui.language === "ja" ? "再生" : "Play"}
            </button>
            <button className="thin-button monitor-transport-button" type="button" disabled={!selectedTrack} onClick={onStop}>
              <Square size={13} />
              {project.ui.language === "ja" ? "停止" : "Stop"}
            </button>
            <button className="thin-button monitor-transport-button" type="button" disabled={!selectedTrack?.loop} onClick={onPlayBeforeLoop}>
              <Undo2 size={14} />
              {project.ui.language === "ja" ? "ループ確認" : "Loop Check"}
            </button>
          </div>
          ) : null}
        </section>
      </div>
      {trackContextMenu ? (
        <div
          className="track-context-menu"
          style={{ left: trackContextMenu.x, top: trackContextMenu.y } as CSSProperties}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {getTrackContextMenuItems(trackContextMenu).map((item) => (
            <button
              className={`track-context-menu-item ${item.danger ? "danger" : ""}`}
              type="button"
              role="menuitem"
              key={item.id}
              disabled={item.disabled}
              onClick={item.onSelect}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {builderRuleTooltip ? (
        <div
          className={`builder-rule-tooltip-floating placement-${builderRuleTooltip.placement}`}
          style={{ left: builderRuleTooltip.left, top: builderRuleTooltip.top } as CSSProperties}
          role="tooltip"
        >
          {builderRuleTooltip.text}
        </div>
      ) : null}
    </div>
  );
}

function PlaylistRuleEditor({
  item,
  track,
  playlistCreated,
  t,
  onRuleChange,
  onItemChange,
  onApplyPlaylistRuleToAll,
  onApplyPlaylistFadeToAll,
  onCopyPlaylistRules,
  onPastePlaylistRules,
  onMovePlaylistItem
}: {
  item: PlaylistItem | null;
  track: BgmTrack | null;
  playlistCreated: boolean;
  t: Translator;
  onRuleChange: (rule: PlaylistRule) => void;
  onItemChange: (id: string, patch: Partial<PlaylistItem>) => void;
  onApplyPlaylistRuleToAll: (rule: PlaylistRule) => void;
  onApplyPlaylistFadeToAll: (fadeOutMs: number) => void;
  onCopyPlaylistRules: () => void;
  onPastePlaylistRules: () => void;
  onMovePlaylistItem: (id: string, direction: -1 | 1) => void;
}): ReactElement {
  if (!playlistCreated) {
    return (
      <section className="panel rule-editor">
        <span className="subtle">Build Play List to edit playlist behavior.</span>
      </section>
    );
  }
  if (!item || !track) {
    return (
      <section className="panel rule-editor">
        <span className="subtle">Select a BGM track to edit playlist behavior.</span>
      </section>
    );
  }
  const rule = item.rule;
  const canUseLoopRules = Boolean(track.loop);
  return (
    <section className="panel rule-editor">
      <div className="panel-title-row">
        <h2>Playlist Rule</h2>
        <label className="toggle-row">
          <input type="checkbox" checked={item.enabled} onChange={(event) => onItemChange(item.id, { enabled: event.target.checked })} />
          {t("enabled")}
        </label>
      </div>
      {canUseLoopRules ? (
        <div className="rule-grid">
          <label className="segmented">
            <button
              className={rule.mode === "loop-count" ? "active" : ""}
              type="button"
              onClick={() => onRuleChange({ mode: "loop-count", loopCount: getStoredLoopCount(rule), fadeOutMs: getRuleFadeMs(rule), durationMs: getPlaylistDurationInputMs(track, rule) })}
            >
              Loop Count
            </button>
            <button
              className={rule.mode === "duration" ? "active" : ""}
              type="button"
              onClick={() => {
                const fadeOutMs = getRuleFadeMs(rule);
                const maxDurationMs = track.loop ? 60 * 60 * 1000 : track.durationMs;
                onRuleChange({ mode: "duration", durationMs: Math.max(fadeOutMs, Math.min(maxDurationMs, getPlaylistDurationInputMs(track, rule))), fadeOutMs, loopCount: getStoredLoopCount(rule) });
              }}
            >
              Duration
            </button>
            <button
              className={rule.mode === "straight" ? "active" : ""}
              type="button"
              onClick={() => onRuleChange({ mode: "straight", fadeOutMs: getRuleFadeMs(rule), durationMs: getPlaylistDurationInputMs(track, rule), loopCount: getStoredLoopCount(rule) })}
            >
              Straight
            </button>
          </label>
          {rule.mode === "loop-count" ? (
            <label>
              Loops
              <input
                type="number"
                min="1"
                max="99"
                value={rule.loopCount}
                onChange={(event) => {
                  const nextRule = { ...rule, loopCount: Number(event.target.value) };
                  onRuleChange({ ...nextRule, durationMs: getStoredDurationMs(rule) });
                }}
              />
            </label>
          ) : rule.mode === "straight" ? (
            <label>
              Straight
              <span className="rule-locked">Full track</span>
            </label>
          ) : (
            <label>
              Seconds
              <input
                type="number"
                min={Math.max(1, Math.ceil(getRuleFadeMs(rule) / 1000))}
                value={Math.round(rule.durationMs / 1000)}
                onChange={(event) => onRuleChange({ ...rule, durationMs: Number(event.target.value) * 1000 })}
              />
            </label>
          )}
          <label>
            Fade
            <input
              type="number"
              min="0"
              value={Math.round(getPlaylistFadeMs(track, rule) / 1000)}
              disabled={rule.mode === "straight"}
              onChange={(event) => onRuleChange({ ...rule, fadeOutMs: Number(event.target.value) * 1000 } as PlaylistRule)}
            />
          </label>
          <div className="rule-preview">{formatRule(rule)} {"->"} next</div>
        </div>
      ) : (
        <div className="rule-grid straight-rule">
          <div className="rule-locked">Straight Play</div>
          <div className="rule-preview">Full track {"->"} next</div>
        </div>
      )}
      <div className="playlist-helper-row">
        {canUseLoopRules ? (
          <>
            <button className="thin-button" type="button" onClick={() => onApplyPlaylistRuleToAll(rule)}>
              {t("applyRuleAll")}
            </button>
            <button className="thin-button" type="button" onClick={() => onApplyPlaylistFadeToAll(getRuleFadeMs(rule))}>
              {t("applyFadeAll")}
            </button>
          </>
        ) : null}
        <button className="thin-button" type="button" onClick={onCopyPlaylistRules}>
          {t("copyRules")}
        </button>
        <button className="thin-button" type="button" onClick={onPastePlaylistRules}>
          {t("pasteRules")}
        </button>
        <button className="thin-button" type="button" onClick={() => onMovePlaylistItem(item.id, -1)}>
          {t("moveUp")}
        </button>
        <button className="thin-button" type="button" onClick={() => onMovePlaylistItem(item.id, 1)}>
          {t("moveDown")}
        </button>
        <span className="playlist-confidence">{t("confidence")}: {formatLoopConfidence(track)}</span>
      </div>
    </section>
  );
}

interface ConfigViewProps {
  project: GamingProject;
  detectionSettings: DetectionSettings;
  activeKeys: Set<SeKey>;
  voiceCount: number;
  sePreloadMap: SePreloadMap;
  seReadySummary: SeReadySummary;
  gamingnessProgress: GamingnessProgress;
  language: UiLanguage;
  initialSection: ConfigSectionId;
  t: Translator;
  projectStorePath: string | null;
  dataFolderInfo: DataFolderInfo;
  onDetectionSettingsChange: (settings: DetectionSettings) => void;
  onMixChange: (patch: Partial<GamingProject["mix"]>) => void;
  onBrightnessChange: (value: number) => void;
  onPotatoModeChange: (enabled: boolean) => void;
  onAnalyzerChange: (patch: Partial<GamingProject["visual"]>) => void;
  onUiSettingsChange: (patch: Partial<UiSettings>) => void;
  onOpenHelp: (mode: HelpModalMode) => void;
  onSelectSaveLocation: () => void;
  onSelectDataFolder: (kind: DataFolderKind) => void;
  onOpenSaveFolder: () => void;
  onOpenDataFolder: (kind: DataFolderKind) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onAssignSe: (key: SeKey) => void;
  onTriggerSe: (key: SeKey) => void;
  onUnloadSe: (key: SeKey) => void;
  onSeSettingsChange: (key: SeKey, patch: Partial<Pick<SeAssignment, "volume" | "pan">>) => void;
  onBulkSeSettingsChange: (updates: Array<{ key: SeKey; patch: Partial<Pick<SeAssignment, "volume" | "pan">> }>) => void;
  onResetSeSettings: (mode: SeConfigMode) => void;
  onClearSeAssignments: () => void;
  onSaveSeSet: () => void;
  onLoadSeSet: () => void;
  onConfirm: (dialog: ConfirmDialogState) => Promise<boolean>;
  onPrompt: (dialog: PromptDialogState) => Promise<string | null>;
}

function ExpLvModeIcon(): ReactElement {
  return (
    <svg className="exp-lv-pixel-icon" viewBox="0 0 24 24" shapeRendering="crispEdges" focusable="false">
      <rect className="exp-lv-frame" x="4" y="5" width="16" height="2" />
      <rect className="exp-lv-frame" x="4" y="7" width="2" height="12" />
      <rect className="exp-lv-frame" x="18" y="7" width="2" height="12" />
      <rect className="exp-lv-frame" x="4" y="19" width="16" height="2" />
      <rect className="exp-lv-bar low" x="7" y="15" width="2" height="4" />
      <rect className="exp-lv-bar mid" x="11" y="11" width="2" height="8" />
      <rect className="exp-lv-bar high" x="15" y="8" width="2" height="11" />
      <rect className="exp-lv-spark" x="17" y="3" width="2" height="2" />
      <rect className="exp-lv-spark" x="20" y="6" width="2" height="2" />
      <rect className="exp-lv-glow" x="6" y="8" width="2" height="2" />
    </svg>
  );
}

function FileStorageSettingsPanel({
  projectStorePath,
  dataFolderInfo,
  t,
  onSelectSaveLocation,
  onSelectDataFolder,
  onOpenSaveFolder,
  onOpenDataFolder,
  onExportBackup,
  onImportBackup
}: {
  projectStorePath: string | null;
  dataFolderInfo: DataFolderInfo;
  t: Translator;
  onSelectSaveLocation: () => void;
  onSelectDataFolder: (kind: DataFolderKind) => void;
  onOpenSaveFolder: () => void;
  onOpenDataFolder: (kind: DataFolderKind) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
}): ReactElement {
  const savePath = projectStorePath ?? t("pathNotSelected");
  const sequencePath = dataFolderInfo.sequencePath ?? t("pathNotSelected");
  const seSetPath = dataFolderInfo.seSetPath ?? t("pathNotSelected");
  return (
    <div className="config-subsection file-storage-section">
      <div className="file-backup-strip">
        <div>
          <div className="file-storage-heading">
            <span className="file-storage-heading-icon" aria-hidden="true">
              <Settings size={17} />
            </span>
            <h3>{t("backupTools")}</h3>
          </div>
          <p>{t("backupToolsDescription")}</p>
        </div>
        <div className="file-action-row">
          <button className="thin-button" type="button" onClick={onExportBackup}>
            <Download size={16} />
            {t("exportBackup")}
          </button>
          <button className="thin-button" type="button" onClick={onImportBackup}>
            <Upload size={16} />
            {t("importBackup")}
          </button>
        </div>
      </div>
      <div className="file-storage-card primary-storage-card">
        <div className="file-storage-card-head">
          <div>
            <div className="file-storage-heading">
              <span className="file-storage-heading-icon" aria-hidden="true">
                <Library size={17} />
              </span>
              <h3>{t("saveDataTitle")}</h3>
            </div>
            <p>{t("saveDataDescription")}</p>
          </div>
          <div className="file-action-row file-card-actions">
            <button className="thin-button" type="button" onClick={onSelectSaveLocation}>
              <FolderOpen size={16} />
              {projectStorePath ? t("changeSaveLocation") : t("selectSaveLocation")}
            </button>
            <button className="thin-button" type="button" onClick={onOpenSaveFolder} disabled={!projectStorePath}>
              <FolderOpen size={16} />
              {t("openSaveFolder")}
            </button>
          </div>
        </div>
        <code className={`storage-path ${projectStorePath ? "" : "empty"}`} title={projectStorePath ?? ""}>{savePath}</code>
        <div className="file-storage-notes">
          <span>{t("saveDataStores")}</span>
          <span>{t("saveDataDoesNotStore")}</span>
        </div>
      </div>
      <div className="file-storage-card">
        <div className="file-storage-card-head">
          <div>
            <div className="file-storage-heading">
              <span className="file-storage-heading-icon" aria-hidden="true">
                <ListMusic size={17} />
              </span>
              <h3>{t("sequenceSaveLocationTitle")}</h3>
            </div>
            <p>{t("sequenceSaveLocationDescription")}</p>
          </div>
          <div className="file-action-row file-card-actions">
            <button className="thin-button" type="button" onClick={() => onSelectDataFolder("sequence")}>
              <FolderOpen size={16} />
              {dataFolderInfo.sequencePath ? t("changeSaveLocation") : t("selectSaveLocation")}
            </button>
            <button className="thin-button" type="button" onClick={() => onOpenDataFolder("sequence")} disabled={!dataFolderInfo.sequencePath}>
              <FolderOpen size={16} />
              {t("openSaveFolder")}
            </button>
          </div>
        </div>
        <code className={`storage-path ${dataFolderInfo.sequencePath ? "" : "empty"}`} title={dataFolderInfo.sequencePath ?? ""}>{sequencePath}</code>
        <div className="file-storage-notes">
          <span>{t("sequenceSaveLocationStores")}</span>
          <span>{t("saveDataDoesNotStore")}</span>
        </div>
      </div>
      <div className="file-storage-card">
        <div className="file-storage-card-head">
          <div>
            <div className="file-storage-heading">
              <span className="file-storage-heading-icon" aria-hidden="true">
                <Music2 size={17} />
              </span>
              <h3>{t("seSetSaveLocationTitle")}</h3>
            </div>
            <p>{t("seSetSaveLocationDescription")}</p>
          </div>
          <div className="file-action-row file-card-actions">
            <button className="thin-button" type="button" onClick={() => onSelectDataFolder("se-set")}>
              <FolderOpen size={16} />
              {dataFolderInfo.seSetPath ? t("changeSaveLocation") : t("selectSaveLocation")}
            </button>
            <button className="thin-button" type="button" onClick={() => onOpenDataFolder("se-set")} disabled={!dataFolderInfo.seSetPath}>
              <FolderOpen size={16} />
              {t("openSaveFolder")}
            </button>
          </div>
        </div>
        <code className={`storage-path ${dataFolderInfo.seSetPath ? "" : "empty"}`} title={dataFolderInfo.seSetPath ?? ""}>{seSetPath}</code>
        <div className="file-storage-notes">
          <span>{t("seSetSaveLocationStores")}</span>
          <span>{t("saveDataDoesNotStore")}</span>
        </div>
      </div>
    </div>
  );
}

function ConfigView({
  project,
  detectionSettings,
  activeKeys,
  voiceCount,
  sePreloadMap,
  seReadySummary,
  gamingnessProgress,
  language,
  initialSection,
  t,
  projectStorePath,
  dataFolderInfo,
  onDetectionSettingsChange,
  onMixChange,
  onBrightnessChange,
  onPotatoModeChange,
  onAnalyzerChange,
  onUiSettingsChange,
  onOpenHelp,
  onSelectSaveLocation,
  onSelectDataFolder,
  onOpenSaveFolder,
  onOpenDataFolder,
  onExportBackup,
  onImportBackup,
  onAssignSe,
  onTriggerSe,
  onUnloadSe,
  onSeSettingsChange,
  onBulkSeSettingsChange,
  onResetSeSettings,
  onClearSeAssignments,
  onSaveSeSet,
  onLoadSeSet,
  onConfirm,
  onPrompt
}: ConfigViewProps): ReactElement {
  const [activeSection, setActiveSection] = useState<ConfigSectionId>(initialSection);
  const sectionItems: Array<{ id: ConfigSectionId; label: string }> = [
    { id: "mix", label: t("mix") },
    { id: "auto-loop", label: t("autoLoop") },
    { id: "look-meter", label: t("lookMeter") },
    { id: "se-pad-control", label: t("sePadAssign") },
    { id: "files-save", label: t("filesSave") }
  ];
  const activeSectionLabel = sectionItems.find((item) => item.id === activeSection)?.label ?? sectionItems[0]!.label;

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  async function requestBigFontModeChange(enabled: boolean): Promise<void> {
    if (enabled === project.ui.bigFontMode) return;
    const confirmed = await onConfirm({
      title: t("bigFontMode"),
      message:
        project.ui.language === "ja"
          ? `BIG FONT Modeを${enabled ? "ON" : "OFF"}にしますか？`
          : `Turn ${enabled ? "ON" : "OFF"} Big Font Mode?`,
      detail:
        project.ui.language === "ja"
          ? "レイアウトが大きく変わる場合があります。"
          : "The layout may change significantly.",
      confirmLabel: "OK"
    });
    if (!confirmed) return;
    onUiSettingsChange({ bigFontMode: enabled });
  }

  return (
    <div className="view config-view">
      <aside className="panel config-category-panel" aria-label="Config categories">
        <h2>{t("config")}</h2>
        <div className="config-category-list">
          {sectionItems.map((item) => (
            <button className={`config-category-button ${activeSection === item.id ? "active" : ""}`} type="button" key={item.id} onClick={() => setActiveSection(item.id)}>
              {item.label}
            </button>
          ))}
          <button className="config-category-button" type="button" onClick={() => onOpenHelp("shortcuts")}>
            Shortcut List
          </button>
        </div>
      </aside>
      <div className="config-detail-slot" aria-label={`${activeSectionLabel} settings`}>
        {activeSection === "mix" ? (
          <section className="panel config-panel config-detail-panel">
            <div className="panel-title-row">
              <h2>{t("mix")}</h2>
              <span className="subtle">Master / BGM / SE</span>
            </div>
            <div className="config-subsection">
              <Slider label="Master" value={project.mix.masterGain} min={0} max={1} step={0.01} suffix="%" onChange={(value) => onMixChange({ masterGain: value })} />
              <Slider label="BGM" value={project.mix.bgmGain} min={0} max={1} step={0.01} suffix="%" onChange={(value) => onMixChange({ bgmGain: value })} />
              <Slider label="SE" value={project.mix.seGain} min={0} max={1} step={0.01} suffix="%" onChange={(value) => onMixChange({ seGain: value })} />
              <label className="toggle-row output-limiter-toggle">
                <span>{t("outputLimiter")}</span>
                <span className="limiter-checkbox-tooltip config-tooltip-anchor" data-config-tooltip={t("outputLimiterCopy")}>
                  <input type="checkbox" checked={project.mix.outputLimiterEnabled} onChange={(event) => onMixChange({ outputLimiterEnabled: event.target.checked })} />
                </span>
              </label>
            </div>
          </section>
        ) : null}
        {activeSection === "auto-loop" ? <AutoLoopSettingsPanel settings={detectionSettings} t={t} onChange={onDetectionSettingsChange} /> : null}
        {activeSection === "look-meter" ? (
          <section className="panel config-panel config-detail-panel look-meter-panel">
            <div className="panel-title-row">
              <h2>{t("lookMeter")}</h2>
              <span className="subtle">{t("visual")} / {t("analyzer")}</span>
            </div>
            <div className="look-meter-grid">
              <div className="config-subsection look-meter-card look-meter-controls look-meter-analyzer-controls">
                <div className="panel-title-row">
                  <h3>{t("analyzer")}</h3>
                  <span className="subtle">{project.visual.analyzerFps} fps</span>
                </div>
                <Slider label={t("analyzerDetail")} value={project.visual.analyzerBands} min={48} max={192} step={8} onChange={(value) => onAnalyzerChange({ analyzerBands: Math.round(value) })} />
                <Slider label={t("analyzerFps")} value={project.visual.analyzerFps} min={10} max={60} step={5} onChange={(value) => onAnalyzerChange({ analyzerFps: Math.round(value) })} />
                <Slider
                  label={t("analyzerLevel")}
                  value={project.visual.analyzerManualLevel}
                  min={0.25}
                  max={4}
                  step={0.05}
                  suffix="%"
                  disabled={project.visual.analyzerAutoLevel}
                  onChange={(value) => onAnalyzerChange({ analyzerManualLevel: value })}
                />
                <label className="toggle-row analyzer-level-toggle">
                  <span>{t("autoLevel")}</span>
                  <input type="checkbox" checked={project.visual.analyzerAutoLevel} onChange={(event) => onAnalyzerChange({ analyzerAutoLevel: event.target.checked })} />
                </label>
              </div>
              <div className="look-meter-side-stack look-meter-visual-stack">
                <div className="config-subsection look-meter-card look-meter-visual">
                  <div className="panel-title-row">
                    <h3>{t("visual")}</h3>
                    <span className="subtle">{t("gamingAccent")}</span>
                  </div>
                  <Slider
                    label="Gaming-ness"
                    labelClassName="gamingness-label"
                    value={project.visual.potatoMode ? 0 : Math.min(project.visual.accentBrightness, gamingnessProgress.max)}
                    min={0}
                    max={gamingnessProgress.max}
                    step={1}
                    disabled={project.visual.potatoMode}
                    onChange={onBrightnessChange}
                  />
                </div>
                <div className="config-subsection look-meter-card look-meter-big-font">
                  <label className={`potato-mode-card big-font-mode-card ${project.ui.bigFontMode ? "active" : ""}`}>
                    <span className="potato-mode-icon big-font-mode-icon" aria-hidden="true">
                      <ALargeSmall size={30} strokeWidth={2.4} />
                    </span>
                    <span className="potato-mode-copy">
                      <strong>{t("bigFontMode")}</strong>
                      <small>{t("bigFontModeCopy")}</small>
                    </span>
                    <input
                      type="checkbox"
                      aria-label={t("bigFontMode")}
                      checked={project.ui.bigFontMode}
                      onChange={(event) => void requestBigFontModeChange(event.target.checked)}
                    />
                  </label>
                </div>
                <div className="config-subsection look-meter-card look-meter-performance">
                  <label className={`potato-mode-card ${project.visual.potatoMode ? "active" : ""}`}>
                    <span className="potato-mode-icon" aria-hidden="true">
                      <svg className="potato-pixel-icon" viewBox="0 0 24 24" shapeRendering="crispEdges" focusable="false">
                        <rect className="potato-edge" x="8" y="3" width="8" height="2" />
                        <rect className="potato-edge" x="6" y="5" width="12" height="2" />
                        <rect className="potato-edge" x="4" y="7" width="16" height="4" />
                        <rect className="potato-edge" x="3" y="11" width="18" height="6" />
                        <rect className="potato-edge" x="5" y="17" width="14" height="3" />
                        <rect className="potato-edge" x="8" y="20" width="8" height="2" />
                        <rect className="potato-body" x="8" y="5" width="8" height="2" />
                        <rect className="potato-body" x="6" y="7" width="12" height="4" />
                        <rect className="potato-body" x="5" y="11" width="14" height="6" />
                        <rect className="potato-body" x="7" y="17" width="10" height="3" />
                        <rect className="potato-shade" x="15" y="9" width="3" height="8" />
                        <rect className="potato-shade" x="12" y="17" width="4" height="2" />
                        <rect className="potato-eye" x="8" y="9" width="2" height="2" />
                        <rect className="potato-eye" x="12" y="13" width="2" height="2" />
                        <rect className="potato-highlight" x="7" y="6" width="2" height="2" />
                      </svg>
                    </span>
                    <span className="potato-mode-copy">
                      <strong>{t("potatoMode")}</strong>
                      <small>{t("potatoModeCopy")}</small>
                    </span>
                    <input type="checkbox" checked={project.visual.potatoMode} onChange={(event) => onPotatoModeChange(event.target.checked)} />
                  </label>
                </div>

                <div className="config-subsection look-meter-card look-meter-exp">
                  <label className={`potato-mode-card exp-lv-mode-card ${project.visual.loadExpEnabled ? "active" : ""}`}>
                    <span className="potato-mode-icon exp-lv-mode-icon" aria-hidden="true">
                      <ExpLvModeIcon />
                    </span>
                    <span className="potato-mode-copy">
                      <strong>{t("expLvMode")}</strong>
                      <small>{t("expLvModeCopy")}</small>
                    </span>
                    <input
                      type="checkbox"
                      aria-label={t("expLvMode")}
                      checked={project.visual.loadExpEnabled}
                      onChange={(event) => onAnalyzerChange({ loadExpEnabled: event.target.checked })}
                    />
                  </label>
                  {project.visual.loadExpOverflowCount > 0 ? (
                    <label className="toggle-row overflow-mode-toggle">
                      <span>
                        {t("overflowMode")}
                        <small>{t("overflowCounter")} 0x{project.visual.loadExpOverflowCount.toString(16).toUpperCase()}</small>
                      </span>
                      <input type="checkbox" checked={project.visual.loadExpOverflowMode} onChange={(event) => onAnalyzerChange({ loadExpOverflowMode: event.target.checked })} />
                    </label>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}
        {activeSection === "files-save" ? (
          <section className="panel config-panel config-detail-panel app-storage-panel">
            <div className="panel-title-row">
              <h2>{t("filesSave")}</h2>
              <span className="subtle">{t("localOnly")}</span>
            </div>
            <FileStorageSettingsPanel
              projectStorePath={projectStorePath}
              dataFolderInfo={dataFolderInfo}
              t={t}
              onSelectSaveLocation={onSelectSaveLocation}
              onSelectDataFolder={onSelectDataFolder}
              onOpenSaveFolder={onOpenSaveFolder}
              onOpenDataFolder={onOpenDataFolder}
              onExportBackup={onExportBackup}
              onImportBackup={onImportBackup}
            />
          </section>
        ) : null}
        {activeSection === "se-pad-control" ? (
          <SePadConfigPanel
            assignments={project.seAssignments}
            activeKeys={activeKeys}
            voiceCount={voiceCount}
            voiceLimit={project.mix.seVoiceLimit}
            preloadMap={sePreloadMap}
            readySummary={seReadySummary}
            activeSeSetName={project.activeSeSetName}
            t={t}
            onAssign={onAssignSe}
            onTrigger={onTriggerSe}
            onUnload={onUnloadSe}
            onSettingsChange={onSeSettingsChange}
            onBulkSettingsChange={onBulkSeSettingsChange}
            onReset={onResetSeSettings}
            onClearAll={onClearSeAssignments}
            onSaveSet={onSaveSeSet}
            onLoadSet={onLoadSeSet}
            onConfirm={onConfirm}
            onPrompt={onPrompt}
            onVoiceLimitChange={(value) => onMixChange({ seVoiceLimit: value })}
          />
        ) : null}
      </div>
    </div>
  );
}

function LegacyConfigView({
  project,
  detectionSettings,
  activeKeys,
  voiceCount,
  sePreloadMap,
  seReadySummary,
  gamingnessProgress,
  language,
  t,
  projectStorePath,
  dataFolderInfo,
  onDetectionSettingsChange,
  onMixChange,
  onBrightnessChange,
  onPotatoModeChange,
  onAnalyzerChange,
  onUiSettingsChange,
  onOpenHelp,
  onSelectSaveLocation,
  onSelectDataFolder,
  onOpenSaveFolder,
  onOpenDataFolder,
  onExportBackup,
  onImportBackup,
  onAssignSe,
  onTriggerSe,
  onUnloadSe,
  onSeSettingsChange,
  onBulkSeSettingsChange,
  onResetSeSettings,
  onClearSeAssignments,
  onSaveSeSet,
  onLoadSeSet,
  onConfirm,
  onPrompt
}: {
  project: GamingProject;
  detectionSettings: DetectionSettings;
  activeKeys: Set<SeKey>;
  voiceCount: number;
  sePreloadMap: SePreloadMap;
  seReadySummary: SeReadySummary;
  gamingnessProgress: GamingnessProgress;
  language: UiLanguage;
  t: Translator;
  projectStorePath: string | null;
  dataFolderInfo: DataFolderInfo;
  onDetectionSettingsChange: (settings: DetectionSettings) => void;
  onMixChange: (patch: Partial<GamingProject["mix"]>) => void;
  onBrightnessChange: (value: number) => void;
  onPotatoModeChange: (enabled: boolean) => void;
  onAnalyzerChange: (patch: Partial<GamingProject["visual"]>) => void;
  onUiSettingsChange: (patch: Partial<UiSettings>) => void;
  onOpenHelp: (mode: HelpModalMode) => void;
  onSelectSaveLocation: () => void;
  onSelectDataFolder: (kind: DataFolderKind) => void;
  onOpenSaveFolder: () => void;
  onOpenDataFolder: (kind: DataFolderKind) => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onAssignSe: (key: SeKey) => void;
  onTriggerSe: (key: SeKey) => void;
  onUnloadSe: (key: SeKey) => void;
  onSeSettingsChange: (key: SeKey, patch: Partial<Pick<SeAssignment, "volume" | "pan">>) => void;
  onBulkSeSettingsChange: (updates: Array<{ key: SeKey; patch: Partial<Pick<SeAssignment, "volume" | "pan">> }>) => void;
  onResetSeSettings: (mode: SeConfigMode) => void;
  onClearSeAssignments: () => void;
  onSaveSeSet: () => void;
  onLoadSeSet: () => void;
  onConfirm: (dialog: ConfirmDialogState) => Promise<boolean>;
  onPrompt: (dialog: PromptDialogState) => Promise<string | null>;
}): ReactElement {
  return (
    <div className="view config-view">
      <SePadConfigPanel
        assignments={project.seAssignments}
        activeKeys={activeKeys}
        voiceCount={voiceCount}
        voiceLimit={project.mix.seVoiceLimit}
        preloadMap={sePreloadMap}
        readySummary={seReadySummary}
        activeSeSetName={project.activeSeSetName}
        t={t}
        onAssign={onAssignSe}
        onTrigger={onTriggerSe}
        onUnload={onUnloadSe}
        onSettingsChange={onSeSettingsChange}
        onBulkSettingsChange={onBulkSeSettingsChange}
        onReset={onResetSeSettings}
        onClearAll={onClearSeAssignments}
        onSaveSet={onSaveSeSet}
        onLoadSet={onLoadSeSet}
        onConfirm={onConfirm}
        onPrompt={onPrompt}
        onVoiceLimitChange={(value) => onMixChange({ seVoiceLimit: value })}
      />
      <div className="config-settings-grid" aria-label="Config settings">
        <section className="panel config-panel">
          <div className="panel-title-row">
            <h2>{t("mix")}</h2>
            <span className="subtle">Master / BGM / SE</span>
          </div>
          <Slider label="Master" value={project.mix.masterGain} min={0} max={1} step={0.01} suffix="%" onChange={(value) => onMixChange({ masterGain: value })} />
          <Slider label="BGM" value={project.mix.bgmGain} min={0} max={1} step={0.01} suffix="%" onChange={(value) => onMixChange({ bgmGain: value })} />
          <Slider label="SE" value={project.mix.seGain} min={0} max={1} step={0.01} suffix="%" onChange={(value) => onMixChange({ seGain: value })} />
          <label className="toggle-row output-limiter-toggle">
            <span>{t("outputLimiter")}</span>
            <span className="limiter-checkbox-tooltip config-tooltip-anchor" data-config-tooltip={t("outputLimiterCopy")}>
              <input type="checkbox" checked={project.mix.outputLimiterEnabled} onChange={(event) => onMixChange({ outputLimiterEnabled: event.target.checked })} />
            </span>
          </label>
        </section>
        <AutoLoopSettingsPanel settings={detectionSettings} t={t} onChange={onDetectionSettingsChange} />
        <section className="panel config-panel look-meter-panel">
          <div className="panel-title-row">
            <h2>Look & Meter / Mode Select</h2>
            <span className="subtle">{t("visual")} / {t("analyzer")}</span>
          </div>
          <div className="config-subsection">
            <div className="panel-title-row">
              <h3>{t("visual")}</h3>
            </div>
            <Slider
              label="Gaming-ness"
              labelClassName="gamingness-label"
              value={project.visual.potatoMode ? 0 : Math.min(project.visual.accentBrightness, gamingnessProgress.max)}
              min={0}
              max={gamingnessProgress.max}
              step={1}
              disabled={project.visual.potatoMode}
              onChange={onBrightnessChange}
            />
            <label className={`potato-mode-card ${project.visual.potatoMode ? "active" : ""}`}>
              <span className="potato-mode-icon" aria-hidden="true">
                <svg className="potato-pixel-icon" viewBox="0 0 24 24" shapeRendering="crispEdges" focusable="false">
                  <rect className="potato-edge" x="8" y="3" width="8" height="2" />
                  <rect className="potato-edge" x="6" y="5" width="12" height="2" />
                  <rect className="potato-edge" x="4" y="7" width="16" height="4" />
                  <rect className="potato-edge" x="3" y="11" width="18" height="6" />
                  <rect className="potato-edge" x="5" y="17" width="14" height="3" />
                  <rect className="potato-edge" x="8" y="20" width="8" height="2" />
                  <rect className="potato-body" x="8" y="5" width="8" height="2" />
                  <rect className="potato-body" x="6" y="7" width="12" height="4" />
                  <rect className="potato-body" x="5" y="11" width="14" height="6" />
                  <rect className="potato-body" x="7" y="17" width="10" height="3" />
                  <rect className="potato-shade" x="15" y="9" width="3" height="8" />
                  <rect className="potato-shade" x="12" y="17" width="4" height="2" />
                  <rect className="potato-eye" x="8" y="9" width="2" height="2" />
                  <rect className="potato-eye" x="12" y="13" width="2" height="2" />
                  <rect className="potato-highlight" x="7" y="6" width="2" height="2" />
                </svg>
              </span>
              <span className="potato-mode-copy">
                <strong>Potato Mode</strong>
                <small>Cuts visual and audio load For our Green Planet.</small>
              </span>
              <input
                type="checkbox"
                checked={project.visual.potatoMode}
                onChange={(event) => onPotatoModeChange(event.target.checked)}
              />
            </label>
            <label className={`potato-mode-card exp-lv-mode-card ${project.visual.loadExpEnabled ? "active" : ""}`}>
              <span className="potato-mode-icon exp-lv-mode-icon" aria-hidden="true">
                <ExpLvModeIcon />
              </span>
              <span className="potato-mode-copy">
                <strong>{t("expLvMode")}</strong>
                <small>{t("expLvModeCopy")}</small>
              </span>
              <input
                type="checkbox"
                aria-label={t("expLvMode")}
                checked={project.visual.loadExpEnabled}
                onChange={(event) => onAnalyzerChange({ loadExpEnabled: event.target.checked })}
              />
            </label>
            {project.visual.loadExpOverflowCount > 0 ? (
              <label className="toggle-row overflow-mode-toggle">
                <span>
                  Overflow Mode
                  <small>Overflow Counter 0x{project.visual.loadExpOverflowCount.toString(16).toUpperCase()}</small>
                </span>
                <input
                  type="checkbox"
                  checked={project.visual.loadExpOverflowMode}
                  onChange={(event) => onAnalyzerChange({ loadExpOverflowMode: event.target.checked })}
                />
              </label>
            ) : null}
          </div>
          <div className="config-subsection">
            <h3>{t("analyzer")}</h3>
            <Slider label={t("detail")} value={project.visual.analyzerBands} min={48} max={192} step={8} onChange={(value) => onAnalyzerChange({ analyzerBands: Math.round(value) })} />
            <Slider label={t("fps")} value={project.visual.analyzerFps} min={10} max={60} step={5} onChange={(value) => onAnalyzerChange({ analyzerFps: Math.round(value) })} />
            <label className="toggle-row analyzer-level-toggle">
              <span>{t("autoLevel")}</span>
              <input
                type="checkbox"
                checked={project.visual.analyzerAutoLevel}
                onChange={(event) => onAnalyzerChange({ analyzerAutoLevel: event.target.checked })}
              />
            </label>
            <Slider
              label={t("displayLevel")}
              value={project.visual.analyzerManualLevel}
              min={0.25}
              max={4}
              step={0.05}
              suffix="%"
              disabled={project.visual.analyzerAutoLevel}
              onChange={(value) => onAnalyzerChange({ analyzerManualLevel: value })}
            />
          </div>
        </section>
        <section className="panel config-panel app-storage-panel">
          <div className="panel-title-row">
            <h2>App & Storage</h2>
            <span className="subtle">{t("localOnly")}</span>
          </div>
          <div className="app-storage-grid">
            <div className="config-subsection">
              <h3>{t("display")}</h3>
              <div className="preset-row">
                <span>{t("language")}</span>
                <label className="segmented language-segmented">
                  <button className={language === "ja" ? "active" : ""} type="button" onClick={() => onUiSettingsChange({ language: "ja" })}>
                    日本語
                  </button>
                  <button className={language === "en" ? "active" : ""} type="button" onClick={() => onUiSettingsChange({ language: "en" })}>
                    English
                  </button>
                </label>
              </div>
              <div className="help-action-row">
                <button className="thin-button" type="button" onClick={() => onOpenHelp("guide")}>
                  <BookOpen size={16} />
                  {t("help")}
                </button>
                <button className="thin-button" type="button" onClick={() => onOpenHelp("shortcuts")}>
                  {t("shortcuts")}
                </button>
              </div>
            </div>
            <FileStorageSettingsPanel
              projectStorePath={projectStorePath}
              dataFolderInfo={dataFolderInfo}
              t={t}
              onSelectSaveLocation={onSelectSaveLocation}
              onSelectDataFolder={onSelectDataFolder}
              onOpenSaveFolder={onOpenSaveFolder}
              onOpenDataFolder={onOpenDataFolder}
              onExportBackup={onExportBackup}
              onImportBackup={onImportBackup}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function SePadConfigPanel({
  assignments,
  activeKeys,
  voiceCount,
  voiceLimit,
  preloadMap,
  readySummary,
  activeSeSetName,
  t,
  onAssign,
  onTrigger,
  onUnload,
  onSettingsChange,
  onBulkSettingsChange,
  onReset,
  onClearAll,
  onSaveSet,
  onLoadSet,
  onConfirm,
  onPrompt,
  onVoiceLimitChange
}: {
  assignments: SeAssignment[];
  activeKeys: Set<SeKey>;
  voiceCount: number;
  voiceLimit: number;
  preloadMap: SePreloadMap;
  readySummary: SeReadySummary;
  activeSeSetName: string | null;
  t: Translator;
  onAssign: (key: SeKey) => void;
  onTrigger: (key: SeKey) => void;
  onUnload: (key: SeKey) => void;
  onSettingsChange: (key: SeKey, patch: Partial<Pick<SeAssignment, "volume" | "pan">>) => void;
  onBulkSettingsChange: (updates: Array<{ key: SeKey; patch: Partial<Pick<SeAssignment, "volume" | "pan">> }>) => void;
  onReset: (mode: SeConfigMode) => void;
  onClearAll: () => void;
  onSaveSet: () => void;
  onLoadSet: () => void;
  onConfirm: (dialog: ConfirmDialogState) => Promise<boolean>;
  onPrompt: (dialog: PromptDialogState) => Promise<string | null>;
  onVoiceLimitChange: (value: number) => void;
}): ReactElement {
  const [mode, setMode] = useState<SeConfigMode>("volume");
  const [pointerEditMode, setPointerEditMode] = useState<SeConfigMode | null>(null);
  const configClickSuppressRef = useRef(false);
  const pointerEditRef = useRef<{
    mode: SeConfigMode;
    key: SeKey;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const bulkEditRef = useRef<{
    mode: SeConfigMode;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    values: Array<{ key: SeKey; volume: number; pan: number }>;
  } | null>(null);
  const bulkBaselineRef = useRef<{ mode: SeConfigMode; average: number } | null>(null);
  const byKey = useMemo(() => new Map(assignments.map((assignment) => [assignment.key, assignment])), [assignments]);
  const assignmentIdentity = useMemo(() => assignments.map((assignment) => `${assignment.key}:${assignment.file?.id ?? ""}`).join("|"), [assignments]);
  const assignedValues = useMemo(
    () => assignments.filter((assignment) => assignment.file).map((assignment) => ({ key: assignment.key, volume: clampSeVolume(assignment.volume), pan: clampSePan(assignment.pan) })),
    [assignments]
  );
  const hasAssignedSe = assignedValues.length > 0;
  const averageVolume = assignedValues.length === 0 ? 1 : assignedValues.reduce((sum, item) => sum + item.volume, 0) / assignedValues.length;
  const averagePan = assignedValues.length === 0 ? 0 : assignedValues.reduce((sum, item) => sum + item.pan, 0) / assignedValues.length;

  useEffect(() => {
    if (!pointerEditMode) return undefined;
    const stop = () => {
      const editedByDrag = Boolean(pointerEditRef.current?.active || bulkEditRef.current?.active);
      if (editedByDrag) {
        configClickSuppressRef.current = true;
        window.setTimeout(() => {
          configClickSuppressRef.current = false;
        }, 0);
      }
      pointerEditRef.current = null;
      bulkEditRef.current = null;
      setPointerEditMode(null);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [pointerEditMode]);

  useEffect(() => {
    bulkBaselineRef.current = null;
  }, [assignmentIdentity]);

  function beginConfigValueDrag(assignment: SeAssignment, event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!assignment.file) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerEditRef.current = { mode, key: assignment.key, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false };
    setPointerEditMode(mode);
  }

  function moveConfigValueDrag(assignment: SeAssignment, event: ReactPointerEvent<HTMLButtonElement>): void {
    const edit = pointerEditRef.current;
    if (!edit || edit.mode !== mode || edit.key !== assignment.key || edit.pointerId !== event.pointerId || !assignment.file) return;
    const moved = Math.abs(event.clientX - edit.startX) + Math.abs(event.clientY - edit.startY);
    if (!edit.active && moved < 3) return;
    edit.active = true;
    configClickSuppressRef.current = true;
    applyConfigValueFromPointer(assignment, event.currentTarget, event.clientX, event.clientY);
  }

  function applyConfigValueFromPointer(assignment: SeAssignment, element: HTMLButtonElement, clientX: number, clientY: number): void {
    const rect = element.getBoundingClientRect();
    if (mode === "volume") {
      if (rect.height <= 0) return;
      const ratio = clampNumber((rect.bottom - clientY) / rect.height, 0, 1, clampSeVolume(assignment.volume));
      onSettingsChange(assignment.key, { volume: ratio });
      return;
    }
    if (rect.width <= 0) return;
    const ratio = clampNumber((clientX - rect.left) / rect.width, 0, 1, 0.5);
    onSettingsChange(assignment.key, { pan: ratio * 2 - 1 });
  }

  function wheelConfigValue(assignment: SeAssignment, event: ReactWheelEvent<HTMLButtonElement>): void {
    if (!assignment.file) return;
    event.preventDefault();
    const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
    if (rawDelta === 0) return;
    const direction = rawDelta > 0 ? 1 : -1;
    const step = event.shiftKey ? 0.01 : 0.05;
    if (mode === "volume") {
      onSettingsChange(assignment.key, { volume: clampSeVolume(clampSeVolume(assignment.volume) + direction * step) });
      return;
    }
    onSettingsChange(assignment.key, { pan: clampSePan(clampSePan(assignment.pan) + direction * step) });
  }

  async function inputDirectValue(assignment: SeAssignment): Promise<void> {
    if (!assignment.file) {
      onAssign(assignment.key);
      return;
    }
    const current = mode === "volume" ? Math.round(clampSeVolume(assignment.volume) * 100) : Math.round(clampSePan(assignment.pan) * 100);
    const label = mode === "volume" ? "Volume 0-100" : "PAN -100 to 100";
    const raw = await onPrompt({
      title: `${assignment.key} ${mode === "volume" ? t("volume") : t("pan")}`,
      message: assignment.file.fileName,
      initialValue: String(current),
      confirmLabel: t("apply"),
      placeholder: label
    });
    if (raw === null) return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    if (mode === "volume") {
      onSettingsChange(assignment.key, { volume: clampNumber(value, 0, 100, current) / 100 });
      return;
    }
    onSettingsChange(assignment.key, { pan: clampNumber(value, -100, 100, current) / 100 });
  }

  async function confirmReset(): Promise<void> {
    if (
      await onConfirm({
        title: t("sePadAssign"),
        message: mode === "volume" ? t("resetSeVolumeMessage") : t("resetSePanMessage"),
        detail: t("resetSeKeepDetail"),
        confirmLabel: t("reset"),
        danger: mode === "volume"
      })
    ) {
      onReset(mode);
    }
  }

  async function confirmClearAll(): Promise<void> {
    if (
      await onConfirm({
        title: t("sePadAssign"),
        message: t("clearSeAssignmentsMessage"),
        detail: t("clearSeAssignmentsDetail"),
        confirmLabel: t("clearAll"),
        danger: true
      })
    ) {
      onClearAll();
    }
  }

  function beginBulkDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (assignedValues.length === 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    ensureBulkBaseline();
    bulkEditRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      values: assignedValues
    };
    setPointerEditMode(mode);
  }

  function moveBulkDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const edit = bulkEditRef.current;
    if (!edit || edit.mode !== mode || edit.pointerId !== event.pointerId) return;
    const moved = Math.abs(event.clientX - edit.startX) + Math.abs(event.clientY - edit.startY);
    if (!edit.active && moved < 3) return;
    edit.active = true;
    const delta = mode === "volume" ? (edit.startY - event.clientY) / 140 : (event.clientX - edit.startX) / 140;
    applyBulkDelta(edit.values, delta);
  }

  function wheelBulkValue(event: ReactWheelEvent<HTMLDivElement>): void {
    if (assignedValues.length === 0) return;
    event.preventDefault();
    const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
    if (rawDelta === 0) return;
    const direction = rawDelta > 0 ? 1 : -1;
    const step = event.shiftKey ? 0.01 : 0.05;
    ensureBulkBaseline();
    applyBulkDelta(assignedValues, direction * step);
  }

  function ensureBulkBaseline(): void {
    if (bulkBaselineRef.current?.mode === mode) return;
    bulkBaselineRef.current = { mode, average: getCurrentBulkAverage() };
  }

  function getCurrentBulkAverage(): number {
    return mode === "volume" ? averageVolume : averagePan;
  }

  function restoreBulkAverage(): void {
    if (assignedValues.length === 0) return;
    const baseline = bulkBaselineRef.current;
    if (!baseline || baseline.mode !== mode) return;
    const delta = baseline.average - getCurrentBulkAverage();
    if (Math.abs(delta) < 0.001) return;
    applyBulkDelta(assignedValues, delta);
    bulkBaselineRef.current = null;
  }

  function applyBulkDelta(values: Array<{ key: SeKey; volume: number; pan: number }>, delta: number): void {
    const updates = values.map((item) => ({
      key: item.key,
      patch: mode === "volume" ? { volume: clampSeVolume(item.volume + delta) } : { pan: clampSePan(item.pan + delta) }
    }));
    onBulkSettingsChange(updates);
  }

  return (
    <section className="panel se-config-panel">
      <div className="panel-title-row">
        <div>
          <h2>{t("sePadAssign")}</h2>
          <span className="subtle se-status-line">
            <span>{t("activeVoices")} {voiceCount}/{voiceLimit}</span>
            <span className={readySummary.error > 0 ? "se-ready-count error" : readySummary.loading > 0 ? "se-ready-count loading" : "se-ready-count"}>
              {t("seReady")} {readySummary.ready}/{readySummary.total}
            </span>
          </span>
        </div>
      </div>
      <div className="se-config-control-row">
        <div className="se-config-current-strip">
          <label className="current-se-set-field">
            <span>{t("currentSePad")}</span>
            <strong>{activeSeSetName ?? t("noActiveSeSet")}</strong>
          </label>
          <button className="thin-button config-tooltip-anchor" type="button" onClick={onSaveSet} disabled={!hasAssignedSe} data-config-tooltip={t("seTooltipSaveSet")}>
            SAVE
          </button>
          <button className="thin-button config-tooltip-anchor" type="button" onClick={onLoadSet} data-config-tooltip={t("seTooltipLoadSet")}>
            LOAD
          </button>
        </div>
        <div className="se-config-global-section">
          <span className="se-config-section-label">{t("globalControl")}</span>
          <button className="thin-button config-tooltip-anchor" type="button" onClick={() => void confirmReset()} data-config-tooltip={t("seTooltipDefault")}>
            Reset
          </button>
          <div
            className={`se-global-control config-tooltip-anchor mode-${mode} ${hasAssignedSe ? "" : "is-disabled"}`}
            data-config-tooltip={mode === "volume" ? t("seTooltipAllVolumeTrim") : t("seTooltipPan")}
            style={
              {
                "--se-global-volume-fill": `${averageVolume * 100}%`,
                "--se-global-volume-fill-ratio": averageVolume,
                "--se-global-pan-start": `${averagePan < 0 ? 50 - Math.abs(averagePan) * 50 : 50}%`,
                "--se-global-pan-end": `${averagePan > 0 ? 50 + averagePan * 50 : 50}%`,
                "--se-global-pan-amount": Math.abs(averagePan),
                "--se-global-pan-center": 1 - Math.abs(averagePan)
              } as CSSProperties
            }
            onPointerDown={beginBulkDrag}
            onPointerMove={moveBulkDrag}
            onWheel={wheelBulkValue}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              restoreBulkAverage();
            }}
            role="button"
            tabIndex={hasAssignedSe ? 0 : -1}
            aria-disabled={!hasAssignedSe}
            aria-label={mode === "volume" ? t("allVolumeTrim") : t("allPanShift")}
          >
            <span>{mode === "volume" ? t("allVolumeTrim") : t("allPanShift")}</span>
            <strong>{mode === "volume" ? `${Math.round(averageVolume * 100)}% avg` : `${Math.round(averagePan * 100)} avg`}</strong>
            <em>{mode === "volume" ? t("dragVertical") : t("dragHorizontal")}</em>
          </div>
          <label className="segmented se-config-mode">
            <button className={`config-tooltip-anchor ${mode === "volume" ? "active" : ""}`} type="button" onClick={() => setMode("volume")} data-config-tooltip={t("seTooltipVolume")}>
              {t("volume")}
            </button>
            <button className={`config-tooltip-anchor ${mode === "pan" ? "active" : ""}`} type="button" onClick={() => setMode("pan")} data-config-tooltip={t("seTooltipPan")}>
              {t("pan")}
            </button>
          </label>
        </div>
      </div>
      <div className={`se-config-keyboard mode-${mode}`} aria-label="SE pad assignment overview">
        {seKeyRows.map((row, rowIndex) => (
          <div className={`se-config-row row-${rowIndex + 1}`} key={row.join("")}>
            {rowIndex === 2 ? (
              <label className="se-voice-limit-control se-config-row-control config-tooltip-anchor" data-config-tooltip={t("seTooltipVoiceLimit")}>
                <span>{t("seVoiceLimit")}</span>
                <input
                  type="number"
                  min="1"
                  max="32"
                  step="1"
                  value={voiceLimit}
                  onChange={(event) => onVoiceLimitChange(Math.round(clampNumber(event.target.value, 1, 32, voiceLimit)))}
                />
              </label>
            ) : null}
            {row.map((key) => {
              const assignment = byKey.get(key) ?? createDefaultSeAssignments().find((item) => item.key === key)!;
              const assigned = Boolean(assignment.file);
              const preloadStatus = assignment.file ? preloadMap[assignment.file.filePath]?.status ?? "loading" : null;
              const volume = clampSeVolume(assignment.volume);
              const pan = clampSePan(assignment.pan);
              return (
                <button
                  className={`se-config-key se-key color-${assignment.colorId} ${assigned ? "assigned" : "empty"} ${preloadStatus ? `preload-${preloadStatus}` : ""} ${activeKeys.has(key) ? "active" : ""}`}
                  data-key={key}
                  data-mode={mode}
                  data-assigned={assigned ? "true" : "false"}
                  key={key}
                  style={
                    {
                      "--se-volume-fill": `${volume * 100}%`,
                      "--se-volume-fill-ratio": volume,
                      "--se-pan-left": pan < 0 ? Math.abs(pan) : 0,
                      "--se-pan-right": pan > 0 ? pan : 0,
                      "--se-pan-center": 1 - Math.abs(pan),
                      "--se-pan-start": `${pan < 0 ? 50 - Math.abs(pan) * 50 : 50}%`,
                      "--se-pan-end": `${pan > 0 ? 50 + pan * 50 : 50}%`,
                      "--se-pan-amount": Math.abs(pan)
                    } as CSSProperties
                  }
                  type="button"
                  onClick={(event) => {
                    if (configClickSuppressRef.current) {
                      event.preventDefault();
                      event.stopPropagation();
                      return;
                    }
                    if (event.shiftKey && assigned) {
                      onUnload(key);
                      return;
                    }
                    if (assigned) {
                      onTrigger(key);
                      return;
                    }
                    onAssign(key);
                  }}
                  onDoubleClick={() => void inputDirectValue(assignment)}
                  onPointerDown={(event) => beginConfigValueDrag(assignment, event)}
                  onPointerMove={(event) => moveConfigValueDrag(assignment, event)}
                  onWheel={(event) => wheelConfigValue(assignment, event)}
                >
                  <span className="key-active-wash" />
                  <span className="key-leak" />
                  <span className="key-corner" />
                  <span className="se-config-fill" />
                  <span className="key-letter se-config-key-name">{key}</span>
                  {assigned ? (
                    <span className="key-assigned-content">
                      <span className="key-icon">
                        <SeIcon iconId={assignment.iconId} />
                      </span>
                      <span className="key-file se-config-file">{compactFileName(assignment.file?.fileName ?? "", 12)}</span>
                    </span>
                  ) : null}
                  <span className="se-config-value">{mode === "volume" ? `${Math.round(volume * 100)}%` : String(Math.round(pan * 100))}</span>
                  {!assigned ? <span className="se-config-empty-action">{t("load")}</span> : null}
                </button>
              );
            })}
            {rowIndex === 2 ? (
              <button className="thin-button danger-button se-config-row-control se-config-clear-control config-tooltip-anchor" type="button" onClick={() => void confirmClearAll()} data-config-tooltip={t("seTooltipClearAll")}>
                {t("clearAll")}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AutoLoopSettingsPanel({ settings, t, onChange }: { settings: DetectionSettings; t: Translator; onChange: (settings: DetectionSettings) => void }): ReactElement {
  const presetLabel = getDetectionPresetLabel(settings);
  const presetDescriptionKey = getDetectionPresetDescriptionKey(settings);

  function applyPreset(presetId: AutoLoopPresetId): void {
    onChange({ ...settings, ...autoLoopPresets[presetId], autoDetectOnImport: settings.autoDetectOnImport });
  }

  function patch(patchSettings: Partial<DetectionSettings>): void {
    onChange(sanitizeDetectionSettings({ ...settings, ...patchSettings }));
  }

  return (
    <section className="panel config-panel auto-loop-settings">
      <div className="panel-title-row">
        <h2>{t("autoLoop")}</h2>
        <span className="subtle">{presetLabel}</span>
      </div>
      <div className="preset-row">
        <span>{t("preset")}</span>
        <label className="segmented preset-segmented">
          <button className={presetLabel === "VGTDEEP" ? "active" : ""} type="button" onClick={() => applyPreset("vgost")}>
            {t("vgost")}
          </button>
          <button className={presetLabel === "Normal" ? "active" : ""} type="button" onClick={() => applyPreset("normal")}>
            {t("normal")}
          </button>
          <button className={presetLabel === "Deep" ? "active" : ""} type="button" onClick={() => applyPreset("deep")}>
            {t("deep")}
          </button>
          <button className={presetLabel.startsWith("Custom") ? "active" : ""} type="button" disabled>
            {t("custom")}
          </button>
        </label>
      </div>
      <div className="preset-description-row">
        <span>{t("presetDesignIntent")}</span>
        <div className="preset-description-card">
          <strong>{presetLabel}</strong>
          <p>{t(presetDescriptionKey)}</p>
        </div>
      </div>
      <label className="toggle-row">
        <span>{t("runOnImport")}</span>
        <input type="checkbox" checked={settings.autoDetectOnImport} onChange={(event) => patch({ autoDetectOnImport: event.target.checked })} />
      </label>
      <NumberSetting label={t("matchWindow")} value={settings.matchWindowMs} min={100} max={30000} step={100} suffix="ms" onChange={(value) => patch({ matchWindowMs: value })} />
      <NumberSetting label={t("requiredMatch")} value={settings.matchThreshold} min={1} max={100} step={1} suffix="%" onChange={(value) => patch({ matchThreshold: value })} />
      <NumberSetting label={t("minimumLoop")} value={settings.minimumLoopMs} min={100} max={60000} step={100} suffix="ms" onChange={(value) => patch({ minimumLoopMs: value })} />
      <NumberSetting label={t("loopCheckPreroll")} value={settings.loopCheckPrerollMs} min={0} max={30000} step={100} suffix="ms" onChange={(value) => patch({ loopCheckPrerollMs: value })} />
    </section>
  );
}

function NumberSetting({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <label className="number-setting-row">
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <em>{suffix}</em>
    </label>
  );
}

function getDetectionPresetLabel(settings: DetectionSettings): string {
  if (matchesDetectionPreset(settings, autoLoopPresets.vgost)) return "VGTDEEP";
  if (matchesDetectionPreset(settings, autoLoopPresets.normal)) return "Normal";
  if (matchesDetectionPreset(settings, autoLoopPresets.deep)) return "Deep";
  return `Custom ${settings.mode === "deep" ? "Deep" : "Normal"}`;
}

function getDetectionPresetDescriptionKey(settings: DetectionSettings): TextKey {
  if (matchesDetectionPreset(settings, autoLoopPresets.vgost)) return "vgostPresetDescription";
  if (matchesDetectionPreset(settings, autoLoopPresets.normal)) return "normalPresetDescription";
  if (matchesDetectionPreset(settings, autoLoopPresets.deep)) return "deepPresetDescription";
  return "customPresetDescription";
}

function matchesDetectionPreset(settings: DetectionSettings, preset: DetectionSettings): boolean {
  return (
    settings.mode === preset.mode &&
    settings.matchWindowMs === preset.matchWindowMs &&
    settings.matchThreshold === preset.matchThreshold &&
    settings.minimumLoopMs === preset.minimumLoopMs &&
    settings.loopCheckPrerollMs === preset.loopCheckPrerollMs
  );
}

function Slider({
  label,
  labelClassName,
  value,
  min,
  max,
  step,
  suffix,
  disabled = false,
  onChange
}: {
  label: string;
  labelClassName?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}): ReactElement {
  const safeValue = Math.min(max, Math.max(min, value));
  const isGamingness = labelClassName === "gamingness-label";
  const display = suffix === "%" ? `${Math.round(safeValue * 100)}%` : isGamingness ? formatCompactNumber(safeValue) : String(Math.round(safeValue));
  return (
    <label className={`slider-row ${disabled ? "is-disabled" : ""}`}>
      {isGamingness ? (
        <span className="gamingness-label-shell">
          <span className={labelClassName}>{label}</span>
          <span className="gamingness-meter" aria-hidden="true" />
        </span>
      ) : (
        <span className={labelClassName}>{label}</span>
      )}
      <input type="range" min={min} max={max} step={step} value={safeValue} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
      <em>{display}</em>
    </label>
  );
}

function CompleteSequenceIcon(): ReactElement {
  return (
    <span className="complete-sequence-icon" aria-hidden="true">
      <ListOrdered size={16} />
      <Hammer size={10} />
    </span>
  );
}

function BgmFileDropIcon(): ReactElement {
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

function DropFlowIcon({ kind }: { kind: "note" | "file" }): ReactElement {
  return (
    <span className={`drop-flow-icon ${kind === "file" ? "file-flow" : "note-flow"}`}>
      {kind === "file" ? <FileMusic className="drop-flow-main-icon" size={32} /> : <Music2 className="drop-flow-main-icon" size={30} />}
      <svg className="drop-flow-arrow" viewBox="0 0 56 56" aria-hidden="true">
        <path className="drop-flow-drop" d="M 28 7 C 28 13 28 18 28 24" />
        <path className="drop-flow-head" d="M 22 20 L 28 26 L 34 20" />
        <path className="drop-flow-tray" d="M 16 36 C 20 40 36 40 40 36" />
      </svg>
    </span>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactElement; label: string; onClick: () => void }): ReactElement {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function summarizeSePreload(assignments: SeAssignment[], preloadMap: SePreloadMap): SeReadySummary {
  let ready = 0;
  let assigned = 0;
  let loading = 0;
  let error = 0;
  for (const assignment of assignments) {
    if (!assignment.file) continue;
    assigned += 1;
    const status = preloadMap[assignment.file.filePath]?.status ?? "loading";
    if (status === "ready") ready += 1;
    else if (status === "error") error += 1;
    else loading += 1;
  }
  return { ready, total: seKeys.length, assigned, loading, error };
}

function assignSeFile(assignment: SeAssignment, file: SeFile): SeAssignment {
  const iconId = inferSeIconId(file.fileName);
  return {
    ...assignment,
    file,
    iconId,
    iconSource: "inferred",
    colorId: inferNewSeAssignmentColorId(iconId, assignment.key),
    volume: 1,
    pan: 0
  };
}

function applySeIcon(assignment: SeAssignment, iconId: SeIconId): SeAssignment {
  return {
    ...assignment,
    iconId,
    iconSource: "manual",
    colorId: inferSeColorId(iconId, assignment.key)
  };
}

function rekeySeAssignment(assignment: SeAssignment, key: SeKey): SeAssignment {
  return {
    ...assignment,
    key,
    volume: clampSeVolume(assignment.volume),
    pan: clampSePan(assignment.pan)
  };
}

function serializeProjectForDirty(project: GamingProject): string {
  return JSON.stringify({ ...project, updatedAt: "" });
}

function normalizeProject(project: GamingProject): GamingProject {
  const defaults = createEmptyProject();
  const assignmentMap = new Map((project.seAssignments ?? []).map((assignment) => [assignment.key, assignment]));
  const seAssignments = defaults.seAssignments.map((assignment) => normalizeSeAssignment({ ...assignment, ...assignmentMap.get(assignment.key) }));
  const bgmTracks = (project.bgmTracks ?? []).map((track) => ({ ...track, volume: clampTrackVolume(track.volume) }));
  const trackById = new Map(bgmTracks.map((track) => [track.id, track]));
  const trackIds = new Set(bgmTracks.map((track) => track.id));
  const sourceHiddenTrackIds = normalizeSourceHiddenTrackIds((project as Partial<GamingProject>).sourceHiddenTrackIds, trackIds);
  const playlist = normalizePlaylistItems(project.playlist, trackIds).map((item) => normalizePlaylistItemRuleForTrack(item, trackById));
  const playlistCreated =
    typeof (project as Partial<GamingProject>).playlistCreated === "boolean"
      ? Boolean((project as Partial<GamingProject>).playlistCreated)
      : playlist.length > 0;
  const playlistEndBehavior = normalizePlaylistEndBehavior(project.playlistEndBehavior);
  const savedPlaylists = normalizeSavedPlaylists((project as Partial<GamingProject>).savedPlaylists, trackIds, trackById);
  const savedSeSets = normalizeSavedSeSets((project as Partial<GamingProject>).savedSeSets);
  const activePlaylistId = savedPlaylists.some((saved) => saved.id === (project as Partial<GamingProject>).activePlaylistId) ? (project as Partial<GamingProject>).activePlaylistId ?? null : null;
  const activeSeSetName = sanitizeOptionalSeSetName((project as Partial<GamingProject>).activeSeSetName);
  const requestedActiveSeSetId = typeof (project as Partial<GamingProject>).activeSeSetId === "string" ? (project as Partial<GamingProject>).activeSeSetId : null;
  const activeSeSetById = savedSeSets.find((set) => set.id === requestedActiveSeSetId);
  const activeSeSetByName = activeSeSetName ? savedSeSets.find((set) => set.name.trim() === activeSeSetName) : null;
  const activeSeSetId = activeSeSetById?.id ?? activeSeSetByName?.id ?? null;
  const incomingDetection = (project as Partial<GamingProject>).detection;

  return {
    ...defaults,
    ...project,
    bgmTracks,
    sourceHiddenTrackIds,
    playlistCreated,
    playlistName: normalizeDraftPlaylistName((project as Partial<GamingProject>).playlistName),
    playlistRating: sanitizePlaylistRating((project as Partial<GamingProject>).playlistRating ?? savedPlaylists.find((playlist) => playlist.id === activePlaylistId)?.rating),
    playlistCumulativePlayMs: sanitizePlaylistCumulativeMs((project as Partial<GamingProject>).playlistCumulativePlayMs ?? savedPlaylists.find((playlist) => playlist.id === activePlaylistId)?.cumulativePlayMs),
    activePlaylistId,
    playlistEndBehavior,
    allListRepeatEnabled: Boolean((project as Partial<GamingProject>).allListRepeatEnabled),
    playlist,
    savedPlaylists,
    seAssignments,
    activeSeSetId,
    activeSeSetName,
    noActiveSeSetExpTotal: sanitizeSeSetExpTotal((project as Partial<GamingProject>).noActiveSeSetExpTotal),
    savedSeSets,
    detection: sanitizeDetectionSettings({ ...defaults.detection, ...incomingDetection }),
    mix: sanitizeMixSettings((project as Partial<GamingProject>).mix),
    visual: sanitizeVisualSettings(project.visual),
    fileSettings: { ...defaults.fileSettings, ...project.fileSettings },
    ui: sanitizeUiSettings((project as Partial<GamingProject>).ui),
    selectedTrackId: project.selectedTrackId && trackIds.has(project.selectedTrackId) ? project.selectedTrackId : bgmTracks[0]?.id ?? null
  };
}

function cloneProjectSnapshot(project: GamingProject): GamingProject {
  return {
    ...project,
    bgmTracks: project.bgmTracks.map((track) => cloneBgmTrack(track)),
    sourceHiddenTrackIds: [...project.sourceHiddenTrackIds],
    playlist: clonePlaylistItems(project.playlist),
    savedPlaylists: project.savedPlaylists.map((playlist) => cloneSavedPlaylist(playlist)),
    seAssignments: cloneSeAssignments(project.seAssignments),
    savedSeSets: project.savedSeSets.map((set) => cloneSavedSeSet(set)),
    detection: { ...project.detection },
    mix: { ...project.mix },
    visual: { ...project.visual },
    fileSettings: { ...project.fileSettings },
    ui: { ...project.ui }
  };
}

function cloneBgmTrack(track: BgmTrack): BgmTrack {
  return {
    ...track,
    file: { ...track.file },
    loop: track.loop ? { ...track.loop } : null,
    waveform: track.waveform
      ? {
          resolution: track.waveform.resolution,
          channels: track.waveform.channels.map((channel) => ({
            min: [...channel.min],
            max: [...channel.max]
          }))
        }
      : null
  };
}

function getTrackImportIdentity(track: BgmTrack): string {
  const hash = typeof track.file.sha256 === "string" ? track.file.sha256.trim().toLowerCase() : "";
  if (hash) return `sha256:${hash}`;
  return `path:${track.filePath.trim().toLowerCase()}`;
}

function serializeProjectForHistory(project: GamingProject): string {
  return serializeProjectForDirty(project);
}

function hasCurrentPlaylistChanges(project: GamingProject): boolean {
  if (project.playlist.length === 0) return false;
  const activePlaylist = project.activePlaylistId
    ? project.savedPlaylists.find((playlist) => playlist.id === project.activePlaylistId)
    : null;
  if (!activePlaylist) return true;
  if (sanitizePlaylistName(project.playlistName, "Play List") !== sanitizePlaylistName(activePlaylist.name, "Play List")) return true;
  if (sanitizePlaylistRating(project.playlistRating) !== sanitizePlaylistRating(activePlaylist.rating)) return true;
  return serializePlaylistItemsForComparison(project.playlist) !== serializePlaylistItemsForComparison(activePlaylist.items);
}

function serializePlaylistItemsForComparison(items: PlaylistItem[]): string {
  return JSON.stringify(
    items.map((item) => ({
      trackId: item.trackId,
      enabled: item.enabled,
      note: item.note,
      rule: clonePlaylistRule(item.rule)
    }))
  );
}

function clonePlaylistRule(rule: PlaylistRule): PlaylistRule {
  if (rule.mode === "loop-count") {
    return { mode: "loop-count", loopCount: rule.loopCount, fadeOutMs: rule.fadeOutMs, ...(typeof rule.durationMs === "number" ? { durationMs: rule.durationMs } : {}) };
  }
  if (rule.mode === "duration") {
    return { mode: "duration", durationMs: rule.durationMs, fadeOutMs: rule.fadeOutMs, ...(typeof rule.loopCount === "number" ? { loopCount: rule.loopCount } : {}) };
  }
  return {
    mode: "straight",
    fadeOutMs: rule.fadeOutMs,
    ...(typeof rule.durationMs === "number" ? { durationMs: rule.durationMs } : {}),
    ...(typeof rule.loopCount === "number" ? { loopCount: rule.loopCount } : {})
  };
}

function clonePlaylistItems(items: PlaylistItem[]): PlaylistItem[] {
  return items.map((item) => ({
    ...item,
    rule: clonePlaylistRule(item.rule)
  }));
}

function cloneSavedPlaylist(playlist: SavedPlaylist): SavedPlaylist {
  return {
    ...playlist,
    rating: sanitizePlaylistRating(playlist.rating),
    cumulativePlayMs: sanitizePlaylistCumulativeMs(playlist.cumulativePlayMs),
    items: clonePlaylistItems(playlist.items)
  };
}

function createSequenceFilePayload(project: GamingProject, playlist: SavedPlaylist): SequenceFile {
  const trackIds = new Set(playlist.items.map((item) => item.trackId));
  return {
    fileKind: "gaminglooper.sequence",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    playlist: cloneSavedPlaylist(playlist),
    tracks: project.bgmTracks.filter((track) => trackIds.has(track.id)).map((track) => cloneBgmTrack(track)),
    playlistEndBehavior: project.playlistEndBehavior
  };
}

function cloneSeAssignment(assignment: SeAssignment): SeAssignment {
  return {
    ...assignment,
    volume: clampSeVolume(assignment.volume),
    pan: clampSePan(assignment.pan),
    file: assignment.file
      ? {
          ...assignment.file,
          file: { ...assignment.file.file },
          waveform: assignment.file.waveform
            ? {
                resolution: assignment.file.waveform.resolution,
                channels: assignment.file.waveform.channels.map((channel) => ({
                  min: [...channel.min],
                  max: [...channel.max]
                }))
              }
            : null
        }
      : null
  };
}

function cloneSeAssignments(assignments: SeAssignment[]): SeAssignment[] {
  return assignments.map((assignment) => cloneSeAssignment(assignment));
}

function cloneSavedSeSet(set: SavedSeSet): SavedSeSet {
  return {
    ...set,
    name: sanitizeSeSetName(set.name, "SE Set"),
    voiceLimit: Math.round(clampNumber(set.voiceLimit, 1, 32, defaultMix.seVoiceLimit)),
    expTotal: sanitizeSeSetExpTotal(set.expTotal),
    assignments: cloneSeAssignments(set.assignments)
  };
}

function createSavedSeSet(name: string, assignments: SeAssignment[], voiceLimit: number, id = createLocalId(), createdAt?: string, expTotal = 0): SavedSeSet {
  const now = new Date().toISOString();
  return {
    id,
    name: sanitizeSeSetName(name, "SE Set"),
    createdAt: createdAt && createdAt.trim() ? createdAt : now,
    updatedAt: now,
    voiceLimit: Math.round(clampNumber(voiceLimit, 1, 32, defaultMix.seVoiceLimit)),
    expTotal: sanitizeSeSetExpTotal(expTotal),
    assignments: cloneSeAssignments(assignments)
  };
}

function sanitizeSeSetName(name: string | null | undefined, fallback: string): string {
  const trimmed = String(name ?? "").trim();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : fallback;
}

function sanitizeOptionalSeSetName(name: string | null | undefined): string | null {
  const trimmed = String(name ?? "").trim();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : null;
}

function seSetNameFromPath(filePath: string | null | undefined): string | null {
  const fileName = String(filePath ?? "").split(/[\\/]/).pop()?.trim() ?? "";
  const baseName = fileName.replace(/\.(glset|json)$/i, "").trim();
  return sanitizeOptionalSeSetName(baseName);
}

function createSavedPlaylist(name: string, items: PlaylistItem[], id = createLocalId(), rating = 0, cumulativePlayMs = 0): SavedPlaylist {
  return {
    id,
    name: sanitizePlaylistName(name, "Play List"),
    rating: sanitizePlaylistRating(rating),
    cumulativePlayMs: sanitizePlaylistCumulativeMs(cumulativePlayMs),
    items: clonePlaylistItems(items)
  };
}

function getUniqueSavedPlaylistName(baseName: string, playlists: SavedPlaylist[], ignoreId?: string): string {
  const safeBase = sanitizePlaylistName(baseName, "Play List");
  const usedNames = new Set(
    playlists
      .filter((playlist) => playlist.id !== ignoreId)
      .map((playlist) => playlist.name.trim().toLowerCase())
  );
  if (!usedNames.has(safeBase.toLowerCase())) return safeBase;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${safeBase} ${index}`;
    if (!usedNames.has(candidate.toLowerCase())) return candidate;
  }
  return `${safeBase} ${Date.now().toString(36)}`;
}

function buildPlaylistFromTracks(tracks: BgmTrack[], currentPlaylist: PlaylistItem[]): PlaylistItem[] {
  const currentByTrackId = new Map(currentPlaylist.map((item) => [item.trackId, item]));
  return tracks.map((track, index) => currentByTrackId.get(track.id) ?? makePlaylistItem(track.id, index));
}

function insertPlaylistItem(items: PlaylistItem[], item: PlaylistItem, targetIndex?: number): PlaylistItem[] {
  return insertPlaylistItemAt(items, item, targetIndex);
}

function getGamingnessProgress(project: GamingProject): GamingnessProgress {
  const enabled = project.visual.loadExpEnabled;
  const bgmCount = project.bgmTracks.length;
  const seCount = project.seAssignments.filter((assignment) => assignment.file).length;
  const assetCount = enabled ? getLoadExpCount(project) : 0;
  const level = gamingnessThresholds.filter((threshold) => assetCount >= threshold).length;
  const previousTarget = level === 0 ? 0 : gamingnessThresholds[level - 1] ?? 0;
  const nextTarget = gamingnessThresholds[level] ?? null;
  const progressPct =
    nextTarget === null
      ? 100
      : clampNumber(((assetCount - previousTarget) / Math.max(1, nextTarget - previousTarget)) * 100, 0, 100, 0);
  const bonusPct = level * 10;
  const overflowCount = sanitizeLoadExpOverflowCount(project.visual.loadExpOverflowCount);
  const baseMax = baseGamingnessMax + (enabled ? bonusPct : 0);
  const overflowBonus =
    enabled && project.visual.loadExpOverflowMode && overflowCount > 0
      ? calculateLoadExpOverflowTotalBonus(overflowCount)
      : 0;
  return {
    enabled,
    assetCount,
    bgmCount,
    seCount,
    level,
    max: baseMax + overflowBonus,
    bonusPct: enabled ? bonusPct : 0,
    overflowCount,
    overflowBonus,
    previousTarget,
    nextTarget,
    progressPct
  };
}

function getLoadExpCount(project: GamingProject): number {
  return sanitizeLoadExpIdentities(project.visual.loadExpIdentities).length;
}

function getEffectiveLoadExpAward(project: GamingProject, amount: number): number {
  const baseAmount = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
  if (!project.visual.potatoMode) return baseAmount;
  return baseAmount * sanitizeLoadExpOverflowCount(project.visual.loadExpOverflowCount);
}

function getActiveSeSetExpTotal(project: GamingProject): number {
  const activeSet = getActiveSavedSeSet(project);
  if (activeSet) return sanitizeSeSetExpTotal(activeSet.expTotal);
  return sanitizeSeSetExpTotal(project.noActiveSeSetExpTotal);
}

function getActiveSavedSeSet(project: GamingProject): SavedSeSet | null {
  const activeId = typeof project.activeSeSetId === "string" ? project.activeSeSetId : null;
  if (activeId) {
    const byId = project.savedSeSets.find((set) => set.id === activeId);
    if (byId) return byId;
  }
  const activeName = sanitizeOptionalSeSetName(project.activeSeSetName);
  return activeName ? project.savedSeSets.find((set) => set.name.trim() === activeName) ?? null : null;
}

function addActiveSeSetExpTotal(project: GamingProject, amount: number): GamingProject {
  const safeAmount = sanitizeSeSetExpTotal(amount);
  if (safeAmount <= 0) return project;
  const activeSet = getActiveSavedSeSet(project);
  if (!activeSet) {
    return {
      ...project,
      noActiveSeSetExpTotal: sanitizeSeSetExpTotal(project.noActiveSeSetExpTotal + safeAmount)
    };
  }
  const nextExpTotal = sanitizeSeSetExpTotal(activeSet.expTotal + safeAmount);
  return {
    ...project,
    activeSeSetId: activeSet.id,
    activeSeSetName: activeSet.name,
    savedSeSets: project.savedSeSets.map((set) => (set.id === activeSet.id ? { ...set, expTotal: nextExpTotal, updatedAt: new Date().toISOString() } : set))
  };
}

function recordLoadExpIdentities(project: GamingProject, identities: string[]): GamingProject {
  if (!project.visual.loadExpEnabled || identities.length === 0) return project;
  const effectiveIdentities = project.visual.potatoMode ? expandPotatoModeLoadExpIdentities(project, identities) : identities;
  if (effectiveIdentities.length === 0) return project;
  const merged = mergeLoadExpIdentities(project.visual.loadExpIdentities, effectiveIdentities, project.visual.loadExpOverflowCount);
  if (!merged.changed) return project;
  return {
    ...project,
    visual: {
      ...project.visual,
      loadExpIdentities: merged.identities,
      loadExpOverflowCount: merged.overflowCount
    }
  };
}

function expandPotatoModeLoadExpIdentities(project: GamingProject, identities: string[]): string[] {
  const multiplier = sanitizeLoadExpOverflowCount(project.visual.loadExpOverflowCount);
  if (multiplier <= 0) return [];
  const existing = new Set(sanitizeLoadExpIdentities(project.visual.loadExpIdentities));
  const acceptedBases = new Set<string>();
  const expanded: string[] = [];
  for (const rawIdentity of identities) {
    const identity = sanitizeLoadExpIdentity(rawIdentity);
    if (!identity || existing.has(identity) || acceptedBases.has(identity)) continue;
    acceptedBases.add(identity);
    expanded.push(identity);
    for (let index = 1; index < multiplier; index += 1) {
      expanded.push(`${identity}:potato-bonus:${index}`);
    }
  }
  return expanded;
}

function mergeLoadExpIdentities(
  existing: string[],
  incoming: string[],
  overflowCount: number
): { identities: string[]; overflowCount: number; changed: boolean } {
  const next = sanitizeLoadExpIdentities(existing);
  const seen = new Set(next);
  let nextOverflowCount = sanitizeLoadExpOverflowCount(overflowCount);
  let changed = next.length !== existing.length || next.some((identity, index) => identity !== existing[index]);
  for (const rawIdentity of incoming) {
    const identity = sanitizeLoadExpIdentity(rawIdentity);
    if (!identity || seen.has(identity)) continue;
    if (next.length >= loadCountOverflowAt) {
      next.length = 0;
      seen.clear();
      nextOverflowCount += 1;
    }
    next.push(identity);
    seen.add(identity);
    changed = true;
  }
  return {
    identities: changed ? next : existing,
    overflowCount: nextOverflowCount,
    changed: changed || nextOverflowCount !== sanitizeLoadExpOverflowCount(overflowCount)
  };
}

function sanitizeLoadExpIdentities(values: string[] | undefined): string[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const rawIdentity of values) {
    const identity = sanitizeLoadExpIdentity(rawIdentity);
    if (!identity || seen.has(identity)) continue;
    if (next.length >= loadCountOverflowAt) {
      next.length = 0;
      seen.clear();
    }
    next.push(identity);
    seen.add(identity);
  }
  return next;
}

function sanitizeLoadExpIdentity(value: string | undefined): string | null {
  const identity = typeof value === "string" ? value.trim().toLowerCase() : "";
  return identity.length > 0 ? identity : null;
}

function sanitizeLoadExpOverflowCount(value: number | undefined): number {
  return Math.max(0, Math.floor(clampNumber(value, 0, 999999, 0)));
}

function getFileIdentity(file: BgmTrack["file"]): string {
  const hash = typeof file.sha256 === "string" ? file.sha256.trim().toLowerCase() : "";
  if (hash) return `sha256:${hash}`;
  return `path:${file.path.trim().toLowerCase()}`;
}

function clampTrackVolume(value: number | undefined): number {
  return Math.min(1, Math.max(0, typeof value === "number" && Number.isFinite(value) ? value : 1));
}

function normalizeSeAssignment(assignment: SeAssignment): SeAssignment {
  return {
    ...assignment,
    colorId: assignment.file ? inferSeColorId(assignment.iconId, assignment.key) : assignment.colorId,
    volume: clampSeVolume(assignment.volume),
    pan: clampSePan(assignment.pan)
  };
}

function clampSeVolume(value: number | undefined): number {
  return Math.min(1, Math.max(0, typeof value === "number" && Number.isFinite(value) ? value : 1));
}

function clampSePan(value: number | undefined): number {
  return Math.min(1, Math.max(-1, typeof value === "number" && Number.isFinite(value) ? value : 0));
}

function parseSeKey(value: string | null): SeKey | null {
  return seKeys.includes(value as SeKey) ? (value as SeKey) : null;
}

function getActiveSeKeys(values: string[]): Set<SeKey> {
  const keys = values.map((value) => parseSeKey(value)).filter((key): key is SeKey => Boolean(key));
  return new Set(keys);
}

function usesRendererWaveformHydration(format: BgmTrack["format"]): boolean {
  return format === "mp3" || format === "ogg" || format === "flac" || format === "opus";
}

function sanitizeDetectionSettings(settings: Partial<DetectionSettings> | undefined): DetectionSettings {
  const mode = settings?.mode === "deep" ? "deep" : "normal";
  const sanitized: DetectionSettings = {
    mode,
    matchWindowMs: clampNumber(settings?.matchWindowMs, 100, 30000, defaultDetectionSettings.matchWindowMs),
    matchThreshold: clampNumber(settings?.matchThreshold, 1, 100, defaultDetectionSettings.matchThreshold),
    minimumLoopMs: clampNumber(settings?.minimumLoopMs, 100, 60000, defaultDetectionSettings.minimumLoopMs),
    loopCheckPrerollMs: clampNumber(settings?.loopCheckPrerollMs, 0, 30000, defaultDetectionSettings.loopCheckPrerollMs),
    autoDetectOnImport: settings?.autoDetectOnImport ?? defaultDetectionSettings.autoDetectOnImport
  };
  if (isLegacyVgostDetectionSettings(sanitized)) {
    return { ...vgostDetectionSettings, autoDetectOnImport: sanitized.autoDetectOnImport };
  }
  return sanitized;
}

function sanitizeMixSettings(settings: Partial<GamingProject["mix"]> | undefined): GamingProject["mix"] {
  return {
    ...defaultMix,
    ...settings,
    masterGain: clampNumber(settings?.masterGain, 0, 1.2, defaultMix.masterGain),
    bgmGain: clampNumber(settings?.bgmGain, 0, 1.2, defaultMix.bgmGain),
    seGain: clampNumber(settings?.seGain, 0, 1.2, defaultMix.seGain),
    seVoiceLimit: Math.round(clampNumber(settings?.seVoiceLimit, 1, 32, defaultMix.seVoiceLimit)),
    outputLimiterEnabled: settings?.outputLimiterEnabled === false ? false : true
  };
}

function sanitizeVisualSettings(settings: Partial<GamingProject["visual"]> | undefined): GamingProject["visual"] {
  const potatoMode = Boolean(settings?.potatoMode ?? defaultVisual.potatoMode);
  const restoredBrightness = clampNumber(
    settings?.accentBrightnessBeforePotato,
    0,
    gamingnessStorageMax,
    clampNumber(settings?.accentBrightness, 0, gamingnessStorageMax, defaultVisual.accentBrightnessBeforePotato)
  );
  const accentBrightness = potatoMode ? 0 : clampNumber(settings?.accentBrightness, 0, gamingnessStorageMax, defaultVisual.accentBrightness);
  const analyzerBands = Math.round(clampNumber(settings?.analyzerBands, 48, 192, defaultVisual.analyzerBands));
  const analyzerFps = Math.round(clampNumber(settings?.analyzerFps, 10, 60, defaultVisual.analyzerFps));
  return {
    ...defaultVisual,
    ...settings,
    accentBrightness,
    accentBrightnessBeforePotato: restoredBrightness,
    potatoMode,
    loadExpEnabled: Boolean(settings?.loadExpEnabled ?? defaultVisual.loadExpEnabled),
    loadExpIdentities: sanitizeLoadExpIdentities(settings?.loadExpIdentities),
    loadExpOverflowCount: sanitizeLoadExpOverflowCount(settings?.loadExpOverflowCount),
    loadExpOverflowMode:
      sanitizeLoadExpOverflowCount(settings?.loadExpOverflowCount) > 0
        ? Boolean(settings?.loadExpOverflowMode ?? defaultVisual.loadExpOverflowMode)
        : false,
    analyzerBandsBeforePotato: Math.round(clampNumber(settings?.analyzerBandsBeforePotato, 48, 192, analyzerBands)),
    analyzerFpsBeforePotato: Math.round(clampNumber(settings?.analyzerFpsBeforePotato, 10, 60, analyzerFps)),
    analyzerBands,
    analyzerFps,
    analyzerAutoLevel: settings?.analyzerAutoLevel ?? defaultVisual.analyzerAutoLevel,
    analyzerManualLevel: clampNumber(settings?.analyzerManualLevel, 0.25, 4, defaultVisual.analyzerManualLevel)
  };
}

function sanitizeUiSettings(settings: Partial<UiSettings> | undefined): UiSettings {
  return {
    ...defaultUi,
    ...settings,
    language: settings?.language === "en" ? "en" : "ja",
    mainPlaylistRatio: clampNumber(settings?.mainPlaylistRatio, 24, 58, defaultUi.mainPlaylistRatio),
    mainWaveformRatio: clampNumber(settings?.mainWaveformRatio, 30, 68, defaultUi.mainWaveformRatio),
    mainAnalyzerHeight: Math.round(clampNumber(settings?.mainAnalyzerHeight, 104, 360, defaultUi.mainAnalyzerHeight)),
    bigFontMode: Boolean(settings?.bigFontMode ?? defaultUi.bigFontMode)
  };
}

function normalizePlaylistItems(values: unknown, trackIds: Set<string>): PlaylistItem[] {
  if (!Array.isArray(values)) return [];
  const items: PlaylistItem[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const source = value as Partial<PlaylistItem>;
    if (typeof source.trackId !== "string" || !trackIds.has(source.trackId)) continue;
    const fallback = makePlaylistItem(source.trackId, items.length);
    items.push({
      id: typeof source.id === "string" && source.id.trim() ? source.id : fallback.id,
      trackId: source.trackId,
      enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled,
      rule: normalizePlaylistRule(source.rule, fallback.rule),
      note: typeof source.note === "string" ? source.note : ""
    });
  }
  return items;
}

function normalizePlaylistItemRuleForTrack(item: PlaylistItem, trackById: Map<string, BgmTrack>): PlaylistItem {
  const track = trackById.get(item.trackId) ?? null;
  return { ...item, rule: normalizePlaylistRuleForTrack(item.rule, track) };
}

function normalizeSavedPlaylists(values: unknown, trackIds: Set<string>, trackById: Map<string, BgmTrack>): SavedPlaylist[] {
  if (!Array.isArray(values)) return [];
  const playlists: SavedPlaylist[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const source = value as Partial<SavedPlaylist>;
    const items = normalizePlaylistItems(source.items, trackIds).map((item) => normalizePlaylistItemRuleForTrack(item, trackById));
    if (items.length === 0) continue;
    playlists.push({
      id: typeof source.id === "string" && source.id.trim() ? source.id : createLocalId(),
      name: sanitizePlaylistName(source.name, `Play List ${playlists.length + 1}`),
      rating: sanitizePlaylistRating(source.rating),
      cumulativePlayMs: sanitizePlaylistCumulativeMs(source.cumulativePlayMs),
      items
    });
  }
  return playlists;
}

function normalizeSavedSeSets(values: unknown): SavedSeSet[] {
  if (!Array.isArray(values)) return [];
  const sets: SavedSeSet[] = [];
  const defaults = createDefaultSeAssignments();
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const source = value as Partial<SavedSeSet>;
    const sourceAssignments = Array.isArray(source.assignments) ? source.assignments : [];
    const assignmentMap = new Map(
      sourceAssignments
        .filter((assignment): assignment is SeAssignment => Boolean(assignment && typeof assignment === "object" && seKeys.includes((assignment as Partial<SeAssignment>).key as SeKey)))
        .map((assignment) => [assignment.key, assignment])
    );
    const assignments = defaults.map((assignment) => cloneSeAssignment(normalizeSeAssignment({ ...assignment, ...assignmentMap.get(assignment.key), key: assignment.key })));
    if (!assignments.some((assignment) => assignment.file)) continue;
    const now = new Date().toISOString();
    sets.push({
      id: typeof source.id === "string" && source.id.trim() ? source.id : createLocalId(),
      name: sanitizeSeSetName(source.name, `SE Set ${sets.length + 1}`),
      createdAt: typeof source.createdAt === "string" && source.createdAt.trim() ? source.createdAt : now,
      updatedAt: typeof source.updatedAt === "string" && source.updatedAt.trim() ? source.updatedAt : now,
      voiceLimit: Math.round(clampNumber(source.voiceLimit, 1, 32, defaultMix.seVoiceLimit)),
      expTotal: sanitizeSeSetExpTotal(source.expTotal),
      assignments
    });
  }
  return sets;
}

function sanitizePlaylistRating(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(3, Math.round(numeric)));
}

function sanitizePlaylistCumulativeMs(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.round(numeric));
}

function sanitizeSeSetExpTotal(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.floor(numeric));
}

function getSeSetExpTotalForSave(sourceName: string, savedName: string, expTotal: number): number {
  const safeExpTotal = sanitizeSeSetExpTotal(expTotal);
  return sourceName.trim() === savedName.trim() ? safeExpTotal : Math.floor(safeExpTotal / 2);
}

function normalizePlaylistEndBehavior(value: unknown): PlaylistEndBehavior {
  return value === "stop" ? "stop" : "repeat";
}

function sanitizePlaylistName(value: unknown, fallback: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  const fallbackName = fallback.trim() || "Play List";
  return name || fallbackName;
}

function normalizeDraftPlaylistName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSourceHiddenTrackIds(value: unknown, trackIds: Set<string>): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((id): id is string => typeof id === "string" && trackIds.has(id))));
}

function getNextSelectedTrackIdAfterRemoval(
  currentId: string | null,
  removedIds: Set<string>,
  playlistTrackIds: string[],
  bgmTracks: BgmTrack[]
): string | null {
  if (!currentId || !removedIds.has(currentId)) return currentId;
  const availableIds = new Set(bgmTracks.map((track) => track.id).filter((id) => !removedIds.has(id)));
  return playlistTrackIds.find((id) => availableIds.has(id)) ?? bgmTracks.find((track) => availableIds.has(track.id))?.id ?? null;
}

function normalizePlaylistRule(value: unknown, fallback: PlaylistRule): PlaylistRule {
  if (!value || typeof value !== "object") return clonePlaylistRule(fallback);
  const mode = (value as { mode?: unknown }).mode;
  const fadeOutMs = clampNumber((value as { fadeOutMs?: unknown }).fadeOutMs, 0, 120000, getRuleFadeMs(fallback));
  const fallbackLoopCount = getStoredLoopCount(fallback);
  if (mode === "duration") {
    const durationMs = clampNumber((value as { durationMs?: unknown }).durationMs, 1000, 60 * 60 * 1000, fallback.mode === "duration" ? fallback.durationMs : defaultPlaylistDurationMs);
    return {
      mode: "duration",
      durationMs: Math.max(durationMs, fadeOutMs),
      fadeOutMs,
      loopCount: Math.round(clampNumber((value as { loopCount?: unknown }).loopCount, 1, 99, fallbackLoopCount))
    };
  }
  if (mode === "straight") {
    return {
      mode: "straight",
      fadeOutMs,
      durationMs: Math.round(clampNumber((value as { durationMs?: unknown }).durationMs, 1000, 60 * 60 * 1000, getStoredDurationMs(fallback, defaultPlaylistDurationMs))),
      loopCount: Math.round(clampNumber((value as { loopCount?: unknown }).loopCount, 1, 99, fallbackLoopCount))
    };
  }
  return {
    mode: "loop-count",
    loopCount: Math.round(clampNumber((value as { loopCount?: unknown }).loopCount, 1, 99, fallbackLoopCount)),
    fadeOutMs,
    durationMs: Math.round(clampNumber((value as { durationMs?: unknown }).durationMs, Math.max(1000, fadeOutMs), 60 * 60 * 1000, getStoredDurationMs(fallback, defaultPlaylistDurationMs)))
  };
}

function normalizePlaylistRuleForTrack(rule: PlaylistRule, track: BgmTrack | null): PlaylistRule {
  const fadeOutMs = Math.round(clampNumber(rule.fadeOutMs, 0, 120000, 0));
  const maxDurationMs = Math.max(1000, track?.loop ? 60 * 60 * 1000 : track?.durationMs ?? 60 * 60 * 1000);
  if (rule.mode === "straight") {
    return {
      mode: "straight",
      fadeOutMs,
      durationMs: Math.round(clampNumber(rule.durationMs, 1000, maxDurationMs, track?.durationMs ?? getStoredDurationMs(rule))),
      loopCount: getStoredLoopCount(rule)
    };
  }
  if (rule.mode === "duration") {
    const minimumDurationMs = track ? getPlaylistMinimumDurationMs(track, { ...rule, fadeOutMs } as PlaylistRule) : Math.max(1000, fadeOutMs);
    const durationMs = Math.round(clampNumber(rule.durationMs, minimumDurationMs, maxDurationMs, minimumDurationMs));
    return { mode: "duration", durationMs, fadeOutMs: Math.min(fadeOutMs, durationMs), loopCount: getStoredLoopCount(rule) };
  }
  const loopCount = Math.round(clampNumber(rule.loopCount, 1, 99, defaultPlaylistLoopCount));
  const fallbackDurationMs = Math.max(defaultPlaylistDurationMs, fadeOutMs, 1000);
  return {
    mode: "loop-count",
    loopCount,
    fadeOutMs,
    durationMs: Math.round(clampNumber(rule.durationMs, Math.max(1000, fadeOutMs), maxDurationMs, fallbackDurationMs))
  };
}

function isPlaylistRuleBackup(value: unknown): value is { trackId?: unknown; enabled?: unknown; rule?: unknown; note?: unknown } {
  return Boolean(value && typeof value === "object" && "rule" in value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampPercent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function waitForUiFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function createLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function formatElapsedSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}

function isSePopoverRange(target: HTMLElement): boolean {
  return target instanceof HTMLInputElement && target.type === "range" && Boolean(target.closest(".se-settings-popover"));
}

function onPlaylistRuleChangeForItem(
  item: PlaylistItem,
  track: BgmTrack,
  rule: PlaylistRule,
  onPlaylistItemChange: (id: string, patch: Partial<PlaylistItem>) => void
): void {
  onPlaylistItemChange(item.id, { rule: normalizePlaylistRuleForTrack(rule, track) });
}

function getPlaylistItemsTotalMs(items: PlaylistItem[], tracks: BgmTrack[]): number {
  return items.reduce((totalMs, item) => {
    const track = tracks.find((candidate) => candidate.id === item.trackId);
    if (!track) return totalMs;
    return totalMs + getPlaylistPlayMs(track, item.rule);
  }, 0);
}

function createListBuildExpIdentities(listId: string, expAmount: number): string[] {
  const safeAmount = Math.max(0, Math.floor(expAmount));
  if (!listId || safeAmount <= 0) return [];
  return Array.from({ length: safeAmount }, (_, index) => `list-build:${listId}:${index}`);
}

function createListRegistrationExpIdentities(listId: string, expAmount: number): string[] {
  const safeAmount = Math.max(0, Math.floor(expAmount));
  if (!listId || safeAmount <= 0) return [];
  const eventId = createLocalId();
  return Array.from({ length: safeAmount }, (_, index) => `list-register:${listId}:${eventId}:${index}`);
}

function createSePlaybackExpIdentities(key: SeKey, expAmount: number): string[] {
  const safeAmount = Math.max(0, Math.floor(expAmount));
  if (safeAmount <= 0) return [];
  const eventId = createLocalId();
  return Array.from({ length: safeAmount }, (_, index) => `se-play:${key}:${eventId}:${index}`);
}

function getPlaylistPlayMs(track: BgmTrack, rule: PlaylistRule): number {
  return calculatePlaylistPlayMs(track, rule);
}

function getPlaylistDurationInputMs(track: BgmTrack, rule: PlaylistRule): number {
  return calculatePlaylistDurationInputMs(track, rule);
}

function getPlaylistFadeMs(track: BgmTrack, rule: PlaylistRule): number {
  return calculatePlaylistFadeMs(track, rule);
}

function getPlaylistMinimumDurationMs(track: BgmTrack, rule: PlaylistRule): number {
  return calculatePlaylistMinimumDurationMs(track, rule);
}

function getRuleFadeMs(rule: PlaylistRule): number {
  return calculateRuleFadeMs(rule);
}

function getStoredLoopCount(rule: PlaylistRule): number {
  return Math.round(clampNumber(rule.loopCount, 1, 99, defaultPlaylistLoopCount));
}

function getStoredDurationMs(rule: PlaylistRule, fallbackMs = defaultPlaylistDurationMs): number {
  return Math.round(clampNumber(rule.durationMs, 1000, 60 * 60 * 1000, fallbackMs));
}

function getMinimumPlayTimeSeconds(track: BgmTrack, rule: PlaylistRule): number {
  return Math.max(1, Math.round(getPlaylistMinimumDurationMs(track, rule) / 1000));
}

function formatPlayTimeMinimumStatus(minimumSeconds: number, language: UiLanguage = "en"): string {
  return language === "ja"
    ? `Play時間はフェードアウトより長く設定してください（最小: ${minimumSeconds}秒）`
    : `Set Play time longer than Fade Out. Minimum: ${minimumSeconds}s.`;
}

function canUsePlayTimeSeconds(playTimeSeconds: number, track: BgmTrack, rule: PlaylistRule): boolean {
  return Number.isFinite(playTimeSeconds) && playTimeSeconds >= getMinimumPlayTimeSeconds(track, rule);
}

const playlistRuleModeOrder: Array<PlaylistRule["mode"]> = ["loop-count", "duration", "straight"];

function getAdjacentPlaylistRuleMode(mode: PlaylistRule["mode"], direction: -1 | 1): PlaylistRule["mode"] | null {
  const index = playlistRuleModeOrder.indexOf(mode);
  const next = playlistRuleModeOrder[index + direction];
  return next ?? null;
}

function getPlaylistRuleModeLabel(mode: PlaylistRule["mode"], t: Translator): string {
  if (mode === "loop-count") return t("loop");
  if (mode === "duration") return t("time");
  return t("straight");
}

function getPlaylistRuleModeTooltipKey(mode: PlaylistRule["mode"]): BuilderRuleTooltipKey {
  if (mode === "loop-count") return "loop";
  if (mode === "duration") return "time";
  return "straight";
}

function createPlaylistRuleForMode(mode: PlaylistRule["mode"], currentRule: PlaylistRule, track: BgmTrack): PlaylistRule {
  const fadeOutMs = getRuleFadeMs(currentRule);
  const loopCount = getStoredLoopCount(currentRule);
  const durationMs = getPlaylistDurationInputMs(track, currentRule);
  if (mode === "loop-count") {
    return { mode: "loop-count", loopCount, fadeOutMs, durationMs };
  }
  if (mode === "duration") {
    const maxDurationMs = track.loop ? 60 * 60 * 1000 : track.durationMs;
    const nextRule = { mode: "duration", durationMs, fadeOutMs, loopCount } as PlaylistRule;
    return { mode: "duration", durationMs: Math.max(getPlaylistMinimumDurationMs(track, nextRule), Math.min(maxDurationMs, durationMs)), fadeOutMs, loopCount };
  }
  return { mode: "straight", fadeOutMs, durationMs, loopCount };
}

function formatRule(rule: PlaylistRule, language: UiLanguage = "en"): string {
  if (rule.mode === "straight") return "Straight";
  if (rule.mode === "loop-count") {
    return language === "ja" ? `${rule.loopCount}ループ / Fade ${Math.round(rule.fadeOutMs / 1000)}s` : `${rule.loopCount} loops / fade ${Math.round(rule.fadeOutMs / 1000)}s`;
  }
  return language === "ja" ? `${Math.round(rule.durationMs / 1000)}s / Fade ${Math.round(rule.fadeOutMs / 1000)}s` : `${Math.round(rule.durationMs / 1000)}s / fade ${Math.round(rule.fadeOutMs / 1000)}s`;
}

function formatRuleForTrack(track: BgmTrack, rule: PlaylistRule, language: UiLanguage = "en"): string {
  return track.loop ? formatRule(rule, language) : "Straight";
}

function formatLoopConfidence(track: BgmTrack | null, language: UiLanguage = "en"): string {
  if (!track?.loop) return language === "ja" ? "ループなし" : "No loop";
  if (track.loop.confidence === null) return track.loop.source;
  return `${track.loop.confidence.toFixed(1)}%`;
}

function getLiveRuleText(track: BgmTrack, item: PlaylistItem, playback: PlaybackState, elapsedMs: number, language: UiLanguage = "en"): string {
  if (playback.mode !== "playlist" || item.rule.mode !== "loop-count" || !track.loop) {
    return formatRuleForTrack(track, item.rule, language);
  }
  const introMs = sampleToMs(track.loop.startSample, track.sampleRate);
  const loopMs = Math.max(1, sampleToMs(track.loop.lengthSamples, track.sampleRate));
  const current = Math.min(item.rule.loopCount, Math.max(1, Math.floor(Math.max(0, elapsedMs - introMs) / loopMs) + 1));
  return language === "ja" ? `Loop ${current}/${item.rule.loopCount}` : `Now loop ${current}/${item.rule.loopCount}`;
}

type BuilderRuleTooltipKey = "transition" | "loop" | "time" | "straight" | "loopCount" | "playTime" | "fade";

function getBuilderRuleTooltip(key: BuilderRuleTooltipKey, language: UiLanguage): string {
  const ja: Record<BuilderRuleTooltipKey, string> = {
    transition: "この曲をいつ次の曲へ送るかを決める設定です。Loop、Time、Straightを選びます。",
    loop: "検出されたループ区間を指定回数くり返してから次の曲へ進みます。",
    time: "指定した秒数だけ再生してから次の曲へ進みます。ループ曲は指定時間までループ再生します。",
    straight: "ループマーカーを無視して、音源を最初から最後まで1回だけ再生します。",
    loopCount: "Loop再生時のくり返し回数です。2ならループ区間を2周してから次へ進みます。",
    playTime: "Time再生時の再生秒数です。この秒数を再生したら次の曲へ進みます。",
    fade: "次の曲へ進む直前に音量を下げる秒数です。0ならフェードアウトしません。"
  };
  const en: Record<BuilderRuleTooltipKey, string> = {
    transition: "Decides when this song moves to the next song. Choose Loop, Time, or Straight.",
    loop: "Repeats the detected loop section for the chosen count, then advances.",
    time: "Plays for the chosen seconds, then advances. Looped songs keep looping until that time.",
    straight: "Ignores loop markers and plays the source from start to end once.",
    loopCount: "Repeat count for Loop mode. 2 means the loop section plays twice before advancing.",
    playTime: "Playback length for Time mode. The song advances after this many seconds.",
    fade: "Fade-out length before moving to the next song. 0 means no fade-out."
  };
  return language === "ja" ? ja[key] : en[key];
}

function makeVisualVars(brightness: number, maxBrightness = baseGamingnessMax): CSSProperties {
  const value = Math.max(0, Math.min(maxBrightness, brightness));
  const visualValue = value <= baseGamingnessMax ? value : Math.min(420, baseGamingnessMax + Math.log10(value - baseGamingnessMax + 1) * 52);
  const normalized = visualValue <= 50 ? visualValue / 50 : 1 + ((visualValue - 50) / 50) * 0.5;
  const oldEdgeRamp = Math.max(0, (Math.min(1, normalized) - 0.68) / 0.32);
  const extraEdgeRamp = Math.max(0, (normalized - 1) / 0.5);
  const gamingnessGlare = Math.min(3.4, Math.max(0, (visualValue - 70) / 30));
  const legacyPlayheadCapVisualValue = 70 + 30 * 3.4;
  const legacyPlayheadCapValue = baseGamingnessMax + Math.pow(10, (legacyPlayheadCapVisualValue - baseGamingnessMax) / 52) - 1;
  const extendedPlayheadProgress = clampUnit((value - legacyPlayheadCapValue) / legacyPlayheadCapValue);
  const extendedPlayheadMultiplier = 1 + extendedPlayheadProgress;
  const extendedPlayheadCapValue = legacyPlayheadCapValue * 2;
  const gamingnessEffectStrength = getGamingnessEffectStrength(value);
  const playheadGlowScale = clampUnit(value / baseGamingnessMax);
  const playheadIntensity = Math.min(2.6, Math.max(0, normalized + gamingnessGlare * 0.42));
  const legacyPlayheadGlowAlpha = clampUnit(0.12 + Math.min(1.7, normalized) * 0.24 + gamingnessGlare * 0.13);
  const legacyPlayheadAuraAlpha = clampUnit(0.1 + playheadIntensity * 0.18 + gamingnessGlare * 0.1);
  const legacyPlayheadGlowSpread = 5 + Math.min(1.8, normalized) * 13 + gamingnessGlare * 8;
  const legacyPlayheadAuraWidth = 5 + playheadIntensity * 5.8 + gamingnessGlare * 3.4;
  const legacyPlayheadAuraBlur = 1.2 + playheadIntensity * 1.4 + gamingnessGlare * 1.05;
  const playheadGlowAlpha = clampUnit((legacyPlayheadGlowAlpha + (1 - legacyPlayheadGlowAlpha) * extendedPlayheadProgress) * playheadGlowScale);
  const playheadAuraAlpha = clampUnit((legacyPlayheadAuraAlpha + (1 - legacyPlayheadAuraAlpha) * extendedPlayheadProgress) * playheadGlowScale);
  const playheadGlowSpread = legacyPlayheadGlowSpread * extendedPlayheadMultiplier;
  const playheadAuraWidth = legacyPlayheadAuraWidth * extendedPlayheadMultiplier;
  const playheadAuraBlur = legacyPlayheadAuraBlur * extendedPlayheadMultiplier;
  const playheadCoreWidth = 2.35 + Math.min(2.1, playheadIntensity) * 0.68;
  const playheadAxisAlpha = clampUnit(0.72 + Math.min(1.8, playheadIntensity) * 0.1);
  const playheadAxisWidth = 0.85 + Math.min(2, playheadIntensity) * 0.18;
  const waveformBreatheMaxAlpha = 0.58;
  const waveformBreatheMaxGlow = 42;
  const waveformBreatheAlpha = waveformBreatheMaxAlpha * gamingnessEffectStrength;
  const waveformBreatheGlow = waveformBreatheMaxGlow * gamingnessEffectStrength;
  return {
    "--accent-saturation": `${28 + normalized * 72}%`,
    "--accent-light": `${66 + normalized * 14}%`,
    "--accent-alpha": `${clampUnit(0.1 + normalized * 0.53)}`,
    "--glow-spread": `${2 + normalized * 19}px`,
    "--tap-spread": `${5 + normalized * 25}px`,
    "--edge-glow-alpha": `${oldEdgeRamp * 0.42 + extraEdgeRamp * 0.2}`,
    "--edge-glow-spread": `${oldEdgeRamp * 13 + extraEdgeRamp * 6}px`,
    "--gamingness-text-alpha": `${clampUnit(0.14 + normalized * 0.86)}`,
    "--gamingness-text-glow": `${normalized * 22}px`,
    "--gamingness-bar-alpha": `${clampUnit(0.22 + Math.min(1, normalized) * 0.5 + gamingnessGlare * 0.32)}`,
    "--gamingness-bar-glow": `${normalized * 16 + gamingnessGlare * 34}px`,
    "--gamingness-glare": `${gamingnessGlare}`,
    "--playhead-glow-alpha": `${playheadGlowAlpha}`,
    "--playhead-glow-spread": `${playheadGlowSpread}px`,
    "--playhead-aura-alpha": `${playheadAuraAlpha}`,
    "--playhead-aura-width": `${playheadAuraWidth}px`,
    "--playhead-aura-blur": `${playheadAuraBlur}px`,
    "--playhead-core-width": `${playheadCoreWidth}px`,
    "--playhead-axis-alpha": `${playheadAxisAlpha}`,
    "--playhead-axis-width": `${playheadAxisWidth}px`,
    "--waveform-breathe-alpha": `${waveformBreatheAlpha}`,
    "--waveform-breathe-glow": `${waveformBreatheGlow}px`,
    "--waveform-breathe-state": gamingnessEffectStrength > 0 ? "running" : "paused",
    "--ui-contrast": `${0.82 + Math.min(1, normalized) * 0.18}`
  } as CSSProperties;
}

function getGamingnessEffectStrength(value: number): number {
  if (value < baseGamingnessMax) return 0;
  const progress = clampUnit((value - baseGamingnessMax) / (gamingnessEffectMaxValue - baseGamingnessMax));
  return 0.1 + progress * 0.9;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function formatCompactNumber(value: number): string {
  const safeValue = Math.max(0, Number.isFinite(value) ? value : 0);
  if (safeValue < 10000) return String(Math.round(safeValue));
  const units = [
    { suffix: "T", value: 1_000_000_000_000 },
    { suffix: "B", value: 1_000_000_000 },
    { suffix: "M", value: 1_000_000 },
    { suffix: "K", value: 1_000 }
  ];
  const unit = units.find((entry) => safeValue >= entry.value);
  if (!unit) return String(Math.round(safeValue));
  const scaled = safeValue / unit.value;
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")}${unit.suffix}`;
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<App />);
