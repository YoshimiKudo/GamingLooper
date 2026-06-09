import type { DetectionSettings, GamingProject, PlaylistItem } from "./types.js";
import { createDefaultSeAssignments } from "./seIcons.js";

export const defaultMix = {
  masterGain: 1,
  bgmGain: 1,
  seGain: 1,
  seVoiceLimit: 16,
  outputLimiterEnabled: true
};

export const defaultVisual = {
  accentBrightness: 50,
  accentBrightnessBeforePotato: 50,
  potatoMode: false,
  loadExpEnabled: false,
  loadExpIdentities: [],
  loadExpOverflowCount: 0,
  loadExpOverflowMode: false,
  analyzerBandsBeforePotato: 112,
  analyzerFpsBeforePotato: 30,
  analyzerBands: 112,
  analyzerFps: 30,
  analyzerAutoLevel: true,
  analyzerManualLevel: 1
};

export const normalDetectionSettings = {
  mode: "normal" as const,
  matchWindowMs: 1500,
  matchThreshold: 88,
  minimumLoopMs: 3000,
  loopCheckPrerollMs: 1000,
  autoDetectOnImport: true
};

export const legacyVgostDetectionSettings = {
  ...normalDetectionSettings,
  matchWindowMs: 5000,
  minimumLoopMs: 10000
};

export const previousVgostDetectionSettings = {
  ...normalDetectionSettings,
  matchWindowMs: 8000,
  matchThreshold: 78,
  minimumLoopMs: 30000
};

export const vgostDetectionSettings = {
  ...normalDetectionSettings,
  mode: "deep" as const,
  matchThreshold: 60,
  minimumLoopMs: 30000
};

export const deepDetectionSettings = {
  ...normalDetectionSettings,
  mode: "deep" as const
};

export const defaultDetectionSettings = vgostDetectionSettings;
export const defaultPlaylistLoopCount = 2;
export const defaultPlaylistDurationMs = 180000;
export const defaultPlaylistFadeOutMs = 8000;

export const defaultUi = {
  language: "ja" as const,
  mainPlaylistRatio: 38,
  mainWaveformRatio: 47,
  mainAnalyzerHeight: 156,
  bigFontMode: false
};

export function createEmptyProject(): GamingProject {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    selectedTrackId: null,
    bgmTracks: [],
    sourceHiddenTrackIds: [],
    playlistCreated: false,
    playlistName: "",
    playlistRating: 0,
    playlistCumulativePlayMs: 0,
    activePlaylistId: null,
    playlistEndBehavior: "repeat",
    playlist: [],
    savedPlaylists: [],
    seAssignments: createDefaultSeAssignments(),
    activeSeSetId: null,
    activeSeSetName: null,
    noActiveSeSetExpTotal: 0,
    savedSeSets: [],
    detection: defaultDetectionSettings,
    mix: defaultMix,
    visual: defaultVisual,
    fileSettings: {
      audioRootPath: null,
      missingFilePolicy: "ask"
    },
    ui: defaultUi
  };
}

export function makePlaylistItem(trackId: string, _index: number): PlaylistItem {
  return {
    id: cryptoLikeId(),
    trackId,
    enabled: true,
    rule: {
      mode: "loop-count",
      loopCount: defaultPlaylistLoopCount,
      fadeOutMs: defaultPlaylistFadeOutMs,
      durationMs: defaultPlaylistDurationMs
    },
    note: ""
  };
}

export function isVgostDetectionSettings(settings: DetectionSettings): boolean {
  return matchesDetectionSettings(settings, vgostDetectionSettings);
}

export function isLegacyVgostDetectionSettings(settings: DetectionSettings): boolean {
  return matchesDetectionSettings(settings, legacyVgostDetectionSettings) || matchesDetectionSettings(settings, previousVgostDetectionSettings);
}

function matchesDetectionSettings(settings: DetectionSettings, preset: DetectionSettings): boolean {
  return (
    settings.mode === preset.mode &&
    settings.matchWindowMs === preset.matchWindowMs &&
    settings.matchThreshold === preset.matchThreshold &&
    settings.minimumLoopMs === preset.minimumLoopMs &&
    settings.loopCheckPrerollMs === preset.loopCheckPrerollMs
  );
}

function cryptoLikeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
