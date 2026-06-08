import { app, BrowserWindow, dialog } from "electron";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { GamingProject } from "../../shared/types.js";
import { getDefaultProjectSavePath, getProjectSaveFileName } from "./portablePaths.js";

const projectFileName = getProjectSaveFileName();
const projectStoreLocationFileName = "gaminglooper-project-store-location-v1.json";

export interface SaveProjectResult {
  path: string | null;
  canceled: boolean;
}

interface ProjectStoreLocation {
  path: string;
}

export function getProjectStorePath(): string | null {
  return readProjectStoreLocation() ?? getDefaultProjectSavePath();
}

export async function clearProjectStoreLocation(): Promise<void> {
  await fs.rm(getProjectStoreLocationPath(), { force: true });
}

export async function loadProject(): Promise<GamingProject | null> {
  const filePath = getProjectStorePath();
  if (!filePath) return null;
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text) as GamingProject;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function saveProject(project: GamingProject, parentWindow?: BrowserWindow): Promise<SaveProjectResult> {
  const filePath = ensureProjectStorePath();
  if (!filePath) return { path: null, canceled: true };
  const savedPath = await writeProjectFileWithFallback(filePath, project);
  if (savedPath !== filePath) {
    await writeProjectStoreLocation(savedPath);
  }
  return { path: savedPath, canceled: false };
}

export async function saveProjectAs(project: GamingProject, parentWindow?: BrowserWindow): Promise<SaveProjectResult> {
  const filePath = await promptProjectStorePath(parentWindow);
  if (!filePath) return { path: null, canceled: true };
  await writeProjectFile(filePath, project);
  return { path: filePath, canceled: false };
}

async function writeProjectFile(filePath: string, project: GamingProject): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

function ensureProjectStorePath(): string | null {
  const existingPath = readProjectStoreLocation();
  if (existingPath) return existingPath;
  return getDefaultProjectSavePath();
}

async function promptProjectStorePath(parentWindow?: BrowserWindow): Promise<string | null> {
  const existingPath = getProjectStorePath();
  const options = {
    title: "Select GamingLooper save file",
    defaultPath: existingPath || getDefaultProjectSavePath(),
    filters: [{ name: "GamingLooper Project", extensions: ["json"] }]
  };
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  await writeProjectStoreLocation(result.filePath);
  return result.filePath;
}

async function writeProjectFileWithFallback(filePath: string, project: GamingProject): Promise<string> {
  try {
    await writeProjectFile(filePath, project);
    return filePath;
  } catch (error) {
    if (!isDefaultProjectPath(filePath) || !isWritePermissionError(error)) {
      throw error;
    }
    const fallbackPath = path.join(app.getPath("documents"), "GamingLooper", "save", projectFileName);
    await writeProjectFile(fallbackPath, project);
    return fallbackPath;
  }
}

function getProjectStoreLocationPath(): string {
  return path.join(app.getPath("userData"), projectStoreLocationFileName);
}

function readProjectStoreLocation(): string | null {
  try {
    const raw = fsSync.readFileSync(getProjectStoreLocationPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ProjectStoreLocation>;
    const filePath = typeof parsed.path === "string" ? parsed.path.trim() : "";
    return filePath || null;
  } catch (error) {
    if (isNotFound(error)) return null;
    return null;
  }
}

async function writeProjectStoreLocation(filePath: string): Promise<void> {
  const locationPath = getProjectStoreLocationPath();
  await fs.mkdir(path.dirname(locationPath), { recursive: true });
  await fs.writeFile(locationPath, JSON.stringify({ path: filePath }, null, 2), "utf8");
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function isWritePermissionError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : null;
  return code === "EACCES" || code === "EPERM" || code === "EROFS";
}

function isDefaultProjectPath(filePath: string): boolean {
  return path.resolve(filePath).toLowerCase() === path.resolve(getDefaultProjectSavePath()).toLowerCase();
}
