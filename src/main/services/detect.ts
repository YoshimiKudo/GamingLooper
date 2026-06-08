import type { DetectionResult, DetectionSettings, LoopMarker, TrackInfo } from "../../shared/types.js";
import { findBestLoopDeepResponsive, findBestLoopResponsive } from "../../shared/detectCore.js";
import { decodeAiff } from "../audio/aiff.js";
import { decodeWav } from "../audio/wav.js";
import { downmixMono } from "../audio/waveform.js";
import { readLimitedAudioFile } from "./limits.js";

export async function detectTrackLoop(track: TrackInfo, settings: DetectionSettings): Promise<DetectionResult> {
  try {
    const buffer = await readLimitedAudioFile(track.filePath);
    const decoded = track.format === "wav" ? decodeWav(buffer) : track.format === "aiff" ? decodeAiff(buffer) : null;
    if (!decoded) {
      return {
        id: track.id,
        loop: track.loop,
        status: "error",
        validation: `Use the renderer WebAudio path for ${track.format.toUpperCase()} detection.`
      };
    }
    const mono = downmixMono(decoded.pcm);
    const scheduler = createMainDetectionScheduler();
    const candidate =
      settings.mode === "deep"
        ? await findBestLoopDeepResponsive(mono, decoded.sampleRate, settings, decoded.loop, scheduler)
        : await findBestLoopResponsive(mono, decoded.sampleRate, settings, decoded.loop, scheduler);
    if (!candidate) {
      return {
        id: track.id,
        loop: null,
        status: "no-loop",
        validation: `No ${settings.mode === "deep" ? "Deep " : ""}loop candidate reached ${settings.matchThreshold}%.`
      };
    }

    const loop: LoopMarker = {
      startSample: candidate.start,
      endSample: candidate.end,
      lengthSamples: candidate.end - candidate.start,
      confidence: candidate.confidence,
      source: candidate.source
    };
    const status = candidate.confidence >= settings.matchThreshold ? "detected" : "low-confidence";
    return {
      id: track.id,
      loop,
      status,
      validation: `Detected${settings.mode === "deep" ? " with Deep" : ""} at ${candidate.confidence.toFixed(1)}%.`
    };
  } catch (error) {
    return {
      id: track.id,
      loop: track.loop,
      status: "error",
      validation: error instanceof Error ? error.message : String(error)
    };
  }
}

function createMainDetectionScheduler(): { shouldYield: () => boolean; yield: () => Promise<void> } {
  let lastYieldAt = Date.now();
  return {
    shouldYield: () => Date.now() - lastYieldAt >= 64,
    yield: async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYieldAt = Date.now();
    }
  };
}
