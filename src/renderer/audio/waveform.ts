import type { BgmTrack, WaveformPeaks } from "../../shared/types.js";

export function buildWaveformPeaksFromChannels(channels: Float32Array[], targetPoints = 1400): WaveformPeaks {
  const samples = channels[0]?.length ?? 0;
  const resolution = Math.max(1, Math.ceil(samples / targetPoints));
  return {
    resolution,
    channels: channels.map((channel) => {
      const min: number[] = [];
      const max: number[] = [];
      for (let i = 0; i < samples; i += resolution) {
        let lo = 1;
        let hi = -1;
        const end = Math.min(samples, i + resolution);
        for (let j = i; j < end; j += 1) {
          const value = channel[j] ?? 0;
          if (value < lo) lo = value;
          if (value > hi) hi = value;
        }
        min.push(Number.isFinite(lo) ? lo : 0);
        max.push(Number.isFinite(hi) ? hi : 0);
      }
      return { min, max };
    })
  };
}
export function buildWaveformPeaksFromAudioBuffer(buffer: AudioBuffer, targetPoints = 1400): WaveformPeaks {
  const channels: Float32Array[] = [];
  for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
    channels.push(new Float32Array(buffer.getChannelData(channelIndex)));
  }
  return buildWaveformPeaksFromChannels(channels, targetPoints);
}

export async function loadWaveformWithWebAudio(track: Pick<BgmTrack, "filePath">): Promise<WaveformPeaks> {
  let context: AudioContext | null = null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    context = new AudioContextClass();
    const arrayBuffer = await window.gamingLooper.readAudioFile(track.filePath);
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    return buildWaveformPeaksFromAudioBuffer(audioBuffer);
  } finally {
    if (context) {
      try {
        await context.close();
      } catch {
        // Closing can fail if the context is already closed.
      }
    }
  }
}
