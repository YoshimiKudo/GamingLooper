import type { GamingProject, SeFile, SeKey } from "./types.js";
import { createEmptyProject } from "./project.js";
import { inferSeColorId, inferSeIconId } from "./seIcons.js";

export const starterSePlan: Array<{ key: SeKey; fileName: string }> = [
  { key: "Q", fileName: "GL_Fire.wav" },
  { key: "W", fileName: "GL_Guard.wav" },
  { key: "E", fileName: "GL_Heal.wav" },
  { key: "R", fileName: "GL_Slash.wav" },
  { key: "T", fileName: "GL_Thunder.wav" },
  { key: "Y", fileName: "GL_Wind.wav" }
];

export function createStarterSeProject(seFiles: SeFile[]): GamingProject | null {
  const filesByName = new Map(seFiles.map((file) => [file.fileName.toLowerCase(), file]));
  const assignmentsByKey = new Map(starterSePlan.map((item) => [item.key, filesByName.get(item.fileName.toLowerCase()) ?? null]));
  if (!Array.from(assignmentsByKey.values()).some(Boolean)) return null;

  const project = createEmptyProject();
  return {
    ...project,
    activeSeSetName: "Starter SE Set",
    seAssignments: project.seAssignments.map((assignment) => {
      const file = assignmentsByKey.get(assignment.key);
      if (!file) return assignment;
      const iconId = inferSeIconId(file.fileName);
      return {
        ...assignment,
        file,
        iconId,
        iconSource: "inferred",
        colorId: inferSeColorId(iconId, assignment.key),
        volume: 1,
        pan: 0
      };
    })
  };
}
