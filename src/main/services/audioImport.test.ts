import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { importBgmFiles, importSeFiles } from "./audioImport.js";

describe("audio import", () => {
  it("imports WAV metadata and waveform without mutating the source file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gaminglooper-"));
    const filePath = path.join(dir, "SE_sword_slash_001.wav");
    const wav = makeWav();
    await fs.writeFile(filePath, wav);
    const before = sha256(wav);

    const bgm = await importBgmFiles([filePath]);
    const afterBytes = await fs.readFile(filePath);
    const se = await importSeFiles([filePath]);

    expect(sha256(afterBytes)).toBe(before);
    expect(bgm.errors).toEqual([]);
    expect(bgm.tracks[0]?.file.sha256).toBe(before);
    expect(bgm.tracks[0]?.waveform?.channels[0]?.max.length).toBeGreaterThan(0);
    expect(se.errors).toEqual([]);
    expect(se.files[0]?.fileName).toBe("SE_sword_slash_001.wav");
  });
});

function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function makeWav(): Buffer {
  const sampleRate = 8000;
  const samples = sampleRate;
  const dataSize = samples * 2;
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
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 12000);
    buffer.writeInt16LE(value, 44 + i * 2);
  }
  return buffer;
}
