import type { UiLanguage } from "../shared/types.js";

export type TextKey =
  | "main"
  | "playlist"
  | "listBuilder"
  | "config"
  | "help"
  | "shortcuts"
  | "undo"
  | "redo"
  | "importBgm"
  | "track"
  | "stop"
  | "previousTrack"
  | "nextTrack"
  | "sequencerEndMode"
  | "sequencerRepeat"
  | "sequencerOneShot"
  | "oneShot"
  | "nowPlaying"
  | "noBgmSelected"
  | "bgmPlaylist"
  | "sequenceStars"
  | "songCount"
  | "totalLength"
  | "cumulativePlayTime"
  | "notCreated"
  | "tracks"
  | "createPlaylist"
  | "bgmReady"
  | "playlistEmpty"
  | "mix"
  | "outputLimiter"
  | "outputLimiterCopy"
  | "visual"
  | "gamingAccent"
  | "max"
  | "gamingnessNote"
  | "analyzer"
  | "fileSettings"
  | "display"
  | "language"
  | "lookMeter"
  | "filesSave"
  | "interface"
  | "performance"
  | "potatoMode"
  | "potatoModeCopy"
  | "expLvMode"
  | "expLvModeCopy"
  | "bigFontMode"
  | "bigFontModeCopy"
  | "overflowMode"
  | "overflowCounter"
  | "appState"
  | "savePath"
  | "saveDataTitle"
  | "saveDataDescription"
  | "saveDataStores"
  | "saveDataDoesNotStore"
  | "sequenceSaveLocationTitle"
  | "sequenceSaveLocationDescription"
  | "sequenceSaveLocationStores"
  | "seSetSaveLocationTitle"
  | "seSetSaveLocationDescription"
  | "seSetSaveLocationStores"
  | "selectSaveLocation"
  | "changeSaveLocation"
  | "openSaveFolder"
  | "exportBackup"
  | "importBackup"
  | "pathNotSelected"
  | "backupTools"
  | "backupToolsDescription"
  | "select"
  | "localOnly"
  | "autoLoop"
  | "runOnImport"
  | "preset"
  | "vgost"
  | "normal"
  | "deep"
  | "custom"
  | "presetDesignIntent"
  | "vgostPresetDescription"
  | "normalPresetDescription"
  | "deepPresetDescription"
  | "customPresetDescription"
  | "matchWindow"
  | "requiredMatch"
  | "minimumLoop"
  | "loopCheckPreroll"
  | "detail"
  | "fps"
  | "autoLevel"
  | "displayLevel"
  | "meterControls"
  | "analyzerDetail"
  | "analyzerFps"
  | "analyzerLevel"
  | "analyzerOptions"
  | "projectSaved"
  | "projectLoaded"
  | "projectInitialized"
  | "projectLoading"
  | "saved"
  | "unsaved"
  | "ready"
  | "sePadAssign"
  | "currentSePad"
  | "activeVoices"
  | "seReady"
  | "seVoiceLimit"
  | "seSet"
  | "noActiveSeSet"
  | "globalControl"
  | "saveSeSet"
  | "loadSeSet"
  | "exportSeSet"
  | "importSeSet"
  | "savedSeSetGroup"
  | "seSetFileGroup"
  | "resetClearGroup"
  | "seSetName"
  | "seSetDescription"
  | "seTooltipSaveSet"
  | "seTooltipLoadSet"
  | "seTooltipImportSet"
  | "seTooltipExportSet"
  | "seTooltipDefault"
  | "seTooltipClearAll"
  | "seTooltipVoiceLimit"
  | "seTooltipAllVolumeTrim"
  | "seTooltipVolume"
  | "seTooltipPan"
  | "noSeSets"
  | "saveSeSetMessage"
  | "loadSeSetMessage"
  | "volume"
  | "pan"
  | "load"
  | "allVolumeTrim"
  | "allPanShift"
  | "dragVertical"
  | "dragHorizontal"
  | "reset"
  | "apply"
  | "resetSeVolumeMessage"
  | "resetSePanMessage"
  | "resetSeKeepDetail"
  | "clearSeAssignmentsMessage"
  | "clearSeAssignmentsDetail"
  | "notSet"
  | "default"
  | "clearAll"
  | "buildPlaylist"
  | "list"
  | "exportSequence"
  | "importSequence"
  | "savedCount"
  | "songs"
  | "total"
  | "cumulative"
  | "noListBuilt"
  | "updateSequenceData"
  | "sequenceUpdatePendingTitle"
  | "sequenceUpdatePendingMessage"
  | "sequenceUpdatePendingDetail"
  | "sequenceUnsavedCloseMessage"
  | "sequenceUnsavedCloseDetail"
  | "closeWithoutSequenceUpdate"
  | "buildSequenceInstruction"
  | "buildSequencer"
  | "listName"
  | "repeat"
  | "saveAs"
  | "overwrite"
  | "loop"
  | "time"
  | "straight"
  | "loops"
  | "playTime"
  | "fade"
  | "transitionCondition"
  | "loopCountTimes"
  | "playTimeSeconds"
  | "fadeOutSeconds"
  | "playTimeMustExceedFade"
  | "performanceTime"
  | "bulkSequenceRules"
  | "applyLoopCountAll"
  | "applyPlayTimeAll"
  | "applyFadeOutAll"
  | "bulkApplyConfirmTitle"
  | "bulkApplyConfirmMessage"
  | "noSequenceSongs"
  | "addSongFromSource"
  | "songsReady"
  | "sequenceEmpty"
  | "completeSequenceHelp"
  | "completeSequence"
  | "clearSequence"
  | "clearSequenceConfirmMessage"
  | "clearSequenceConfirmDetail"
  | "bgmSource"
  | "files"
  | "dropSongsHere"
  | "allBgmInSequencer"
  | "importBgmToStart"
  | "addSong"
  | "sourceSearchPlaceholder"
  | "noSourceSearchResults"
  | "sourceClear"
  | "sourceClearConfirmMessage"
  | "sourceClearConfirmDetail"
  | "clear"
  | "scanning"
  | "nowScanning"
  | "scanWaiting"
  | "looped"
  | "nonLooped"
  | "detectSelected"
  | "save"
  | "build"
  | "copyRules"
  | "pasteRules"
  | "applyRuleAll"
  | "applyFadeAll"
  | "moveUp"
  | "moveDown"
  | "confidence"
  | "enabled";

type TextMap = Record<TextKey, string>;

const en: TextMap = {
  main: "Main",
  playlist: "Play Sequencer",
  listBuilder: "SEQUENCE\nBUILDER",
  config: "Config",
  help: "Help",
  shortcuts: "Shortcuts",
  undo: "Undo",
  redo: "Redo",
  importBgm: "Import BGM",
  track: "Track",
  stop: "Stop",
  previousTrack: "Previous song",
  nextTrack: "Next song",
  nowPlaying: "NOW PLAYING",
  noBgmSelected: "No BGM selected",
  sequencerEndMode: "Sequencer playback mode",
  sequencerRepeat: "Repeat Sequence",
  sequencerOneShot: "One Shot Sequencer",
  oneShot: "One Shot",
  bgmPlaylist: "Sequencer Play List",
  sequenceStars: "Sequence Stars",
  songCount: "Songs",
  totalLength: "Total Length",
  cumulativePlayTime: "Cumulative Play Time",
  notCreated: "not created",
  tracks: "tracks",
  createPlaylist: "Build Sequence List",
  bgmReady: "BGM ready",
  playlistEmpty: "BGM files appear here after import.",
  mix: "Mix",
  outputLimiter: "Limiter",
  outputLimiterCopy: "Catches output peaks to reduce clipping when BGM and multiple SE overlap.",
  visual: "Visual",
  gamingAccent: "gaming accent",
  max: "MAX",
  gamingnessNote: "0% keeps the glow nearly white. Higher values increase color, UI contrast, spread, and tap response.",
  analyzer: "Analyzer",
  fileSettings: "File Settings",
  display: "Display",
  language: "Language",
  lookMeter: "Look & Meter / Mode Select",
  filesSave: "Files & Save",
  interface: "Interface",
  performance: "Performance",
  potatoMode: "Potato Mode",
  potatoModeCopy: "Cuts visual and audio load For our Green Planet.",
  expLvMode: "EXP/LV Mode",
  expLvModeCopy: "Experience brings a brighter gaming light.",
  bigFontMode: "Big Font Mode",
  bigFontModeCopy: "Larger text with a visibility-first layout.",
  overflowMode: "Overflow Mode",
  overflowCounter: "Overflow Counter",
  appState: "App State",
  savePath: "Save Path",
  saveDataTitle: "Project Save Location",
  saveDataDescription: "This is where GamingLooper saves the full work state: Sequence List, saved SE Sets, ratings, cumulative play time, SE assignments, mix, and config values.",
  saveDataStores: "Stores Sequence Lists, saved SE Sets, and app state.",
  saveDataDoesNotStore: "Does not copy or move audio files.",
  sequenceSaveLocationTitle: "Sequence Save Location",
  sequenceSaveLocationDescription: "Default folder for Sequence files exported or imported as .glseq. Use this for carrying only the Lists you need between projects.",
  sequenceSaveLocationStores: "Uses .glseq files.",
  seSetSaveLocationTitle: "SE Set Save Location",
  seSetSaveLocationDescription: "Default folder for SE Pad sets exported or imported as .glset. Use this for switching key assignments and sound sets.",
  seSetSaveLocationStores: "Uses .glset files.",
  selectSaveLocation: "Select Save Location",
  changeSaveLocation: "Change Save Location",
  openSaveFolder: "Open Save Folder",
  exportBackup: "Save Settings",
  importBackup: "Load Settings",
  pathNotSelected: "Not selected",
  backupTools: "GamingLooper Settings Save",
  backupToolsDescription: "Save or load the current GamingLooper settings and work state. Audio files remain external and are not bundled into this data.",
  select: "Select",
  localOnly: "local only",
  autoLoop: "Auto Loop",
  runOnImport: "Run on Import",
  preset: "Preset",
  vgost: "VGTDEEP",
  normal: "Normal",
  deep: "Deep",
  custom: "Custom",
  presetDesignIntent: "Design intent",
  vgostPresetDescription: "VGTDEEP for video game soundtracks. Uses Deep detection with a 30s minimum loop and a 60% acceptance line to stay near the 10s-per-track target.",
  normalPresetDescription: "Lightweight general detection. Use it when the loop is obvious, the track is short, or you want a quick first pass.",
  deepPresetDescription: "Wider, slower search for difficult loops. Try it when Normal misses candidates, while treating the result as a candidate to check by ear.",
  customPresetDescription: "Your current manual detection values. Use it when one track needs tuned window, threshold, minimum loop, or check-preroll settings.",
  matchWindow: "Window",
  requiredMatch: "Threshold",
  minimumLoop: "Minimum Loop",
  loopCheckPreroll: "Check Preroll",
  detail: "Detail",
  fps: "FPS",
  autoLevel: "Auto Leveling",
  displayLevel: "Display Level",
  meterControls: "Meter Controls",
  analyzerDetail: "Analyzer Detail",
  analyzerFps: "Analyzer FPS",
  analyzerLevel: "Analyzer Level",
  analyzerOptions: "Analyzer Options",
  projectSaved: "App state saved.",
  projectLoaded: "App state loaded.",
  projectInitialized: "App state initialized. Save to keep this state.",
  projectLoading: "Loading project",
  saved: "Saved",
  unsaved: "Unsaved changes",
  ready: "Ready",
  sePadAssign: "SE Pad Control",
  currentSePad: "Current SE Pad",
  activeVoices: "Active voices",
  seReady: "SE Ready",
  seVoiceLimit: "SE Voice Limit",
  seSet: "SE Set",
  noActiveSeSet: "No SE Set loaded",
  globalControl: "Global Control",
  saveSeSet: "Save SE Set",
  loadSeSet: "Load SE Set",
  exportSeSet: "Export .glset",
  importSeSet: "Import .glset",
  savedSeSetGroup: "Saved SE Sets",
  seSetFileGroup: "SE Set Files",
  resetClearGroup: "Reset / Clear",
  seSetName: "SE Set name",
  seSetDescription: "Save each key's SE file, volume, pan, icon, color, and voice limit as one set. Select a saved set to load it into the SE Pad.",
  seTooltipSaveSet: "Save the current SE Pad state as a .glset file.",
  seTooltipLoadSet: "Load a .glset file into the SE Pad. Current assignments will be overwritten.",
  seTooltipImportSet: "Import an SE Set from a .glset file and add it to the saved SE Sets.",
  seTooltipExportSet: "Export the selected SE Set as a .glset file.",
  seTooltipDefault: "Return the SE Pad settings to their default state.",
  seTooltipClearAll: "Remove every SE assignment from the SE Pad.",
  seTooltipVoiceLimit: "Maximum number of SE voices that can play at the same time.",
  seTooltipAllVolumeTrim: "Adjust the volume of all assigned SE keys together.",
  seTooltipVolume: "Adjust SE volume.",
  seTooltipPan: "Adjust left-right SE position.",
  noSeSets: "No SE Set saved",
  saveSeSetMessage: "Save the current SE Pad state as an SE Set.",
  loadSeSetMessage: "Load this SE Set into the SE Pad?",
  volume: "Volume",
  pan: "PAN",
  load: "Load",
  allVolumeTrim: "All Volume Trim",
  allPanShift: "All PAN Shift",
  dragVertical: "drag vertical",
  dragHorizontal: "drag horizontal",
  reset: "Reset",
  apply: "Apply",
  resetSeVolumeMessage: "Reset all SE volume values to 100%.",
  resetSePanMessage: "Reset all SE PAN values to center.",
  resetSeKeepDetail: "This keeps the assigned SE files and icons.",
  clearSeAssignmentsMessage: "Clear all SE assignments?",
  clearSeAssignmentsDetail: "This removes loaded SE files and icon selections from every key.",
  notSet: "Not set",
  default: "Default",
  clearAll: "Clear All",
  buildPlaylist: "Build Play List",
  list: "Sequence List",
  exportSequence: "Export",
  importSequence: "Import Sequence",
  savedCount: "saved",
  songs: "songs",
  total: "Total",
  cumulative: "Cumulative",
  noListBuilt: "No list loaded",
  updateSequenceData: "Update Seq Data",
  sequenceUpdatePendingTitle: "Sequence changes pending",
  sequenceUpdatePendingMessage: "The current Sequence has changes that are not reflected in the saved List. Update the List before closing?",
  sequenceUpdatePendingDetail: "Update rewrites the active saved List with the current Sequence. Close Without Update keeps the saved List unchanged.",
  sequenceUnsavedCloseMessage: "This Sequence is not mounted into the Sequence List yet. Close without saving it as a List?",
  sequenceUnsavedCloseDetail: "The current app state can still be saved, but this Sequence will not become a playable saved List until Complete & Save Sequence is used.",
  closeWithoutSequenceUpdate: "Close Without Update",
  buildSequenceInstruction: "Build a sequence, then press Complete & Save Sequence.",
  buildSequencer: "Build Sequencer",
  listName: "List name",
  repeat: "Repeat",
  saveAs: "Save As",
  overwrite: "Overwrite",
  loop: "Loop",
  time: "Time",
  straight: "Straight",
  loops: "Loops",
  playTime: "Play Time",
  fade: "Fade",
  transitionCondition: "Transition Condition",
  loopCountTimes: "Loop Count (times)",
  playTimeSeconds: "Play Time (sec)",
  fadeOutSeconds: "Fade Out (sec)",
  playTimeMustExceedFade: "Set Play time longer than Fade Out.",
  performanceTime: "Performance Time",
  bulkSequenceRules: "Bulk Edit",
  applyLoopCountAll: "Apply Loop Count",
  applyPlayTimeAll: "Apply Play Time",
  applyFadeOutAll: "Apply Fade Out",
  bulkApplyConfirmTitle: "Apply bulk change?",
  bulkApplyConfirmMessage: "Apply this value?",
  noSequenceSongs: "No song loaded in Sequencer",
  addSongFromSource: "Add Song from BGM Source to build the sequence.",
  songsReady: "songs ready",
  sequenceEmpty: "Sequence is empty",
  completeSequenceHelp: "Save the current Sequence as a file, then mount it to List.",
  completeSequence: "Complete & Save Sequence",
  clearSequence: "Clear Sequence",
  clearSequenceConfirmMessage: "Clear the current Sequence?",
  clearSequenceConfirmDetail: "BGM Source and saved Lists are not deleted. Only the songs currently placed in Build Sequencer are removed.",
  bgmSource: "BGM Source",
  files: "files",
  dropSongsHere: "Drop songs here",
  allBgmInSequencer: "All BGM files are already in Build Sequencer.",
  importBgmToStart: "Import BGM files to start building.",
  addSong: "Add Song",
  sourceSearchPlaceholder: "Search BGM Source",
  noSourceSearchResults: "No matching songs",
  sourceClear: "Source Clear",
  sourceClearConfirmMessage: "Clear the displayed BGM Source files?",
  sourceClearConfirmDetail: "Build Sequencer and saved Lists are not changed. Files already used by saved Lists are kept.",
  clear: "Clear",
  scanning: "Scanning",
  nowScanning: "Now Scanning",
  scanWaiting: "Waiting",
  looped: "Looped",
  nonLooped: "Non Looped",
  detectSelected: "選択曲を検出",
  save: "Save",
  build: "Build",
  copyRules: "Copy Rules",
  pasteRules: "Paste Rules",
  applyRuleAll: "Apply Rule to All",
  applyFadeAll: "Apply Fade to All",
  moveUp: "Move Up",
  moveDown: "Move Down",
  confidence: "Confidence",
  enabled: "Enabled"
};

const ja: TextMap = {
  main: "Main",
  playlist: "Play Sequencer",
  listBuilder: "SEQUENCE\nBUILDER",
  config: "Config",
  help: "Help",
  shortcuts: "ショートカット一覧",
  undo: "元に戻す",
  redo: "やり直し",
  importBgm: "BGM読込",
  track: "単曲",
  stop: "停止",
  previousTrack: "前の曲へ",
  nextTrack: "次の曲へ",
  nowPlaying: "再生中",
  noBgmSelected: "BGM未選択",
  sequencerEndMode: "Sequencer再生モード",
  sequencerRepeat: "Repeat Sequence",
  sequencerOneShot: "SequencerをOne Shot再生",
  oneShot: "One Shot",
  bgmPlaylist: "Sequencer Play List",
  sequenceStars: "Sequence Stars",
  songCount: "楽曲数",
  totalLength: "トータルの長さ",
  cumulativePlayTime: "累計再生時間",
  notCreated: "未作成",
  tracks: "曲",
  createPlaylist: "Build Sequence List",
  bgmReady: "BGM準備済み",
  playlistEmpty: "BGMを読み込むとここに表示されます。",
  mix: "Mix",
  outputLimiter: "Limiter",
  outputLimiterCopy: "BGMと複数SEが重なったときのピークを抑えて、音割れを防ぎます。",
  visual: "Visual",
  gamingAccent: "ゲーミング度",
  max: "上限",
  gamingnessNote: "0%では白に近い控えめな発光。値を上げると色、UIコントラスト、拡散、タップ反応が強くなります。",
  analyzer: "Analyzer",
  fileSettings: "File Settings",
  display: "Display",
  language: "Language",
  lookMeter: "Look & Meter / Mode Select",
  filesSave: "Files & Save",
  interface: "Interface",
  performance: "Performance",
  potatoMode: "Potato Mode",
  potatoModeCopy: "Cuts visual and audio load For our Green Planet.",
  expLvMode: "EXP/LV Mode",
  expLvModeCopy: "Experience brings a brighter gaming light.",
  bigFontMode: "BIG FONT Mode",
  bigFontModeCopy: "Larger text with a visibility-first layout.",
  overflowMode: "Overflow Mode",
  overflowCounter: "Overflow Counter",
  appState: "App State",
  savePath: "保存先",
  saveDataTitle: "Project 保存先",
  saveDataDescription: "Sequence List、保存済みSE Set、評価、累計再生時間、SE割り当て、Mix、Configなど、GamingLooper全体の作業状態を保存する場所です。",
  saveDataStores: "Sequence List、保存済みSE Set、アプリ状態を保存します。",
  saveDataDoesNotStore: "音声ファイル本体はコピー・移動しません。",
  sequenceSaveLocationTitle: "Sequence 保存先",
  sequenceSaveLocationDescription: ".glseq で書き出し・読み込みするSequenceファイルの既定フォルダです。必要なListだけを別プロジェクトへ持ち出す用途です。",
  sequenceSaveLocationStores: ".glseq ファイルを扱います。",
  seSetSaveLocationTitle: "SE Set 保存先",
  seSetSaveLocationDescription: ".glset で書き出し・読み込みするSE Padセットの既定フォルダです。キー割り当てや鳴らし分けセットを切り替える用途です。",
  seSetSaveLocationStores: ".glset ファイルを扱います。",
  selectSaveLocation: "保存先を選択",
  changeSaveLocation: "保存先を変更",
  openSaveFolder: "保存場所を開く",
  exportBackup: "設定の保存",
  importBackup: "設定の読み込み",
  pathNotSelected: "未選択",
  backupTools: "GamingLooper の設定の保存",
  backupToolsDescription: "現在のGamingLooper設定と作業状態を保存・読み込みします。音声ファイル本体は外部ファイルのままで、このデータには同梱されません。",
  select: "選択",
  localOnly: "ローカル保存",
  autoLoop: "Auto Loop",
  runOnImport: "読込時に実行",
  preset: "Preset",
  vgost: "VGTDEEP",
  normal: "Normal",
  deep: "Deep",
  custom: "Custom",
  presetDesignIntent: "設計志向",
  vgostPresetDescription: "ゲームOST向けのVGTDEEPです。Deep検出を基準に、最短ループ30秒・採用ライン60%で1曲10秒以内を狙います。",
  normalPresetDescription: "軽量な一般検出です。ループが分かりやすい曲、短い素材、まず短時間で候補を見たい時に使います。",
  deepPresetDescription: "時間をかけて難しいループを広めに探索します。Normalで候補が出にくい曲に使い、最後は耳で確認する前提のモードです。",
  customPresetDescription: "現在の手動調整値です。特定の曲に合わせて照合区間、必要一致率、最短ループ、確認開始位置を詰める時に使います。",
  matchWindow: "照合区間",
  requiredMatch: "必要一致率",
  minimumLoop: "最短ループ",
  loopCheckPreroll: "ループ確認開始位置",
  detail: "細かさ",
  fps: "更新FPS",
  autoLevel: "Auto Leveling",
  displayLevel: "表示レベル",
  meterControls: "Meter Controls",
  analyzerDetail: "Analyzer Detail",
  analyzerFps: "Analyzer FPS",
  analyzerLevel: "Analyzer Level",
  analyzerOptions: "Analyzer Options",
  projectSaved: "アプリ状態を保存しました。",
  projectLoaded: "アプリ状態をロードしました。",
  projectInitialized: "アプリ状態を初期化しました。保存するとこの状態が保持されます。",
  projectLoading: "プロジェクト読込中",
  saved: "保存済み",
  unsaved: "未保存の変更",
  ready: "Ready",
  sePadAssign: "SE Pad Control",
  currentSePad: "Current SE Pad",
  activeVoices: "同時発音",
  seReady: "SE Ready",
  seVoiceLimit: "SE Voice Limit",
  seSet: "SE Set",
  noActiveSeSet: "No SE Set loaded",
  globalControl: "Global Control",
  saveSeSet: "Save SE Set",
  loadSeSet: "Load SE Set",
  exportSeSet: "Export .glset",
  importSeSet: "Import .glset",
  savedSeSetGroup: "Saved SE Sets",
  seSetFileGroup: "SE Set Files",
  resetClearGroup: "Reset / Clear",
  seSetName: "SE Set名",
  seSetDescription: "各キーのSEファイル、Vol、Pan、アイコン、色、Voice Limitをまとめて保存します。保存済みセットを選ぶとSE Padへ呼び出せます。",
  seTooltipSaveSet: "現在のSE Pad状態を .glset ファイルとして保存します。",
  seTooltipLoadSet: ".glset ファイルをSE Padへ読み込みます。現在の割り当ては上書きされます。",
  seTooltipImportSet: ".glset ファイルからSE Setを読み込み、保存済みSE Setに追加します。",
  seTooltipExportSet: "選択中のSE Setを .glset ファイルとして書き出します。",
  seTooltipDefault: "SE Pad設定をデフォルト状態に戻します。",
  seTooltipClearAll: "すべてのSE割り当てを解除します。",
  seTooltipVoiceLimit: "同時に鳴らせるSEの最大数です。",
  seTooltipAllVolumeTrim: "割り当て済みSE全体の音量をまとめて調整します。",
  seTooltipVolume: "SEの音量を調整します。",
  seTooltipPan: "SEの左右定位を調整します。",
  noSeSets: "保存済みSE Setなし",
  saveSeSetMessage: "現在のSE Pad状態をSE Setとして保存します。",
  loadSeSetMessage: "このSE SetをSE Padへ呼び出しますか？",
  volume: "Volume",
  pan: "PAN",
  load: "Load",
  allVolumeTrim: "All Volume Trim",
  allPanShift: "All PAN Shift",
  dragVertical: "上下ドラッグ",
  dragHorizontal: "左右ドラッグ",
  reset: "リセット",
  apply: "適用",
  resetSeVolumeMessage: "全SEのVolumeを100%に戻します。",
  resetSePanMessage: "全SEのPANを中央に戻します。",
  resetSeKeepDetail: "割り当て済みのSEファイルとアイコンは維持されます。",
  clearSeAssignmentsMessage: "全SE割り当てを解除しますか？",
  clearSeAssignmentsDetail: "すべてのキーからSEファイルとアイコン選択を削除します。",
  notSet: "未設定",
  default: "Default",
  clearAll: "Clear All",
  buildPlaylist: "Build Play List",
  list: "Sequence List",
  exportSequence: "書き出し",
  importSequence: "Sequence読み込み",
  savedCount: "saved",
  songs: "曲",
  total: "合計",
  cumulative: "累計",
  noListBuilt: "No list loaded",
  updateSequenceData: "Seqデータ更新",
  sequenceUpdatePendingTitle: "Sequenceに未更新の変更があります",
  sequenceUpdatePendingMessage: "現在のSequenceに、保存済みListへ反映されていない変更があります。閉じる前にListを更新しますか？",
  sequenceUpdatePendingDetail: "更新すると、アクティブな保存済みListを現在のSequenceで上書きします。更新しない場合、保存済みListの内容はそのままです。",
  sequenceUnsavedCloseMessage: "このSequenceはまだSequence Listへ登録されていません。List化せずに閉じますか？",
  sequenceUnsavedCloseDetail: "アプリ状態としては保存できますが、Complete & Save Sequenceを実行するまでMain Viewで再生できる保存済みListにはなりません。",
  closeWithoutSequenceUpdate: "更新せず閉じる",
  buildSequenceInstruction: "曲順を組んでから Complete & Save Sequence を押してください。",
  buildSequencer: "Build Sequencer",
  listName: "List名",
  repeat: "Repeat",
  saveAs: "別名保存",
  overwrite: "上書き保存",
  loop: "Loop",
  time: "Time",
  straight: "Straight",
  loops: "ループ数",
  playTime: "再生時間",
  fade: "Fade",
  transitionCondition: "遷移条件",
  loopCountTimes: "Loop数（回）",
  playTimeSeconds: "Play時間（秒）",
  fadeOutSeconds: "フェードアウト秒数",
  playTimeMustExceedFade: "Play時間はフェードアウトより長く設定してください",
  performanceTime: "演奏時間",
  bulkSequenceRules: "一括変更",
  applyLoopCountAll: "Loop数を一括適用",
  applyPlayTimeAll: "Play時間を一括適用",
  applyFadeOutAll: "フェードアウトを一括適用",
  bulkApplyConfirmTitle: "一括変更してよろしいですか",
  bulkApplyConfirmMessage: "この値を適用します。",
  noSequenceSongs: "No song loaded in Sequencer",
  addSongFromSource: "BGM SourceからAdd SongしてSequenceを組み立てます。",
  songsReady: "曲準備済み",
  sequenceEmpty: "Sequenceは空です",
  completeSequenceHelp: "現在のSequenceを実ファイルとして保存し、保存できた場合だけListに登録します。",
  completeSequence: "Complete & Save Sequence",
  clearSequence: "Clear Sequence",
  clearSequenceConfirmMessage: "現在のSequenceを空にしますか？",
  clearSequenceConfirmDetail: "BGM Sourceと保存済みListは削除されません。Build Sequencer内の曲だけを取り除きます。",
  bgmSource: "BGM Source",
  files: "files",
  dropSongsHere: "Drop songs here",
  allBgmInSequencer: "すべてのBGMはBuild Sequencerに入っています。",
  importBgmToStart: "BGMを読み込むと組み立てを開始できます。",
  addSong: "Add Song",
  sourceSearchPlaceholder: "BGM Sourceを検索",
  noSourceSearchResults: "該当する曲がありません",
  sourceClear: "Source Clear",
  sourceClearConfirmMessage: "表示中のBGM Sourceファイルをクリアしますか？",
  sourceClearConfirmDetail: "Build Sequencerと保存済みListは変更されません。保存済みListで使用中のファイルは保持されます。",
  clear: "Clear",
  scanning: "Scanning",
  nowScanning: "Now Scanning",
  scanWaiting: "Waiting",
  looped: "Looped",
  nonLooped: "Non Looped",
  detectSelected: "Detect Selected",
  save: "保存",
  build: "Build",
  copyRules: "ルールコピー",
  pasteRules: "ルール貼付",
  applyRuleAll: "全曲へ適用",
  applyFadeAll: "Fadeを全曲へ適用",
  moveUp: "上へ",
  moveDown: "下へ",
  confidence: "信頼度",
  enabled: "有効"
};

export type Translator = (key: TextKey) => string;

export function createTranslator(language: UiLanguage): Translator {
  const table = language === "en" ? en : ja;
  return (key) => table[key] ?? en[key] ?? key;
}

export function translateStatus(value: string, language: UiLanguage): string {
  if (language === "en") return value;
  const fixed: Record<string, string> = {
    Ready: ja.ready,
    "App state saved.": ja.projectSaved,
    "App state loaded.": ja.projectLoaded,
    "App state initialized. Save to keep this state.": ja.projectInitialized,
    Stopped: "停止しました。"
  };
  return fixed[value] ?? value;
}

export function getHelpSections(language: UiLanguage): Array<{ title: string; body: string[] }> {
  if (language === "en") {
    return [
      {
        title: "Project Model",
        body: [
          "GamingLooper is non-destructive. Loop markers, playlist rules, SE assignments, mix, and visual settings are kept in a local project file.",
          "Audio files are referenced by path and hash. The app does not write loop metadata into the audio files."
        ]
      },
      {
        title: "BGM / Play List",
        body: [
          "BGM playback is one stream. Importing BGM can run Auto Loop for the imported track when Run on Import is enabled.",
          "Build Play List enables playlist playback. Each row can use loop count or duration with a fade before the next track."
        ]
      },
      {
        title: "SE Pad",
        body: [
          "SE keys are multi-voice. The voice limit uses late-trigger priority when the limit is reached.",
          "Shift+click unloads a key. The red lamp opens volume, PAN, and load controls. Mouse wheel changes the icon, and right-click opens the icon list."
        ]
      },
      {
        title: "Analyzer",
        body: [
          "The analyzer compares BGM and SE buses. Orange overlap indicates possible band interference; darker orange means stronger SE dominance in the overlap.",
          "Frequency labels are logarithmic so the collision band can be judged directly."
        ]
      }
    ];
  }
  return [
    {
      title: "プロジェクト仕様",
      body: [
        "GamingLooper は非破壊です。ループマーカー、プレイリストルール、SE割り当て、Mix、Visual はローカルのプロジェクトファイルに保存します。",
        "音声ファイルはパスとハッシュで参照します。音声ファイル自体へループ情報を書き込みません。"
      ]
    },
    {
      title: "BGM / Play List",
      body: [
        "BGMは基本1系統再生です。Config の Run on Import が有効な場合、BGM読込時にその曲だけ Auto Loop が走ります。",
        "Build Play List を実行すると Play List 再生が有効になります。各曲はループ回数または秒数指定で、次曲前に Fade を入れられます。"
      ]
    },
    {
      title: "SE Pad",
      body: [
        "SEは複数同時発音します。同時発音上限に達した場合は後発優先です。",
        "Shift+クリックで割り当て解除。赤ランプで Volume / PAN / Load を開きます。ホイールでアイコン変更、右クリックでアイコン一覧を開きます。"
      ]
    },
    {
      title: "Analyzer",
      body: [
        "Analyzer は BGM バスと SE バスを別々に解析します。オレンジの重なりは帯域干渉候補で、濃いほど SE が優勢です。",
        "周波数表示は対数グリッドです。どの帯域で衝突しているかを見るための実務用表示です。"
      ]
    }
  ];
}

export function getShortcutRows(language: UiLanguage): Array<{ keys: string; description: string }> {
  if (language === "en") {
    return [
      { keys: "Ctrl+Z", description: "Undo project edits" },
      { keys: "Ctrl+Y / Ctrl+Shift+Z", description: "Redo project edits" },
      { keys: "Shift+click SE key", description: "Unload the assigned SE file" },
      { keys: "Mouse wheel on SE key", description: "Cycle the icon" },
      { keys: "Right-click SE key", description: "Open the icon list" },
      { keys: "Red lamp", description: "Open volume, PAN, and load controls" },
      { keys: "Panel border drag", description: "Resize playlist, waveform, SE pad, and analyzer areas" }
    ];
  }
  return [
    { keys: "Ctrl+Z", description: "プロジェクト編集を元に戻す" },
    { keys: "Ctrl+Y / Ctrl+Shift+Z", description: "プロジェクト編集をやり直す" },
    { keys: "Shift+クリック SEキー", description: "割り当てられたSEをアンロード" },
    { keys: "SEキー上でホイール", description: "アイコンを順送り" },
    { keys: "SEキーを右クリック", description: "アイコン一覧を表示" },
    { keys: "赤ランプ", description: "Volume / PAN / Load を開く" },
    { keys: "パネル境界ドラッグ", description: "Playlist、波形、SE Pad、Analyzer の領域を調整" }
  ];
}
