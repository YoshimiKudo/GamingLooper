import { describe, expect, it } from "vitest";
import type { SeFile } from "./types.js";
import { createStarterSeProject, starterSePlan } from "./starterSeProject.js";

describe("starter SE project", () => {
  it("assigns the bundled self-made SE set to the first six pad keys", () => {
    const project = createStarterSeProject(starterSePlan.map((item) => makeSeFile(item.fileName)));

    expect(project?.activeSeSetName).toBe("Starter SE Set");
    expect(project?.seAssignments.filter((assignment) => assignment.file).map((assignment) => [assignment.key, assignment.file?.fileName])).toEqual([
      ["Q", "GL_Fire.wav"],
      ["W", "GL_Guard.wav"],
      ["E", "GL_Heal.wav"],
      ["R", "GL_Slash.wav"],
      ["T", "GL_Thunder.wav"],
      ["Y", "GL_Wind.wav"]
    ]);
    expect(project?.bgmTracks).toEqual([]);
    expect(project?.savedPlaylists).toEqual([]);
  });

  it("does not create a starter project without matching bundled SE files", () => {
    expect(createStarterSeProject([makeSeFile("Other.wav")])).toBeNull();
  });
});

function makeSeFile(fileName: string): SeFile {
  return {
    id: fileName,
    filePath: `asset/se/${fileName}`,
    fileName,
    file: {
      path: `asset/se/${fileName}`,
      name: fileName,
      size: 1,
      mtimeMs: 1,
      sha256: fileName
    },
    format: "wav",
    sampleRate: 48000,
    channels: 2,
    durationMs: 100,
    waveform: null
  };
}
