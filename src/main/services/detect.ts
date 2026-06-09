import type { DetectionResult, DetectionSettings, LoopMarker, TrackInfo } from "../../shared/types.js";
import { findBestLoopDeepResponsive, findBestLoopResponsive, findBestLoopVgostResponsive } from "../../shared/detectCore.js";
import { isLegacyVgostDetectionSettings } from "../../shared/project.js";
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
    const candidate = isLegacyVgostDetectionSettings(settings)
      ? await findBestLoopVgostResponsive(mono, decoded.sampleRate, settings, decoded.loop, scheduler)
      : settings.mode === "deep"
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
    const acceptanceThreshold = candidate.acceptanceThreshold ?? settings.matchThreshold;
    const accepted = candidate.confidence >= acceptanceThreshold;
    const status = accepted ? "detected" : "low-confidence";
    return {
      id: track.id,
      loop: accepted ? loop : null,
      status,
      validation: accepted
        ? `Detected${settings.mode === "deep" ? " with Deep" : ""} at ${candidate.confidence.toFixed(1)}%.`
        : `Best ${settings.mode === "deep" ? "Deep " : ""}candidate was ${candidate.confidence.toFixed(1)}%, below the ${acceptanceThreshold}% threshold.`
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
