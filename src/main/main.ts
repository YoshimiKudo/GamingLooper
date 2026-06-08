import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, powerSaveBlocker, session, shell } from "electron";
import type { MenuItemConstructorOptions, OpenDialogOptions } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { BgmTrack, DetectionSettings, FileRef, GamingProject, HashCheck, SeFile, SequenceFile, SeSetFile, UiLanguage } from "../shared/types.js";
import { defaultDetectionSettings } from "../shared/project.js";
import { detectTrackLoop } from "./services/detect.js";
import { hashFile, importBgmFiles, importSeFiles } from "./services/audioImport.js";
import { clearProjectStoreLocation, getProjectStorePath, loadProject, saveProject, saveProjectAs } from "./services/projectStore.js";
import { readLimitedAudioFile } from "./services/limits.js";
import { getDefaultSaveFolderPath } from "./services/portablePaths.js";
import { createBundledStarterProject } from "./services/starterProject.js";

const isDev = !app.isPackaged;
const devServerUrl = "http://127.0.0.1:5173";
const perfProbeEnabled = process.env.GAMINGLOOPER_PERF_PROBE === "1" || process.argv.includes("--perf-probe");
const perfProbeExitEnabled = process.env.GAMINGLOOPER_PERF_PROBE_EXIT === "1" || process.argv.includes("--perf-probe-exit");
const perfProbePlayheadOff = process.argv.includes("--perf-playhead-off");
const perfProbeNoPlay = process.argv.includes("--perf-no-play");
const perfProbePositionOff = process.argv.includes("--perf-position-off");
const perfProbeTimeOff = process.argv.includes("--perf-time-off");
const rendererUrl = perfProbeEnabled ? `${devServerUrl}/?perf=1${perfProbePlayheadOff ? "&playhead=0" : ""}${perfProbePositionOff ? "&position=0" : ""}${perfProbeTimeOff ? "&time=0" : ""}` : devServerUrl;
const perfBgmFilePath = "__gaminglooper_perf_bgm.wav";
const perfBgmDurationSec = 30;
const appIconPath = path.join(app.getAppPath(), "build", "icon.ico");
const importedFilePaths = new Set<string>();
const projectDirtyByWebContents = new Map<number, boolean>();
const sequenceUpdatePendingByWebContents = new Map<number, boolean>();
const modalCloseGuardByWebContents = new Map<number, boolean>();
const closePromptWindows = new WeakSet<BrowserWindow>();
const closeApprovedWindows = new WeakSet<BrowserWindow>();
const saveBeforeCloseRequests = new Map<string, SaveBeforeCloseRequest>();
const beforeCloseCheckRequests = new Map<string, SaveBeforeCloseRequest>();
let menuLanguage: UiLanguage = "ja";
let powerSaveBlockerId: number | null = null;
let mainWindow: BrowserWindow | null = null;
const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.moveTop();
});

preventBrokenPipeCrash();
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

interface SaveBeforeCloseRequest {
  webContentsId: number;
  timer: NodeJS.Timeout;
  resolve: (result: SaveBeforeCloseResult) => void;
}

interface SaveBeforeCloseResult {
  ok: boolean;
  error: string | null;
}

type DataFolderKind = "sequence" | "se-set";

interface DataFolderLocations {
  sequencePath?: string;
  seSetPath?: string;
}

type SafeIpcResult<T> = { ok: true; value: T } | { ok: false; error: SafeIpcError };

interface SafeIpcError {
  channel: string;
  name: string;
  message: string;
  stack: string | null;
}

app.enableSandbox();
nativeTheme.themeSource = "dark";

function preventBrokenPipeCrash(): void {
  const isBrokenPipe = (error: unknown): boolean => {
    const candidate = error as NodeJS.ErrnoException;
    return candidate?.code === "EPIPE" || (error instanceof Error && error.message.includes("EPIPE"));
  };

  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error) => {
      if (isBrokenPipe(error)) return;
      // Avoid logging from this handler because the console stream itself may be the failing target.
    });
  }

  for (const method of ["log", "warn", "error"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      try {
        original(...args);
      } catch (error) {
        if (isBrokenPipe(error)) return;
        throw error;
      }
    };
  }

  process.on("uncaughtException", (error) => {
    if (isBrokenPipe(error)) return;
    throw error;
  });
}

function handleIpc<T>(channel: string, listener: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (event, ...args): Promise<SafeIpcResult<T>> => {
    try {
      return { ok: true, value: await listener(event, ...args) };
    } catch (error) {
      return { ok: false, error: serializeIpcError(channel, error) };
    }
  });
}

function serializeIpcError(channel: string, error: unknown): SafeIpcError {
  if (error instanceof Error) {
    return {
      channel,
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    };
  }
  return {
    channel,
    name: "Error",
    message: String(error),
    stack: null
  };
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1580,
    height: 980,
    minWidth: 1320,
    minHeight: 820,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0b090d",
      symbolColor: "#f3e2d2",
      height: 58
    },
    backgroundColor: "#070707",
    title: "GamingLooper",
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false
    }
  });
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigationUrl(url)) {
      event.preventDefault();
    }
  });
  window.webContents.on("destroyed", () => {
    projectDirtyByWebContents.delete(window.webContents.id);
    modalCloseGuardByWebContents.delete(window.webContents.id);
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  if (perfProbeEnabled) {
    window.once("ready-to-show", () => {
      window.show();
      window.focus();
      window.moveTop();
      app.focus({ steal: true });
    });
    window.webContents.on("console-message", (_event, _level, message) => {
      if (message.startsWith("__GL_PERF_REPORT__")) {
        console.log(message);
      } else if (message.includes("Error") || message.includes("error") || message.includes("Failed")) {
        console.log(`__GL_PERF_CONSOLE__${message}`);
      }
      if (message.startsWith("__GL_PERF_REPORT__") && perfProbeExitEnabled) {
        setTimeout(() => app.quit(), 80);
      }
    });
    window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
      console.log(`__GL_PERF_REPORT__${JSON.stringify({ loadError: { errorCode, errorDescription, validatedUrl } })}`);
      if (perfProbeExitEnabled) {
        setTimeout(() => app.quit(), 80);
      }
    });
    schedulePerformanceProbe(window);
  }
  window.on("close", (event) => {
    void handleWindowClose(window, event);
  });

  if (isDev) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../../dist-renderer/index.html"));
  }
}

function schedulePerformanceProbe(window: BrowserWindow): void {
  window.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      void runPerformanceProbe(window);
    }, 1200);
  });
}

async function runPerformanceProbe(window: BrowserWindow): Promise<void> {
  try {
    await window.webContents.executeJavaScript(`
      (() => {
        window.__glTimerProbe = { count: 0, startedAt: performance.now() };
        window.__glTimerProbe.id = window.setInterval(() => {
          window.__glTimerProbe.count += 1;
        }, 33);
      })()
    `);
    const point = (await window.webContents.executeJavaScript(`
      (() => {
        const button = Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.trim() === "単曲");
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
      })()
    `)) as { x: number; y: number } | null;
    await window.webContents.executeJavaScript(`window.__gamingLooperResetUiPerf?.()`);
    if (point && !perfProbeNoPlay) {
      window.webContents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
      window.webContents.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button: "left", clickCount: 1 });
    }
    setTimeout(() => {
      void readPerformanceProbeReport(window);
    }, 8200);
  } catch (error) {
    console.log(`__GL_PERF_REPORT__${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}`);
    if (perfProbeExitEnabled) app.quit();
  }
}

async function readPerformanceProbeReport(window: BrowserWindow): Promise<void> {
  try {
    const report = await window.webContents.executeJavaScript(`
      (() => {
        const metrics = window.__gamingLooperAnalyzerMetrics ?? null;
        return {
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          visibilityState: document.visibilityState,
          hasFocus: document.hasFocus(),
          timerProbe: window.__glTimerProbe ? {
            count: window.__glTimerProbe.count,
            elapsedMs: Math.round(performance.now() - window.__glTimerProbe.startedAt),
            fps: Math.round((window.__glTimerProbe.count * 1000) / Math.max(1, performance.now() - window.__glTimerProbe.startedAt))
          } : null,
          metrics,
          uiPerf: window.__gamingLooperUiPerf ?? null,
          audioDebug: window.__gamingLooperAudioDebug ?? null,
          fpsText: document.querySelector(".analysis-fps")?.textContent ?? null,
          timeText: document.querySelector(".time-readout")?.textContent ?? null,
          statusText: document.querySelector(".statusbar")?.textContent ?? null,
          nowPlaying: document.querySelector(".now-playing strong")?.textContent ?? null,
          bodyText: document.body?.textContent?.slice(0, 500) ?? null
        };
      })()
    `);
    console.log(`__GL_PERF_REPORT__${JSON.stringify(report)}`);
  } catch (error) {
    console.log(`__GL_PERF_REPORT__${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}`);
  } finally {
    if (perfProbeExitEnabled) {
      setTimeout(() => app.quit(), 80);
    }
  }
}

function createPerformanceProbeWav(): Buffer {
  const sampleRate = 48000;
  const channels = 2;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const frameCount = sampleRate * perfBgmDurationSec;
  const dataSize = frameCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

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
    buffer.writeInt16LE(clampPcm16(left * envelope), offset);
    offset += 2;
    buffer.writeInt16LE(clampPcm16(right * envelope), offset);
    offset += 2;
  }
  return buffer;
}

function clampPcm16(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
}

function isAllowedNavigationUrl(url: string): boolean {
  if (isDev) {
    return url.startsWith(devServerUrl);
  }
  return url.startsWith("file://");
}

app.whenReady().then(() => {
  if (!singleInstanceLock) return;
  powerSaveBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  createApplicationMenu();

  handleIpc("app:performance-probe-report", async (_event, report) => {
    if (!perfProbeEnabled) return;
    console.log(`__GL_PERF_REPORT__${JSON.stringify(report)}`);
    if (perfProbeExitEnabled) {
      setTimeout(() => app.quit(), 80);
    }
  });

  handleIpc("audio:import-bgm", async (event) => {
    const filePaths = await chooseAudioFiles(event.sender, "Import BGM files", true);
    if (filePaths.length === 0) return { tracks: [], errors: [] };
    const result = await importBgmFiles(filePaths);
    rememberBgmTracks(result.tracks);
    return result;
  });

  handleIpc("audio:import-se", async (event) => {
    const filePaths = await chooseAudioFiles(event.sender, "Import SE files", true);
    if (filePaths.length === 0) return { files: [], errors: [] };
    const result = await importSeFiles(filePaths);
    rememberSeFiles(result.files);
    return result;
  });

  handleIpc("audio:import-paths", async (_event, kind: unknown, filePaths: unknown) => {
    if (!Array.isArray(filePaths)) {
      return kind === "se" ? { files: [], errors: ["No dropped files were provided."] } : { tracks: [], errors: ["No dropped files were provided."] };
    }

    const supportedPaths = filePaths.filter((filePath): filePath is string => typeof filePath === "string" && isSupportedAudioPath(filePath));
    if (supportedPaths.length === 0) {
      const errors = ["Drop WAV, AIFF, AIF, OGG, MP3, FLAC, or OPUS files."];
      return kind === "se" ? { files: [], errors } : { tracks: [], errors };
    }

    if (kind === "se") {
      const result = await importSeFiles(supportedPaths);
      rememberSeFiles(result.files);
      return result;
    }
    const result = await importBgmFiles(supportedPaths);
    rememberBgmTracks(result.tracks);
    return result;
  });

  handleIpc("audio:read-file", async (_event, filePath: unknown) => {
    if (perfProbeEnabled && filePath === perfBgmFilePath) {
      const buffer = createPerformanceProbeWav();
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    if (!isImportedFilePath(filePath)) {
      throw new Error("File is not in the GamingLooper project or import session.");
    }
    const buffer = await readLimitedAudioFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  });

  handleIpc("audio:detect", async (_event, tracks: unknown, settings: unknown) => {
    if (!Array.isArray(tracks)) {
      return [];
    }
    const safeSettings = sanitizeDetectionSettings(typeof settings === "object" && settings !== null ? (settings as Partial<DetectionSettings>) : undefined);
    const results = [];
    for (const track of tracks) {
      if (!isBgmTrack(track) || !isImportedFilePath(track.filePath)) {
        results.push({
          id: getTrackId(track),
          loop: null,
          status: "error",
          validation: "Track is not in the GamingLooper project or import session."
        });
        continue;
      }
      results.push(await detectTrackLoop(track, safeSettings));
    }
    return results;
  });

  handleIpc("project:load", async () => {
    let project = await loadProject();
    if (!project) {
      project = await createBundledStarterProject();
      if (project) {
        await saveProject(project);
      }
    }
    if (project) {
      rememberProjectFiles(project);
    }
    return project;
  });

  handleIpc("project:save", async (_event, project: unknown) => {
    if (!project || typeof project !== "object") {
      throw new Error("Project payload is invalid.");
    }
    const typedProject = project as GamingProject;
    rememberProjectFiles(typedProject);
    const parentWindow = BrowserWindow.fromWebContents(_event.sender) ?? undefined;
    return saveProject(typedProject, parentWindow);
  });

  handleIpc("project:save-as", async (_event, project: unknown) => {
    if (!project || typeof project !== "object") {
      throw new Error("Project payload is invalid.");
    }
    const typedProject = project as GamingProject;
    rememberProjectFiles(typedProject);
    const parentWindow = BrowserWindow.fromWebContents(_event.sender) ?? undefined;
    return saveProjectAs(typedProject, parentWindow);
  });

  handleIpc("project:get-store-info", async () => ({ path: getProjectStorePath() }));

  handleIpc("project:get-data-folder-info", async () => getDataFolderInfo());

  handleIpc("project:select-data-folder", async (event, kind: unknown) => {
    const dataKind = parseDataFolderKind(kind);
    if (!dataKind) throw new Error("Data folder kind is invalid.");
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    return selectDataFolder(dataKind, parentWindow);
  });

  handleIpc("project:open-data-folder", async (_event, kind: unknown) => {
    const dataKind = parseDataFolderKind(kind);
    if (!dataKind) throw new Error("Data folder kind is invalid.");
    const folderPath = await getDataFolderPath(dataKind);
    if (!folderPath) {
      return { ok: false, error: "保存先が未設定です。" };
    }
    await fs.mkdir(folderPath, { recursive: true });
    const error = await shell.openPath(folderPath);
    return { ok: error.length === 0, error: error || null };
  });

  handleIpc("project:clear-store-location", async () => {
    if (!isDev) {
      throw new Error("Debug-only operation is unavailable in release builds.");
    }
    await clearProjectStoreLocation();
    return { path: getProjectStorePath() };
  });

  handleIpc("project:open-store-folder", async () => {
    const storePath = getProjectStorePath();
    if (!storePath) {
      return { ok: false, error: "保存先が未設定です。" };
    }
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    const error = await shell.openPath(path.dirname(storePath));
    return { ok: error.length === 0, error: error || null };
  });

  handleIpc("project:export-backup", async (event, project: unknown) => {
    if (!project || typeof project !== "object") {
      throw new Error("Project payload is invalid.");
    }
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const defaultSettingsSavePath = path.join(getDefaultSaveFolderPath(), "gaminglooper-settings.json");
    await fs.mkdir(path.dirname(defaultSettingsSavePath), { recursive: true });
    const result = parentWindow
      ? await dialog.showSaveDialog(parentWindow, {
          title: "Save GamingLooper settings",
          defaultPath: defaultSettingsSavePath,
          filters: [{ name: "JSON", extensions: ["json"] }]
        })
      : await dialog.showSaveDialog({
          title: "Save GamingLooper settings",
          defaultPath: defaultSettingsSavePath,
          filters: [{ name: "JSON", extensions: ["json"] }]
        });
    if (result.canceled || !result.filePath) return null;
    const typedProject = project as GamingProject;
    rememberProjectFiles(typedProject);
    await fs.writeFile(result.filePath, JSON.stringify({ ...typedProject, updatedAt: new Date().toISOString() }, null, 2), "utf8");
    return { path: result.filePath };
  });

  handleIpc("project:import-backup", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options: OpenDialogOptions = {
      title: "Load GamingLooper settings",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }]
    };
    const result = parentWindow ? await dialog.showOpenDialog(parentWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const text = await fs.readFile(filePath, "utf8");
    const project = JSON.parse(text) as GamingProject;
    rememberProjectFiles(project);
    return { project, path: filePath };
  });

  handleIpc("project:export-sequence", async (event, sequence: unknown) => {
    const payload = parseSequenceFile(sequence);
    if (!payload) {
      throw new Error("Sequence payload is invalid.");
    }
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await showDataSaveDialog(
      parentWindow,
      "Save GamingLooper Sequence",
      `${safeJsonBaseName(payload.playlist.name || "sequence")}.glseq`,
      { name: "GamingLooper Sequence", extensions: ["glseq"] },
      await getDataFolderPath("sequence")
    );
    if (result.canceled || !result.filePath) return null;
    const playlistName = sequenceNameFromFilePath(result.filePath, payload.playlist.name || "sequence");
    const savedPayload: SequenceFile = {
      ...payload,
      exportedAt: new Date().toISOString(),
      playlist: {
        ...payload.playlist,
        name: playlistName
      }
    };
    rememberBgmTracks(payload.tracks);
    await fs.writeFile(result.filePath, JSON.stringify(savedPayload, null, 2), "utf8");
    return { path: result.filePath, playlistName };
  });

  handleIpc("project:import-sequence", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await showDataOpenDialog(
      parentWindow,
      "Load GamingLooper Sequence",
      [
        { name: "GamingLooper Sequence", extensions: ["glseq"] },
        { name: "Legacy GamingLooper Sequence JSON", extensions: ["json"] }
      ],
      await getDataFolderPath("sequence")
    );
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const payload = parseSequenceFile(JSON.parse(await fs.readFile(filePath, "utf8")));
    if (!payload) {
      throw new Error("Selected file is not a GamingLooper Sequence file.");
    }
    rememberBgmTracks(payload.tracks);
    return { sequence: payload, path: filePath };
  });

  handleIpc("project:export-se-set", async (event, seSet: unknown) => {
    const payload = parseSeSetFile(seSet);
    if (!payload) {
      throw new Error("SE Set payload is invalid.");
    }
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await showDataSaveDialog(
      parentWindow,
      "Save GamingLooper SE Set",
      `${safeJsonBaseName(payload.seSet.name || "se-set")}.glset`,
      { name: "GamingLooper SE Set", extensions: ["glset"] },
      await getDataFolderPath("se-set")
    );
    if (result.canceled || !result.filePath) return null;
    const exportedName = safeJsonBaseName(path.basename(result.filePath).replace(/\.glset$/i, "") || payload.seSet.name || "se-set");
    const exportedExpTotal = getSeSetExpTotalForSave(payload.seSet.name, exportedName, payload.seSet.expTotal);
    const exportedSeSet = {
      ...payload.seSet,
      name: exportedName,
      expTotal: exportedExpTotal
    };
    rememberSeFiles(payload.seSet.assignments.map((assignment) => assignment.file).filter((file): file is SeFile => Boolean(file)));
    await fs.writeFile(result.filePath, JSON.stringify({ ...payload, exportedAt: new Date().toISOString(), seSet: exportedSeSet }, null, 2), "utf8");
    return { path: result.filePath };
  });

  handleIpc("project:import-se-set", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await showDataOpenDialog(
      parentWindow,
      "Load GamingLooper SE Set",
      [
        { name: "GamingLooper SE Set", extensions: ["glset"] },
        { name: "Legacy GamingLooper SE Set JSON", extensions: ["json"] }
      ],
      await getDataFolderPath("se-set")
    );
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const payload = parseSeSetFile(JSON.parse(await fs.readFile(filePath, "utf8")));
    if (!payload) {
      throw new Error("Selected file is not a GamingLooper SE Set file.");
    }
    rememberSeFiles(payload.seSet.assignments.map((assignment) => assignment.file).filter((file): file is SeFile => Boolean(file)));
    return { seSet: payload, path: filePath };
  });

  handleIpc("project:verify-hashes", async (_event, refs: unknown) => {
    const items = Array.isArray(refs) ? refs.filter(isFileRef) : [];
    const results: HashCheck[] = [];
    for (const ref of items) {
      try {
        if (!isImportedFilePath(ref.path)) {
          importedFilePaths.add(normalizeFilePath(ref.path));
        }
        const after = await hashFile(ref.path);
        results.push({ path: ref.path, name: ref.name, ok: after === ref.sha256, before: ref.sha256, after, error: null });
      } catch (error) {
        results.push({
          path: ref.path,
          name: ref.name,
          ok: false,
          before: ref.sha256,
          after: null,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return results;
  });

  ipcMain.on("project:set-dirty", (event, dirty: unknown) => {
    projectDirtyByWebContents.set(event.sender.id, dirty === true);
  });

  ipcMain.on("app:set-sequence-update-pending", (event, pending: unknown) => {
    sequenceUpdatePendingByWebContents.set(event.sender.id, pending === true);
  });

  ipcMain.on("app:set-window-close-guard", (event, guarded: unknown) => {
    modalCloseGuardByWebContents.set(event.sender.id, guarded === true);
  });

  ipcMain.on("app:before-close-check-result", (event, payload: unknown) => {
    const result = parseSaveBeforeCloseResult(payload);
    if (!result) return;
    const request = beforeCloseCheckRequests.get(result.requestId);
    if (!request || request.webContentsId !== event.sender.id) return;
    clearTimeout(request.timer);
    beforeCloseCheckRequests.delete(result.requestId);
    request.resolve({ ok: result.ok, error: result.error });
  });

  ipcMain.on("app:save-before-close-result", (event, payload: unknown) => {
    const result = parseSaveBeforeCloseResult(payload);
    if (!result) return;
    const request = saveBeforeCloseRequests.get(result.requestId);
    if (!request || request.webContentsId !== event.sender.id) return;
    saveBeforeCloseRequests.delete(result.requestId);
    clearTimeout(request.timer);
    request.resolve({ ok: result.ok, error: result.error });
  });

  handleIpc("app:select-audio-root", async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, { title: "Select audio root", properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ title: "Select audio root", properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  handleIpc("app:set-language", async (_event, language: unknown) => {
    menuLanguage = language === "en" ? "en" : "ja";
    createApplicationMenu(menuLanguage);
    return menuLanguage;
  });

  handleIpc("window:command", async (event, command: unknown) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow) return;
    if (command === "minimize") {
      targetWindow.minimize();
      return;
    }
    if (command === "toggle-maximize") {
      if (targetWindow.isMaximized()) {
        targetWindow.unmaximize();
      } else {
        targetWindow.maximize();
      }
      return;
    }
    if (command === "toggle-fullscreen") {
      targetWindow.setFullScreen(!targetWindow.isFullScreen());
      return;
    }
    if (command === "close") {
      targetWindow.close();
      return;
    }
    if (command === "quit") {
      app.quit();
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function createApplicationMenu(language: UiLanguage = menuLanguage): void {
  const labels = getMenuLabels(language);
  const template: MenuItemConstructorOptions[] = [
    {
      label: labels.file,
      submenu: [
        { label: labels.saveState, accelerator: "CommandOrControl+S", click: () => sendRendererMenuEvent("app:save-project") },
        { label: labels.loadState, accelerator: "CommandOrControl+Shift+O", click: () => sendRendererMenuEvent("app:load-project") },
        { label: labels.initializeState, click: () => sendRendererMenuEvent("app:reset-project") },
        { type: "separator" },
        { label: labels.openSaveFolder, click: () => sendRendererMenuEvent("app:open-save-folder") },
        { label: labels.exportBackup, click: () => sendRendererMenuEvent("app:export-backup") },
        { label: labels.importBackup, click: () => sendRendererMenuEvent("app:import-backup") },
        { type: "separator" },
        { label: labels.importBgm, click: () => sendRendererMenuEvent("app:import-bgm") },
        { label: labels.importSe, click: () => sendRendererMenuEvent("app:import-se") },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit" }
      ]
    },
    {
      label: labels.edit,
      submenu: [
        { label: labels.undoProject, accelerator: "CommandOrControl+Z", click: () => sendRendererMenuEvent("app:undo-project") },
        { label: labels.redoProject, accelerator: "CommandOrControl+Y", click: () => sendRendererMenuEvent("app:redo-project") },
        ...(isDev
          ? [
              { type: "separator" as const },
              {
                label: labels.debugMode,
                type: "checkbox" as const,
                click: () => sendRendererMenuEvent("app:toggle-debug-mode")
              }
            ]
          : []),
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: labels.help,
      submenu: [
        { label: labels.openHelp, accelerator: "F1", click: () => sendRendererMenuEvent("app:open-help") },
        { label: labels.shortcuts, click: () => sendRendererMenuEvent("app:open-shortcuts") }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getMenuLabels(language: UiLanguage): Record<string, string> {
  if (language === "en") {
    return {
      file: "File",
      saveState: "Save App State",
      loadState: "Load App State",
      initializeState: "Initialize App State",
      openSaveFolder: "Open Save Folder",
      exportBackup: "Save Settings...",
      importBackup: "Load Settings...",
      importBgm: "Import BGM...",
      importSe: "Import SE...",
      edit: "Edit",
      undoProject: "Undo Project",
      redoProject: "Redo Project",
      view: "View",
      debugMode: "Debug Mode",
      window: "Window",
      help: "Help",
      openHelp: "GamingLooper Help",
      shortcuts: "Shortcuts"
    };
  }
  return {
    file: "ファイル",
    saveState: "アプリ状態を保存",
    loadState: "アプリ状態をロード",
    initializeState: "アプリ状態を初期化",
    openSaveFolder: "保存場所を開く",
    exportBackup: "設定の保存...",
    importBackup: "設定の読み込み...",
    importBgm: "BGMを読み込み...",
    importSe: "SEを読み込み...",
    edit: "編集",
    undoProject: "プロジェクトを元に戻す",
    redoProject: "プロジェクトをやり直す",
    view: "表示",
    debugMode: "デバッグモード",
    window: "ウィンドウ",
    help: "ヘルプ",
    openHelp: "GamingLooper ヘルプ",
    shortcuts: "操作一覧"
  };
}

function sendRendererMenuEvent(channel: string): void {
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  target?.webContents.send(channel);
}

async function handleWindowClose(window: BrowserWindow, event: Electron.Event): Promise<void> {
  if (closeApprovedWindows.has(window)) {
    closeApprovedWindows.delete(window);
    return;
  }
  if (modalCloseGuardByWebContents.get(window.webContents.id)) {
    event.preventDefault();
    window.webContents.send("app:close-active-modal");
    return;
  }
  const webContentsId = window.webContents.id;
  const hasProjectDirty = projectDirtyByWebContents.get(webContentsId) === true;
  const hasSequenceUpdatePending = sequenceUpdatePendingByWebContents.get(webContentsId) === true;
  if (!hasProjectDirty && !hasSequenceUpdatePending) return;
  event.preventDefault();
  if (closePromptWindows.has(window)) return;

  closePromptWindows.add(window);
  try {
    if (hasSequenceUpdatePending) {
      const checkResult = await requestBeforeCloseCheck(window);
      if (!checkResult.ok) {
        if (checkResult.error) {
          await dialog.showMessageBox(window, {
            type: "error",
            title: "GamingLooper",
            message: "終了前の確認に失敗しました。",
            detail: checkResult.error
          });
        }
        return;
      }
    }

    if (!projectDirtyByWebContents.get(webContentsId)) {
      allowWindowClose(window);
      return;
    }

    const choice = await dialog.showMessageBox(window, {
      type: "question",
      title: "GamingLooper",
      message: "アプリ状態を保存しますか？",
      detail: "設定、読み込み波形、ループ設定、プレイリスト、SE割り当てに未保存の変更があります。",
      buttons: ["保存", "保存しない", "キャンセル"],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    });

    if (choice.response === 2) return;
    if (choice.response === 1) {
      allowWindowClose(window);
      return;
    }

    const saveResult = await requestSaveBeforeClose(window);
    if (saveResult.ok) {
      allowWindowClose(window);
      return;
    }

    await dialog.showMessageBox(window, {
      type: "error",
      title: "GamingLooper",
      message: "保存に失敗しました。",
      detail: saveResult.error ?? "アプリ状態を保存できなかったため、終了を中止しました。"
    });
  } finally {
    closePromptWindows.delete(window);
  }
}

function allowWindowClose(window: BrowserWindow): void {
  projectDirtyByWebContents.set(window.webContents.id, false);
  closeApprovedWindows.add(window);
  window.close();
}

function requestSaveBeforeClose(window: BrowserWindow): Promise<SaveBeforeCloseResult> {
  return requestRendererCloseStep(window, "app:save-before-close", saveBeforeCloseRequests, "保存要求がタイムアウトしました。", 10000);
}

function requestBeforeCloseCheck(window: BrowserWindow): Promise<SaveBeforeCloseResult> {
  return requestRendererCloseStep(window, "app:before-close-check", beforeCloseCheckRequests, "終了前確認がタイムアウトしました。", 60000);
}

function requestRendererCloseStep(
  window: BrowserWindow,
  channel: string,
  requests: Map<string, SaveBeforeCloseRequest>,
  timeoutMessage: string,
  timeoutMs: number
): Promise<SaveBeforeCloseResult> {
  return new Promise((resolve) => {
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      requests.delete(requestId);
      resolve({ ok: false, error: timeoutMessage });
    }, timeoutMs);
    requests.set(requestId, {
      webContentsId: window.webContents.id,
      timer,
      resolve
    });
    window.webContents.send(channel, requestId);
  });
}

function parseSaveBeforeCloseResult(payload: unknown): { requestId: string; ok: boolean; error: string | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const requestId = (payload as { requestId?: unknown }).requestId;
  if (typeof requestId !== "string") return null;
  const ok = (payload as { ok?: unknown }).ok === true;
  const error = (payload as { error?: unknown }).error;
  return { requestId, ok, error: typeof error === "string" ? error : null };
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId);
  }
  powerSaveBlockerId = null;
});

async function chooseAudioFiles(sender: Electron.WebContents, title: string, multiSelections: boolean): Promise<string[]> {
  const parentWindow = BrowserWindow.fromWebContents(sender) ?? undefined;
  const options: OpenDialogOptions = {
    title,
    properties: multiSelections ? ["openFile", "multiSelections"] : ["openFile"],
    filters: [
      { name: "Audio", extensions: ["wav", "aif", "aiff", "ogg", "mp3", "flac", "opus"] },
      { name: "All Files", extensions: ["*"] }
    ]
  };
  const result = parentWindow ? await dialog.showOpenDialog(parentWindow, options) : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

function rememberBgmTracks(tracks: BgmTrack[]): void {
  for (const track of tracks) {
    importedFilePaths.add(normalizeFilePath(track.filePath));
  }
}

function rememberSeFiles(files: SeFile[]): void {
  for (const file of files) {
    importedFilePaths.add(normalizeFilePath(file.filePath));
  }
}

function rememberProjectFiles(project: GamingProject): void {
  rememberBgmTracks(project.bgmTracks ?? []);
  rememberSeFiles((project.seAssignments ?? []).map((assignment) => assignment.file).filter((file): file is SeFile => Boolean(file)));
  for (const set of project.savedSeSets ?? []) {
    rememberSeFiles((set.assignments ?? []).map((assignment) => assignment.file).filter((file): file is SeFile => Boolean(file)));
  }
}

type DialogFileFilter = { name: string; extensions: string[] };

function parseDataFolderKind(kind: unknown): DataFolderKind | null {
  return kind === "sequence" || kind === "se-set" ? kind : null;
}

async function getDataFolderInfo(): Promise<{ sequencePath: string | null; seSetPath: string | null }> {
  const locations = await readDataFolderLocations();
  const defaultSaveFolderPath = getDefaultSaveFolderPath();
  return {
    sequencePath: normalizeStoredFolderPath(locations.sequencePath) ?? defaultSaveFolderPath,
    seSetPath: normalizeStoredFolderPath(locations.seSetPath) ?? defaultSaveFolderPath
  };
}

async function getDataFolderPath(kind: DataFolderKind): Promise<string | null> {
  const info = await getDataFolderInfo();
  return kind === "sequence" ? info.sequencePath : info.seSetPath;
}

async function selectDataFolder(kind: DataFolderKind, parentWindow?: BrowserWindow): Promise<{ path: string | null; canceled: boolean }> {
  const currentPath = await getDataFolderPath(kind);
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, {
        title: kind === "sequence" ? "Select Sequence save folder" : "Select SE Set save folder",
        defaultPath: currentPath ?? getDefaultSaveFolderPath(),
        properties: ["openDirectory", "createDirectory"]
      })
    : await dialog.showOpenDialog({
        title: kind === "sequence" ? "Select Sequence save folder" : "Select SE Set save folder",
        defaultPath: currentPath ?? getDefaultSaveFolderPath(),
        properties: ["openDirectory", "createDirectory"]
      });
  if (result.canceled || result.filePaths.length === 0) return { path: null, canceled: true };
  const folderPath = result.filePaths[0];
  const locations = await readDataFolderLocations();
  if (kind === "sequence") {
    locations.sequencePath = folderPath;
  } else {
    locations.seSetPath = folderPath;
  }
  await writeDataFolderLocations(locations);
  return { path: folderPath, canceled: false };
}

function getDataFolderLocationPath(): string {
  return path.join(app.getPath("userData"), "gaminglooper-data-folder-locations-v1.json");
}

async function readDataFolderLocations(): Promise<DataFolderLocations> {
  try {
    return JSON.parse(await fs.readFile(getDataFolderLocationPath(), "utf8")) as DataFolderLocations;
  } catch (error) {
    if (isNotFound(error)) return {};
    return {};
  }
}

async function writeDataFolderLocations(locations: DataFolderLocations): Promise<void> {
  const locationPath = getDataFolderLocationPath();
  await fs.mkdir(path.dirname(locationPath), { recursive: true });
  await fs.writeFile(locationPath, JSON.stringify(locations, null, 2), "utf8");
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function normalizeStoredFolderPath(folderPath: unknown): string | null {
  const value = typeof folderPath === "string" ? folderPath.trim() : "";
  return value ? value : null;
}

function defaultPathFromDataFolder(defaultFileName: string, folderPath: string | null): string {
  return folderPath ? path.join(folderPath, defaultFileName) : defaultFileName;
}

async function showDataSaveDialog(
  parentWindow: BrowserWindow | undefined,
  title: string,
  defaultPath: string,
  filter: DialogFileFilter,
  dataFolderPath: string | null = null
): Promise<Electron.SaveDialogReturnValue> {
  const options = {
    title,
    defaultPath: defaultPathFromDataFolder(defaultPath, dataFolderPath),
    filters: [filter]
  };
  return parentWindow ? dialog.showSaveDialog(parentWindow, options) : dialog.showSaveDialog(options);
}

async function showDataOpenDialog(
  parentWindow: BrowserWindow | undefined,
  title: string,
  filters: DialogFileFilter[],
  dataFolderPath: string | null = null
): Promise<Electron.OpenDialogReturnValue> {
  const options: OpenDialogOptions = {
    title,
    properties: ["openFile"],
    filters,
    ...(dataFolderPath ? { defaultPath: dataFolderPath } : {})
  };
  return parentWindow ? dialog.showOpenDialog(parentWindow, options) : dialog.showOpenDialog(options);
}

function parseSequenceFile(value: unknown): SequenceFile | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<SequenceFile>;
  if (payload.fileKind !== "gaminglooper.sequence" || payload.schemaVersion !== 1) return null;
  if (!payload.playlist || typeof payload.playlist !== "object" || !Array.isArray(payload.playlist.items)) return null;
  if (!Array.isArray(payload.tracks) || !payload.tracks.every(isBgmTrack)) return null;
  return {
    fileKind: "gaminglooper.sequence",
    schemaVersion: 1,
    exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : new Date().toISOString(),
    playlist: payload.playlist,
    tracks: payload.tracks,
    playlistEndBehavior: payload.playlistEndBehavior === "stop" ? "stop" : "repeat"
  };
}

function parseSeSetFile(value: unknown): SeSetFile | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<SeSetFile>;
  if (payload.fileKind !== "gaminglooper.se-set" || payload.schemaVersion !== 1) return null;
  if (!payload.seSet || typeof payload.seSet !== "object" || !Array.isArray(payload.seSet.assignments)) return null;
  return {
    fileKind: "gaminglooper.se-set",
    schemaVersion: 1,
    exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : new Date().toISOString(),
    seSet: payload.seSet
  };
}

function safeJsonBaseName(name: string): string {
  const cleaned = name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").slice(0, 80);
  return cleaned || "gaminglooper";
}

function getSeSetExpTotalForSave(sourceName: string, savedName: string, expTotal: unknown): number {
  const safeExpTotal = typeof expTotal === "number" && Number.isFinite(expTotal) ? Math.max(0, Math.floor(expTotal)) : 0;
  return sourceName.trim() === savedName.trim() ? safeExpTotal : Math.floor(safeExpTotal / 2);
}

function sequenceNameFromFilePath(filePath: string, fallback: string): string {
  const fileName = path.basename(filePath).replace(/\.glseq$/i, "").replace(/\.gl-sequence\.json$/i, "").replace(/\.json$/i, "").trim();
  return safeJsonBaseName(fileName || fallback);
}

function isSupportedAudioPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".wav" || ext === ".aif" || ext === ".aiff" || ext === ".ogg" || ext === ".mp3" || ext === ".flac" || ext === ".opus";
}

function isImportedFilePath(filePath: unknown): filePath is string {
  return typeof filePath === "string" && importedFilePaths.has(normalizeFilePath(filePath));
}

function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

function isBgmTrack(track: unknown): track is BgmTrack {
  return Boolean(track && typeof track === "object" && typeof (track as { id?: unknown }).id === "string" && typeof (track as { filePath?: unknown }).filePath === "string");
}

function isFileRef(value: unknown): value is FileRef {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { path?: unknown }).path === "string" &&
      typeof (value as { name?: unknown }).name === "string" &&
      typeof (value as { sha256?: unknown }).sha256 === "string"
  );
}

function getTrackId(track: unknown): string {
  if (track && typeof track === "object" && typeof (track as { id?: unknown }).id === "string") {
    return (track as { id: string }).id;
  }
  return "";
}

function sanitizeDetectionSettings(settings: Partial<DetectionSettings> | undefined): DetectionSettings {
  return {
    mode: settings?.mode === "deep" ? "deep" : "normal",
    matchWindowMs: clampNumber(settings?.matchWindowMs, 100, 30000, defaultDetectionSettings.matchWindowMs),
    matchThreshold: clampNumber(settings?.matchThreshold, 1, 100, defaultDetectionSettings.matchThreshold),
    minimumLoopMs: clampNumber(settings?.minimumLoopMs, 100, 600000, defaultDetectionSettings.minimumLoopMs),
    loopCheckPrerollMs: clampNumber(settings?.loopCheckPrerollMs, 0, 30000, defaultDetectionSettings.loopCheckPrerollMs),
    autoDetectOnImport: settings?.autoDetectOnImport ?? defaultDetectionSettings.autoDetectOnImport
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}
