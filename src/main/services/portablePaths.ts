import { app } from "electron";
import path from "node:path";

const saveFolderName = "save";
const assetFolderName = "asset";
const seFolderName = "se";
const projectSaveFileName = "gaminglooper-settings.json";

export function getPortableRootPath(): string {
  return app.isPackaged ? path.dirname(app.getPath("exe")) : app.getAppPath();
}

export function getDefaultSaveFolderPath(): string {
  return path.join(getPortableRootPath(), saveFolderName);
}

export function getDefaultProjectSavePath(): string {
  return path.join(getDefaultSaveFolderPath(), projectSaveFileName);
}

export function getBundledSeFolderPath(): string {
  return path.join(getPortableRootPath(), assetFolderName, seFolderName);
}

export function getProjectSaveFileName(): string {
  return projectSaveFileName;
}
