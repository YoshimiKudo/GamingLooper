import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DetectionSettings, TrackInfo } from "../../shared/types.js";
import { detectTrackLoop } from "./detect.js";

describe("detectTrackLoop", () => {
  it("does not assign low-confidence candidates as loop markers", async () => {
    const sampleRate = 1000;
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "gaminglooper-detect-"));
    const filePath = path.join(tempDir, "low-confidence.wav");
    try {
      await writeFile(filePath, createLoopedWav(sampleRate));
      const settings: DetectionSettings = {
        autoDetectOnImport: true,
        mode: "normal",
        matchWindowMs: 120,
        matchThreshold: 101,
        minimumLoopMs: 300,
        loopCheckPrerollMs: 1000
      };
      const track: TrackInfo = {
        id: "low-confidence",
        filePath,
        fileName: "low-confidence.wav",
        file: {
          path: filePath,
          name: "low-confidence.wav",
          size: 0,
          mtimeMs: 0,
          sha256: "test"
        },
        format: "wav",
        sampleRate,
        channels: 1,
        bitDepth: 16,
        durationSamples: 3200,
        durationMs: 3200,
        volume: 1,
        loop: null,
        status: "pending",
        validation: "",
        waveform: null
      };

      const result = await detectTrackLoop(track, settings);

      expect(result.status).toBe("low-confidence");
      expect(result.loop).toBeNull();
      expect(result.validation).toContain("below the 101% threshold");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function createLoopedWav(sampleRate: number): Buffer {
  const frames = 3200;
  const samples = new Int16Array(frames);
  const loopLength = 1024;
  for (let i = 0; i < frames; i += 1) {
    const phase = (i % loopLength) / loopLength;
    const value = Math.sin(phase * Math.PI * 2 * 4) * 0.9 + Math.sin(phase * Math.PI * 2 * 11) * 0.08;
    samples[i] = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
  }

  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buffer;
}
