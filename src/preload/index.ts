import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  BgmTrack,
  DetectionResult,
  DetectionSettings,
  FileRef,
  GamingProject,
  HashCheck,
  ImportResult,
  SequenceFile,
  SeSetFile,
  SeImportResult,
  UiLanguage
} from "../shared/types.js";

type BgmDropTarget = "default" | "sequence-builder";
type DropImportPayload = { result: ImportResult; target: BgmDropTarget };
type DropImportCallback = (payload: DropImportPayload) => void;
type SeDropImportCallback = (payload: { result: SeImportResult; targetKey: string | null; droppedCount: number; acceptedCount: number }) => void;
type FileDragStateCallback = (active: boolean) => void;
type DropImportStateCallback = (state: { active: boolean; count: number }) => void;
type MenuCallback = () => void;
type SaveBeforeCloseCallback = (requestId: string) => void;
type DataFolderKind = "sequence" | "se-set";
interface SaveBeforeCloseResult {
  ok: boolean;
  error?: string | null;
}

const dropImportCallbacks = new Set<DropImportCallback>();
const seDropImportCallbacks = new Set<SeDropImportCallback>();
const fileDragStateCallbacks = new Set<FileDragStateCallback>();
const dropImportStateCallbacks = new Set<DropImportStateCallback>();
let fileDragActive = false;

type SafeIpcResult<T> = { ok: true; value: T } | { ok: false; error: SafeIpcError };

interface SafeIpcError {
  channel: string;
  name: string;
  message: string;
  stack: string | null;
}

async function invokeMain<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as SafeIpcResult<T>;
  if (result && typeof result === "object" && "ok" in result) {
    if (result.ok) return result.value;
    const error = new Error(`[${result.error.channel}] ${result.error.message}`);
    error.name = result.error.name || "Error";
    if (result.error.stack) error.stack = result.error.stack;
    throw error;
  }
  return result as T;
}

const api = {
  importBgmFiles: () => invokeMain<ImportResult>("audio:import-bgm"),
  importSeFiles: () => invokeMain<SeImportResult>("audio:import-se"),
  importDroppedBgmPaths: (filePaths: string[]) => invokeMain<ImportResult>("audio:import-paths", "bgm", filePaths),
  importDroppedSePaths: (filePaths: string[]) => invokeMain<SeImportResult>("audio:import-paths", "se", filePaths),
  readAudioFile: (filePath: string) => invokeMain<ArrayBuffer>("audio:read-file", filePath),
  detectBgmTracks: (tracks: BgmTrack[], settings: DetectionSettings) =>
    invokeMain<DetectionResult[]>("audio:detect", tracks, settings),
  loadProject: () => invokeMain<GamingProject | null>("project:load"),
  saveProject: (project: GamingProject) => invokeMain<{ path: string | null; canceled: boolean }>("project:save", project),
  saveProjectAs: (project: GamingProject) => invokeMain<{ path: string | null; canceled: boolean }>("project:save-as", project),
  getProjectStoreInfo: () => invokeMain<{ path: string | null }>("project:get-store-info"),
  getDataFolderInfo: () => invokeMain<{ sequencePath: string | null; seSetPath: string | null }>("project:get-data-folder-info"),
  selectDataFolder: (kind: DataFolderKind) => invokeMain<{ path: string | null; canceled: boolean }>("project:select-data-folder", kind),
  openDataFolder: (kind: DataFolderKind) => invokeMain<{ ok: boolean; error: string | null }>("project:open-data-folder", kind),
  clearProjectStoreLocation: () => invokeMain<{ path: string | null }>("project:clear-store-location"),
  openProjectStoreFolder: () => invokeMain<{ ok: boolean; error: string | null }>("project:open-store-folder"),
  exportProjectBackup: (project: GamingProject) => invokeMain<{ path: string } | null>("project:export-backup", project),
  importProjectBackup: () => invokeMain<{ project: GamingProject; path: string } | null>("project:import-backup"),
  exportSequenceFile: (sequence: SequenceFile) => invokeMain<{ path: string; playlistName: string } | null>("project:export-sequence", sequence),
  importSequenceFile: () => invokeMain<{ sequence: SequenceFile; path: string } | null>("project:import-sequence"),
  exportSeSetFile: (seSet: SeSetFile) => invokeMain<{ path: string } | null>("project:export-se-set", seSet),
  importSeSetFile: () => invokeMain<{ seSet: SeSetFile; path: string } | null>("project:import-se-set"),
  setProjectDirty: (dirty: boolean) => {
    ipcRenderer.send("project:set-dirty", dirty);
  },
  setSequenceUpdatePending: (pending: boolean) => {
    ipcRenderer.send("app:set-sequence-update-pending", pending);
  },
  setWindowCloseGuard: (guarded: boolean) => {
    ipcRenderer.send("app:set-window-close-guard", guarded);
  },
  verifyHashes: (refs: FileRef[]) => invokeMain<HashCheck[]>("project:verify-hashes", refs),
  selectAudioRoot: () => invokeMain<string | null>("app:select-audio-root"),
  setMenuLanguage: (language: UiLanguage) => invokeMain<UiLanguage>("app:set-language", language),
  windowCommand: (command: "minimize" | "toggle-maximize" | "close" | "quit" | "toggle-fullscreen") =>
    invokeMain<void>("window:command", command),
  reportPerformanceProbe: (report: unknown) => invokeMain<void>("app:performance-probe-report", report),
  onDroppedFilesImported: (callback: DropImportCallback) => {
    dropImportCallbacks.add(callback);
    return () => {
      dropImportCallbacks.delete(callback);
    };
  },
  onDroppedSeFilesImported: (callback: SeDropImportCallback) => {
    seDropImportCallbacks.add(callback);
    return () => {
      seDropImportCallbacks.delete(callback);
    };
  },
  onFileDragStateChanged: (callback: FileDragStateCallback) => {
    fileDragStateCallbacks.add(callback);
    return () => {
      fileDragStateCallbacks.delete(callback);
    };
  },
  onDroppedFilesImportStateChanged: (callback: DropImportStateCallback) => {
    dropImportStateCallbacks.add(callback);
    return () => {
      dropImportStateCallbacks.delete(callback);
    };
  },
  onImportBgmRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:import-bgm", listener);
    return () => {
      ipcRenderer.removeListener("app:import-bgm", listener);
    };
  },
  onImportSeRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:import-se", listener);
    return () => {
      ipcRenderer.removeListener("app:import-se", listener);
    };
  },
  onSaveProjectRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:save-project", listener);
    return () => {
      ipcRenderer.removeListener("app:save-project", listener);
    };
  },
  onOpenSaveFolderRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:open-save-folder", listener);
    return () => {
      ipcRenderer.removeListener("app:open-save-folder", listener);
    };
  },
  onExportBackupRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:export-backup", listener);
    return () => {
      ipcRenderer.removeListener("app:export-backup", listener);
    };
  },
  onImportBackupRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:import-backup", listener);
    return () => {
      ipcRenderer.removeListener("app:import-backup", listener);
    };
  },
  onLoadProjectRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:load-project", listener);
    return () => {
      ipcRenderer.removeListener("app:load-project", listener);
    };
  },
  onResetProjectRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:reset-project", listener);
    return () => {
      ipcRenderer.removeListener("app:reset-project", listener);
    };
  },
  onUndoProjectRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:undo-project", listener);
    return () => {
      ipcRenderer.removeListener("app:undo-project", listener);
    };
  },
  onRedoProjectRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:redo-project", listener);
    return () => {
      ipcRenderer.removeListener("app:redo-project", listener);
    };
  },
  onOpenHelpRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:open-help", listener);
    return () => {
      ipcRenderer.removeListener("app:open-help", listener);
    };
  },
  onOpenShortcutsRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:open-shortcuts", listener);
    return () => {
      ipcRenderer.removeListener("app:open-shortcuts", listener);
    };
  },
  onCloseActiveModalRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:close-active-modal", listener);
    return () => {
      ipcRenderer.removeListener("app:close-active-modal", listener);
    };
  },
  onDebugModeToggleRequested: (callback: MenuCallback) => {
    const listener = () => callback();
    ipcRenderer.on("app:toggle-debug-mode", listener);
    return () => {
      ipcRenderer.removeListener("app:toggle-debug-mode", listener);
    };
  },
  onSaveBeforeCloseRequested: (callback: SaveBeforeCloseCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: unknown) => {
      if (typeof requestId === "string") callback(requestId);
    };
    ipcRenderer.on("app:save-before-close", listener);
    return () => {
      ipcRenderer.removeListener("app:save-before-close", listener);
    };
  },
  onBeforeCloseCheckRequested: (callback: SaveBeforeCloseCallback) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: unknown) => {
      if (typeof requestId === "string") callback(requestId);
    };
    ipcRenderer.on("app:before-close-check", listener);
    return () => {
      ipcRenderer.removeListener("app:before-close-check", listener);
    };
  },
  completeSaveBeforeClose: (requestId: string, result: SaveBeforeCloseResult) => {
    ipcRenderer.send("app:save-before-close-result", {
      requestId,
      ok: result.ok,
      error: result.error ?? null
    });
  },
  completeBeforeCloseCheck: (requestId: string, result: SaveBeforeCloseResult) => {
    ipcRenderer.send("app:before-close-check-result", {
      requestId,
      ok: result.ok,
      error: result.error ?? null
    });
  }
};

contextBridge.exposeInMainWorld("gamingLooper", api);

export type GamingLooperApi = typeof api;

window.addEventListener(
  "dragenter",
  (event) => {
    if (!hasFiles(event)) return;
    acceptFileDrag(event);
    setFileDragActive(true);
  },
  true
);

window.addEventListener(
  "dragover",
  (event) => {
    if (!hasFiles(event)) return;
    acceptFileDrag(event);
    setFileDragActive(true);
  },
  true
);

window.addEventListener(
  "dragleave",
  (event) => {
    if (!hasFiles(event)) return;
    acceptFileDrag(event);
    const x = event.clientX;
    const y = event.clientY;
    if (x <= 0 || y <= 0 || x >= window.innerWidth || y >= window.innerHeight) {
      setFileDragActive(false);
    }
  },
  true
);

window.addEventListener(
  "drop",
  (event) => {
    if (!hasFiles(event)) return;
    acceptFileDrag(event);
    setFileDragActive(false);
    const seDropTarget = getSeDropTarget(event.target);
    if (seDropTarget.isSePad) {
      void importDroppedSeFiles(event.dataTransfer?.files, seDropTarget.key, seDropTarget.limit);
      return;
    }
    void importDroppedFiles(event.dataTransfer?.files, getBgmDropTarget(event.target));
  },
  true
);

function acceptFileDrag(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

function hasFiles(event: DragEvent): boolean {
  const types = Array.from(event.dataTransfer?.types ?? []);
  return types.includes("Files") || (event.dataTransfer?.files?.length ?? 0) > 0;
}

function getSeDropTarget(target: EventTarget | null): { isSePad: boolean; key: string | null; limit: number } {
  const element = target instanceof Element ? target : null;
  const zone = element?.closest("[data-se-drop-zone='true']");
  if (!zone) return { isSePad: false, key: null, limit: 0 };
  const keyElement = element?.closest<HTMLElement>(".se-key[data-key]");
  const key = keyElement && zone.contains(keyElement) ? keyElement.dataset.key ?? null : null;
  const emptyKeys = Array.from(zone.querySelectorAll(".se-key.empty"));
  if (!keyElement || !zone.contains(keyElement)) {
    return { isSePad: true, key: null, limit: emptyKeys.length };
  }
  const targetIsEmpty = keyElement.classList.contains("empty");
  return { isSePad: true, key, limit: targetIsEmpty ? emptyKeys.length : emptyKeys.length + 1 };
}

function getBgmDropTarget(target: EventTarget | null): BgmDropTarget {
  const element = target instanceof Element ? target : null;
  return element?.closest("[data-bgm-sequence-drop-zone='true']") ? "sequence-builder" : "default";
}

async function importDroppedFiles(files: FileList | undefined, target: BgmDropTarget): Promise<void> {
  const filePaths = Array.from(files ?? [])
    .map((file) => webUtils.getPathForFile(file))
    .filter((filePath) => filePath.length > 0);
  notifyDropImportStateCallbacks({ active: true, count: filePaths.length });
  try {
    const result = await invokeMain<ImportResult>("audio:import-paths", "bgm", filePaths);
    notifyDropImportCallbacks({ result, target });
  } catch (error) {
    notifyDropImportCallbacks({
      result: {
        tracks: [],
        errors: [error instanceof Error ? error.message : "Dropped file import failed."]
      },
      target
    });
  } finally {
    notifyDropImportStateCallbacks({ active: false, count: 0 });
  }
}

async function importDroppedSeFiles(files: FileList | undefined, targetKey: string | null, limit: number): Promise<void> {
  const filePaths = Array.from(files ?? [])
    .map((file) => webUtils.getPathForFile(file))
    .filter((filePath) => filePath.length > 0);
  const acceptedPaths = filePaths.slice(0, Math.max(0, limit));
  notifyDropImportStateCallbacks({ active: true, count: acceptedPaths.length });
  try {
    if (acceptedPaths.length === 0) {
      notifySeDropImportCallbacks({
        result: { files: [], errors: ["No empty SE keys are available."] },
        targetKey,
        droppedCount: filePaths.length,
        acceptedCount: 0
      });
      return;
    }
    const result = await invokeMain<SeImportResult>("audio:import-paths", "se", acceptedPaths);
    notifySeDropImportCallbacks({ result, targetKey, droppedCount: filePaths.length, acceptedCount: acceptedPaths.length });
  } catch (error) {
    notifySeDropImportCallbacks({
      result: {
        files: [],
        errors: [error instanceof Error ? error.message : "Dropped SE import failed."]
      },
      targetKey,
      droppedCount: filePaths.length,
      acceptedCount: acceptedPaths.length
    });
  } finally {
    notifyDropImportStateCallbacks({ active: false, count: 0 });
  }
}

function notifyDropImportCallbacks(payload: DropImportPayload): void {
  for (const callback of dropImportCallbacks) {
    callback(payload);
  }
}

function notifySeDropImportCallbacks(payload: { result: SeImportResult; targetKey: string | null; droppedCount: number; acceptedCount: number }): void {
  for (const callback of seDropImportCallbacks) {
    callback(payload);
  }
}

function setFileDragActive(active: boolean): void {
  if (fileDragActive === active) return;
  fileDragActive = active;
  for (const callback of fileDragStateCallbacks) {
    callback(active);
  }
}

function notifyDropImportStateCallbacks(state: { active: boolean; count: number }): void {
  for (const callback of dropImportStateCallbacks) {
    callback(state);
  }
}
