export type AudioFormat = "wav" | "aiff" | "ogg" | "mp3" | "flac" | "opus";

export type DetectionMode = "normal" | "deep";

export type TrackStatus =
  | "pending"
  | "processing"
  | "detected"
  | "low-confidence"
  | "no-loop"
  | "edited"
  | "warning"
  | "canceled"
  | "saved"
  | "error";

export interface DetectionSettings {
  mode: DetectionMode;
  matchWindowMs: number;
  matchThreshold: number;
  minimumLoopMs: number;
  loopCheckPrerollMs: number;
  autoDetectOnImport: boolean;
}

export interface LoopMarker {
  startSample: number;
  endSample: number;
  lengthSamples: number;
  confidence: number | null;
  source: "metadata" | "detected" | "manual";
}

export interface WaveformPeaks {
  resolution: number;
  channels: Array<{
    min: number[];
    max: number[];
  }>;
}

export interface FileRef {
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
  sha256: string;
}

export interface BgmTrack {
  id: string;
  filePath: string;
  fileName: string;
  file: FileRef;
  format: AudioFormat;
  sampleRate: number;
  bitDepth: number | null;
  channels: number;
  durationSamples: number;
  durationMs: number;
  volume: number;
  loop: LoopMarker | null;
  status: TrackStatus;
  validation: string;
  waveform: WaveformPeaks | null;
}

export type TrackInfo = BgmTrack;

export interface SeFile {
  id: string;
  filePath: string;
  fileName: string;
  file: FileRef;
  format: AudioFormat;
  sampleRate: number;
  channels: number;
  durationMs: number;
  waveform: WaveformPeaks | null;
}

export interface DetectionResult {
  id: string;
  loop: LoopMarker | null;
  status: TrackStatus;
  validation: string;
  waveform?: WaveformPeaks | null;
  sampleRate?: number;
  channels?: number;
  durationSamples?: number;
  durationMs?: number;
}

export interface ImportResult {
  tracks: BgmTrack[];
  errors: string[];
}

export interface SeImportResult {
  files: SeFile[];
  errors: string[];
}

export interface DroppedFileRef {
  name: string;
  path: string;
}

export type PlaylistRule =
  | { mode: "loop-count"; loopCount: number; fadeOutMs: number; durationMs?: number }
  | { mode: "duration"; durationMs: number; fadeOutMs: number; loopCount?: number }
  | { mode: "straight"; fadeOutMs: number; durationMs?: number; loopCount?: number };

export interface PlaylistItem {
  id: string;
  trackId: string;
  enabled: boolean;
  rule: PlaylistRule;
  note: string;
}

export type PlaylistEndBehavior = "repeat" | "stop";

export interface SavedPlaylist {
  id: string;
  name: string;
  rating: number;
  cumulativePlayMs: number;
  items: PlaylistItem[];
}

export type SeKey =
  | "Q"
  | "W"
  | "E"
  | "R"
  | "T"
  | "Y"
  | "U"
  | "I"
  | "O"
  | "P"
  | "A"
  | "S"
  | "D"
  | "F"
  | "G"
  | "H"
  | "J"
  | "K"
  | "L"
  | "Z"
  | "X"
  | "C"
  | "V"
  | "B"
  | "N"
  | "M";

export type SeIconId =
  | "generic"
  | "slash"
  | "hit"
  | "whoosh"
  | "fire"
  | "guard"
  | "spark"
  | "wind"
  | "rock"
  | "magic"
  | "heal"
  | "shock"
  | "step"
  | "item"
  | "alert";

export type AccentColorId = "red" | "green" | "blue" | "yellow" | "amber" | "violet" | "cyan" | "white";

export interface SeAssignment {
  key: SeKey;
  file: SeFile | null;
  iconId: SeIconId | null;
  iconSource: "none" | "inferred" | "manual";
  colorId: AccentColorId;
  volume: number;
  pan: number;
}

export interface SavedSeSet {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  voiceLimit: number;
  expTotal: number;
  assignments: SeAssignment[];
}

export interface MixSettings {
  masterGain: number;
  bgmGain: number;
  seGain: number;
  seVoiceLimit: number;
  outputLimiterEnabled: boolean;
}

export interface VisualSettings {
  accentBrightness: number;
  accentBrightnessBeforePotato: number;
  potatoMode: boolean;
  loadExpEnabled: boolean;
  loadExpIdentities: string[];
  loadExpOverflowCount: number;
  loadExpOverflowMode: boolean;
  analyzerBandsBeforePotato: number;
  analyzerFpsBeforePotato: number;
  analyzerBands: number;
  analyzerFps: number;
  analyzerAutoLevel: boolean;
  analyzerManualLevel: number;
}

export interface FileSettings {
  audioRootPath: string | null;
  missingFilePolicy: "ask";
}

export type UiLanguage = "ja" | "en";

export interface UiSettings {
  language: UiLanguage;
  mainPlaylistRatio: number;
  mainWaveformRatio: number;
  mainAnalyzerHeight: number;
  bigFontMode: boolean;
}

export interface GamingProject {
  schemaVersion: 1;
  updatedAt: string;
  selectedTrackId: string | null;
  bgmTracks: BgmTrack[];
  sourceHiddenTrackIds: string[];
  playlistCreated: boolean;
  playlistName: string;
  playlistRating: number;
  playlistCumulativePlayMs: number;
  activePlaylistId: string | null;
  playlistEndBehavior: PlaylistEndBehavior;
  playlist: PlaylistItem[];
  savedPlaylists: SavedPlaylist[];
  seAssignments: SeAssignment[];
  activeSeSetId: string | null;
  activeSeSetName: string | null;
  noActiveSeSetExpTotal: number;
  savedSeSets: SavedSeSet[];
  detection: DetectionSettings;
  mix: MixSettings;
  visual: VisualSettings;
  fileSettings: FileSettings;
  ui: UiSettings;
}

export interface SequenceFile {
  fileKind: "gaminglooper.sequence";
  schemaVersion: 1;
  exportedAt: string;
  playlist: SavedPlaylist;
  tracks: BgmTrack[];
  playlistEndBehavior: PlaylistEndBehavior;
}

export interface SeSetFile {
  fileKind: "gaminglooper.se-set";
  schemaVersion: 1;
  exportedAt: string;
  seSet: SavedSeSet;
}

export interface HashCheck {
  path: string;
  name: string;
  ok: boolean;
  before: string;
  after: string | null;
  error: string | null;
}
