import fs from "node:fs/promises";
import path from "node:path";
import type { GamingProject } from "../../shared/types.js";
import { starterSePlan, createStarterSeProject } from "../../shared/starterSeProject.js";
import { importSeFiles } from "./audioImport.js";
import { getBundledSeFolderPath } from "./portablePaths.js";

export async function createBundledStarterProject(): Promise<GamingProject | null> {
  const seFolderPath = getBundledSeFolderPath();
  const existingPaths: string[] = [];

  for (const item of starterSePlan) {
    const filePath = path.join(seFolderPath, item.fileName);
    try {
      await fs.access(filePath);
      existingPaths.push(filePath);
    } catch {
      // Missing starter files are ignored so partial SE bundles can still boot.
    }
  }

  if (existingPaths.length === 0) return null;
  const result = await importSeFiles(existingPaths);
  return createStarterSeProject(result.files);
}
