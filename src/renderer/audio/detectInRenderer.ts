import type { BgmTrack, DetectionResult, DetectionSettings, LoopMarker } from "../../shared/types.js";
import { findBestLoopDeepResponsive, findBestLoopResponsive, findBestLoopVgostResponsive } from "../../shared/detectCore.js";
import type { LoopCandidate } from "../../shared/detectCore.js";
import { isLegacyVgostDetectionSettings } from "../../shared/project.js";
import { buildWaveformPeaksFromAudioBuffer } from "./waveform.js";

export async function detectTrackWithWebAudio(track: BgmTrack, settings: DetectionSettings): Promise<DetectionResult> {
  let context: AudioContext | null = null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    const arrayBuffer = await window.gamingLooper.readAudioFile(track.filePath);
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    const waveform = buildWaveformPeaksFromAudioBuffer(audioBuffer);
    const mono = downmixAudioBuffer(audioBuffer);
    const workerMono = new Float32Array(mono);
    const candidate = await findBestLoopInWorker(workerMono, audioBuffer.sampleRate, settings, track.loop).catch(() =>
      findBestLoopResponsiveFallback(mono, audioBuffer.sampleRate, settings, track.loop)
    );
    await closeAudioContext(context);
    context = null;

    if (!candidate) {
      return {
        id: track.id,
        loop: null,
        status: "no-loop",
        validation: `No ${settings.mode === "deep" ? "Deep " : ""}loop candidate reached ${settings.matchThreshold}%.`,
        waveform,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        durationSamples: audioBuffer.length,
        durationMs: (audioBuffer.length / audioBuffer.sampleRate) * 1000
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
    return {
      id: track.id,
      loop: accepted ? loop : null,
      status: accepted ? "detected" : "low-confidence",
      validation: accepted
        ? `Detected${settings.mode === "deep" ? " with Deep" : ""} at ${candidate.confidence.toFixed(1)}%.`
        : `Best ${settings.mode === "deep" ? "Deep " : ""}candidate was ${candidate.confidence.toFixed(1)}%, below the ${acceptanceThreshold}% threshold.`,
      waveform,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      durationSamples: audioBuffer.length,
      durationMs: (audioBuffer.length / audioBuffer.sampleRate) * 1000
    };
  } catch (error) {
    await closeAudioContext(context);
    return {
      id: track.id,
      loop: track.loop,
      status: "error",
      validation: error instanceof Error ? error.message : String(error)
    };
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function downmixAudioBuffer(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let i = 0; i < buffer.length; i += 1) {
      mono[i] += channel[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}

async function findBestLoopResponsiveFallback(
  mono: Float32Array,
  sampleRate: number,
  settings: DetectionSettings,
  metadataLoop: LoopMarker | null
): Promise<LoopCandidate | null> {
  const scheduler = createRendererDetectionScheduler();
  return isLegacyVgostDetectionSettings(settings)
    ? findBestLoopVgostResponsive(mono, sampleRate, settings, metadataLoop, scheduler)
    : settings.mode === "deep"
      ? findBestLoopDeepResponsive(mono, sampleRate, settings, metadataLoop, scheduler)
      : findBestLoopResponsive(mono, sampleRate, settings, metadataLoop, scheduler);
}

function findBestLoopInWorker(
  mono: Float32Array,
  sampleRate: number,
  settings: DetectionSettings,
  metadataLoop: LoopMarker | null
): Promise<LoopCandidate | null> {
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("Worker is unavailable."));
  }
  const worker = new Worker(new URL("./detectWorker.ts", import.meta.url), { type: "module" });
  const requestId = createDetectionRequestId();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    worker.onmessage = (event: MessageEvent<DetectionWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      cleanup();
      if (event.data.ok) {
        resolve(event.data.candidate);
        return;
      }
      reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Worker detection failed."));
    };
    worker.postMessage(
      {
        requestId,
        trackId: "",
        monoBuffer: mono.buffer as ArrayBuffer,
        sampleRate,
        settings,
        metadataLoop
      } satisfies DetectionWorkerRequest,
      [mono.buffer as ArrayBuffer]
    );
  });
}

function createDetectionRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `detect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function closeAudioContext(context: AudioContext | null): Promise<void> {
  if (!context) return;
  try {
    await context.close();
  } catch {
    // Closing can fail if the context is already closed; detection cleanup can ignore it.
  }
}

interface DetectionWorkerRequest {
  requestId: string;
  trackId: string;
  monoBuffer: ArrayBuffer;
  sampleRate: number;
  settings: DetectionSettings;
  metadataLoop: LoopMarker | null;
}

type DetectionWorkerResponse =
  | { requestId: string; ok: true; candidate: LoopCandidate | null }
  | { requestId: string; ok: false; error: string };

function createRendererDetectionScheduler(): { shouldYield: () => boolean; yield: () => Promise<void> } {
  let lastYieldAt = performance.now();
  return {
    shouldYield: () => {
      const now = performance.now();
      const inputActive = hasPendingInput() || now - rendererInputTracker.lastInputAt < 120;
      return now - lastYieldAt >= (inputActive ? 8 : 72);
    },
    yield: async () => {
      const now = performance.now();
      const pendingInput = hasPendingInput();
      await (pendingInput ? waitForNextVisualTurn() : waitForEventLoopTurn());
      lastYieldAt = performance.now();
    }
  };
}

const rendererInputTracker = {
  listening: false,
  lastInputAt: 0
};

interface SchedulingWithInputPending {
  isInputPending?: (options?: { includeContinuous?: boolean }) => boolean;
}

function ensureRendererInputTracking(): void {
  if (rendererInputTracker.listening) return;
  rendererInputTracker.listening = true;
  const markInput = () => {
    rendererInputTracker.lastInputAt = performance.now();
  };
  const options: AddEventListenerOptions = { capture: true, passive: true };
  for (const eventName of ["pointerdown", "pointermove", "pointerup", "dragstart", "drag", "dragover", "drop", "wheel", "keydown"]) {
    window.addEventListener(eventName, markInput, options);
  }
}

function hasPendingInput(): boolean {
  ensureRendererInputTracking();
  try {
    const scheduling = (navigator as Navigator & { scheduling?: SchedulingWithInputPending }).scheduling;
    return Boolean(scheduling?.isInputPending?.({ includeContinuous: true }));
  } catch {
    return false;
  }
}

function waitForEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function waitForNextVisualTurn(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      globalThis.setTimeout(resolve, 0);
    });
  });
}
