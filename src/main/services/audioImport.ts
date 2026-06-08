import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { BgmTrack, FileRef, ImportResult, SeFile, SeImportResult } from "../../shared/types.js";
import { parseAiff } from "../audio/aiff.js";
import { parseFlac } from "../audio/flac.js";
import { parseMp3 } from "../audio/mp3.js";
import { parseOggOpus, parseOggVorbis } from "../audio/ogg.js";
import type { ParsedAudio } from "../audio/types.js";
import { parseWav } from "../audio/wav.js";
import { readLimitedAudioFile } from "./limits.js";

export async function importBgmFiles(filePaths: string[]): Promise<ImportResult> {
  const tracks: BgmTrack[] = [];
  const errors: string[] = [];

  for (const filePath of filePaths) {
    try {
      const { parsed, file, fileName } = await parseAudioFile(filePath);
      tracks.push({
        id: crypto.randomUUID(),
        filePath,
        fileName,
        file,
        format: parsed.format,
        sampleRate: parsed.sampleRate,
        bitDepth: parsed.bitDepth,
        channels: parsed.channels,
        durationSamples: parsed.durationSamples,
        durationMs: parsed.sampleRate > 0 ? (parsed.durationSamples / parsed.sampleRate) * 1000 : 0,
        volume: 1,
        loop: parsed.loop,
        status: parsed.loop ? "detected" : "pending",
        validation: parsed.loop ? "Loop metadata loaded." : parsed.validation,
        waveform: parsed.waveform
      });
    } catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { tracks, errors };
}

export async function importSeFiles(filePaths: string[]): Promise<SeImportResult> {
  const files: SeFile[] = [];
  const errors: string[] = [];

  for (const filePath of filePaths) {
    try {
      const { parsed, file, fileName } = await parseAudioFile(filePath);
      files.push({
        id: crypto.randomUUID(),
        filePath,
        fileName,
        file,
        format: parsed.format,
        sampleRate: parsed.sampleRate,
        channels: parsed.channels,
        durationMs: parsed.sampleRate > 0 ? (parsed.durationSamples / parsed.sampleRate) * 1000 : 0,
        waveform: parsed.waveform
      });
    } catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { files, errors };
}

export async function hashFile(filePath: string): Promise<string> {
  const buffer = await readLimitedAudioFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function parseAudioFile(filePath: string): Promise<{ parsed: ParsedAudio; file: FileRef; fileName: string }> {
  const buffer = await readLimitedAudioFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const parsed =
    ext === ".wav"
      ? parseWav(buffer)
      : ext === ".aif" || ext === ".aiff"
        ? parseAiff(buffer)
        : ext === ".ogg"
          ? parseOggVorbis(buffer)
          : ext === ".mp3"
            ? parseMp3(buffer)
            : ext === ".flac"
              ? parseFlac(buffer)
              : ext === ".opus"
                ? parseOggOpus(buffer)
                : null;

  if (!parsed) {
    throw new Error("Unsupported audio file type.");
  }

  const stat = await fs.stat(filePath);
  const fileName = path.basename(filePath);
  return {
    parsed,
    fileName,
    file: {
      path: filePath,
      name: fileName,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex")
    }
  };
}
