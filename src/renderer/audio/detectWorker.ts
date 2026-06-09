import { findBestLoop, findBestLoopDeep, findBestLoopVgost } from "../../shared/detectCore.js";
import type { LoopCandidate } from "../../shared/detectCore.js";
import type { DetectionSettings, LoopMarker } from "../../shared/types.js";
import { isLegacyVgostDetectionSettings } from "../../shared/project.js";

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

interface DetectionWorkerScope {
  onmessage: ((event: MessageEvent<DetectionWorkerRequest>) => void) | null;
  postMessage: (message: DetectionWorkerResponse) => void;
}

const workerScope = self as unknown as DetectionWorkerScope;

workerScope.onmessage = (event: MessageEvent<DetectionWorkerRequest>) => {
  const { requestId, monoBuffer, sampleRate, settings, metadataLoop } = event.data;
  try {
    const mono = new Float32Array(monoBuffer);
    const candidate = isLegacyVgostDetectionSettings(settings)
      ? findBestLoopVgost(mono, sampleRate, settings, metadataLoop)
      : settings.mode === "deep"
        ? findBestLoopDeep(mono, sampleRate, settings, metadataLoop)
        : findBestLoop(mono, sampleRate, settings, metadataLoop);
    workerScope.postMessage({ requestId, ok: true, candidate } satisfies DetectionWorkerResponse);
  } catch (error) {
    workerScope.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    } satisfies DetectionWorkerResponse);
  }
};
