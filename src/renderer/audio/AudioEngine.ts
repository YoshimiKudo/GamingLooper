import type { BgmTrack, MixSettings, SeFile } from "../../shared/types.js";

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner?: StereoPannerNode;
  startedAt: number;
  playbackKey?: string;
}

interface SePlaybackOptions {
  volume?: number;
  pan?: number;
  playbackKey?: string;
}

export type SePreloadStatus = "loading" | "ready" | "error";

export interface SePreloadProgress {
  filePath: string;
  fileName: string;
  status: SePreloadStatus;
  completed: number;
  total: number;
  error?: string;
}

export interface SePreloadReport {
  total: number;
  results: SePreloadProgress[];
}

export interface SePlaybackSnapshot {
  fileId: string;
  playbackKey?: string;
  startedAtSec: number;
  durationMs: number;
}

export interface AudioDebugSnapshot {
  contextState: AudioContextState | null;
  currentTimeSec: number | null;
  baseLatencySec: number | null;
  outputLatencySec: number | null;
  bgmSourceCount: number;
  bgmLoopActive: boolean;
  bgmLoopLengthSec: number | null;
  debugPlaybackRate: number;
  bgmPositionMs: number;
  bgmLoopLateLastMs: number;
  bgmLoopLateMaxMs: number;
  seVoiceCount: number;
  bufferCacheSize: number;
  bufferLoadCacheSize: number;
}

interface BgmSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
  startAtSec: number;
  startGain: number;
  targetGain: number;
  fadeInSec?: number;
  fadeOutStartSec?: number;
  fadeOutSec?: number;
  stopFadeStartSec?: number;
  stopFadeSec?: number;
  stopFadeStartGain?: number;
  stopping?: boolean;
}

interface BgmLoopState {
  startSec: number;
  endSec: number;
  lengthSec: number;
  crossfadeSec: number;
}

const LOOP_CROSSFADE_SEC = 0.008;
const LOOP_SCHEDULE_LOOKAHEAD_SEC = 0.12;

export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private seGain: GainNode | null = null;
  private outputLimiter: DynamicsCompressorNode | null = null;
  private outputLimiterEnabled = true;
  private outputLimiterRouted: boolean | null = null;
  private bgmAnalyser: AnalyserNode | null = null;
  private seAnalyser: AnalyserNode | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private bufferLoadCache = new Map<string, Promise<AudioBuffer>>();
  private preloadToken = 0;
  private bgmSources: BgmSource[] = [];
  private bgmLoopTimer: number | null = null;
  private bgmLoopState: BgmLoopState | null = null;
  private bgmSessionId = 0;
  private bgmStartedAt = 0;
  private bgmOffsetSec = 0;
  private bgmTrackVolume = 1;
  private bgmLoopLateLastSec = 0;
  private bgmLoopLateMaxSec = 0;
  private debugPlaybackRate = 1;
  private voices: Voice[] = [];
  private latestSePlayback: SePlaybackSnapshot | null = null;
  private seTransientLevel = 0;
  private seTransientUntilSec = 0;

  async ready(): Promise<AudioContext> {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.bgmGain = this.context.createGain();
      this.seGain = this.context.createGain();
      this.outputLimiter = this.context.createDynamicsCompressor();
      this.bgmAnalyser = this.context.createAnalyser();
      this.seAnalyser = this.context.createAnalyser();
      configureOutputLimiter(this.outputLimiter);
      configureAnalyser(this.bgmAnalyser, 1024, 0.76);
      configureAnalyser(this.seAnalyser, 1024, 0.38);
      this.bgmGain.connect(this.bgmAnalyser);
      this.seGain.connect(this.seAnalyser);
      this.bgmAnalyser.connect(this.masterGain);
      this.seAnalyser.connect(this.masterGain);
      this.updateOutputLimiterRouting(this.outputLimiterEnabled);
    }
    if (this.context.state !== "running") {
      await this.context.resume();
    }
    return this.context;
  }

  setMix(settings: MixSettings): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.updateOutputLimiterRouting(settings.outputLimiterEnabled !== false);
    this.masterGain?.gain.setTargetAtTime(clampGain(settings.masterGain), now, 0.025);
    this.bgmGain?.gain.setTargetAtTime(clampGain(settings.bgmGain), now, 0.025);
    this.seGain?.gain.setTargetAtTime(clampGain(settings.seGain), now, 0.025);
  }

  private updateOutputLimiterRouting(enabled: boolean): void {
    if (!this.context || !this.masterGain) {
      this.outputLimiterEnabled = enabled;
      return;
    }
    if (this.outputLimiterRouted === enabled) return;
    this.outputLimiterEnabled = enabled;
    this.outputLimiterRouted = enabled;
    try {
      this.masterGain.disconnect();
    } catch {
      // Output routing may already be disconnected during initialization.
    }
    try {
      this.outputLimiter?.disconnect();
    } catch {
      // Output routing may already be disconnected during initialization.
    }
    if (enabled && this.outputLimiter) {
      this.masterGain.connect(this.outputLimiter);
      this.outputLimiter.connect(this.context.destination);
      return;
    }
    this.masterGain.connect(this.context.destination);
  }

  setCurrentBgmVolume(volume: number): void {
    this.bgmTrackVolume = clampTrackVolume(volume);
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const item of this.bgmSources) {
      if (item.stopping) continue;
      item.targetGain = this.bgmTrackVolume;
      if (item.fadeOutStartSec !== undefined && now >= item.fadeOutStartSec) continue;
      item.gain.gain.setTargetAtTime(this.bgmTrackVolume, now, 0.018);
    }
  }

  setDebugPlaybackRate(rate: number): void {
    this.debugPlaybackRate = clampPlaybackRate(rate);
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const item of this.bgmSources) {
      item.source.playbackRate.setTargetAtTime(this.debugPlaybackRate, now, 0.015);
    }
    for (const voice of this.voices) {
      voice.source.playbackRate.setTargetAtTime(this.debugPlaybackRate, now, 0.015);
    }
  }

  async playBgm(track: BgmTrack, options: { loop: boolean; offsetMs?: number } = { loop: true }): Promise<void> {
    const context = await this.ready();
    const buffer = await this.getBuffer(track.filePath);
    this.stopBgm(80);

    const sessionId = ++this.bgmSessionId;
    const loopState = createLoopState(track, buffer, options.loop);
    let offsetSec = Math.max(0, Math.min(buffer.duration - 0.01, (options.offsetMs ?? 0) / 1000));
    if (loopState) {
      offsetSec = normalizeLoopOffset(offsetSec, loopState);
    }

    this.bgmTrackVolume = clampTrackVolume(track.volume);
    this.bgmLoopState = loopState;
    this.bgmStartedAt = context.currentTime;
    this.bgmOffsetSec = offsetSec;

    if (loopState) {
      this.startLoopedBgm(buffer, offsetSec, context.currentTime, loopState, sessionId);
      return;
    }

    this.startBgmSource(buffer, offsetSec, context.currentTime, sessionId);
  }

  stopBgm(fadeMs = 120): void {
    this.fadeOutBgm(fadeMs);
  }

  fadeOutBgm(fadeMs = 120): void {
    if (!this.context) return;
    this.bgmSessionId += 1;
    this.clearBgmLoopTimer();
    this.bgmLoopState = null;

    const sources = [...this.bgmSources];
    if (sources.length === 0) return;

    const now = this.context.currentTime;
    const fadeSec = Math.max(0.01, fadeMs / 1000);
    for (const item of sources) {
      this.fadeBgmSourceToStop(item, now, fadeSec);
    }
  }

  async playSe(file: SeFile, voiceLimit: number, options: SePlaybackOptions = {}): Promise<SePlaybackSnapshot> {
    const context = await this.ready();
    const buffer = this.bufferCache.get(file.filePath);
    if (!buffer) {
      const detail = this.bufferLoadCache.has(file.filePath) ? "still loading" : "not preloaded";
      throw new Error(`SE is ${detail}: ${file.fileName}`);
    }
    this.trimEndedVoices();
    if (options.playbackKey) {
      this.stopVoices((voice) => voice.playbackKey === options.playbackKey, 14);
    }
    while (this.voices.length >= Math.max(1, voiceLimit)) {
      this.stopVoice(this.voices.shift(), 28);
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    source.buffer = buffer;
    source.playbackRate.value = this.debugPlaybackRate;
    source.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(this.seGain!);
      panner.pan.value = clampPan(options.pan);
    } else {
      gain.connect(this.seGain!);
    }
    gain.gain.value = clampTrackVolume(options.volume ?? 1);
    const startedAtSec = context.currentTime;
    const voice: Voice = { source, gain, panner: panner ?? undefined, startedAt: startedAtSec, playbackKey: options.playbackKey };
    const playback: SePlaybackSnapshot = {
      fileId: file.id,
      playbackKey: options.playbackKey,
      startedAtSec,
      durationMs: Math.max(1, file.durationMs || buffer.duration * 1000)
    };
    source.onended = () => {
      this.voices = this.voices.filter((item) => item !== voice);
    };
    this.voices.push(voice);
    this.latestSePlayback = playback;
    this.markSeTransient(clampTrackVolume(options.volume ?? 1));
    source.start(startedAtSec);
    return playback;
  }

  updateActiveSeSettings(playbackKey: string, options: { volume?: number; pan?: number }): void {
    if (!this.context) return;
    this.trimEndedVoices();
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      if (voice.playbackKey !== playbackKey) continue;
      if (options.volume !== undefined) {
        voice.gain.gain.setTargetAtTime(clampTrackVolume(options.volume), now, 0.018);
      }
      if (options.pan !== undefined && voice.panner) {
        voice.panner.pan.setTargetAtTime(clampPan(options.pan), now, 0.018);
      }
    }
  }

  async preloadSeFiles(
    files: SeFile[],
    options: { concurrency?: number; onProgress?: (progress: SePreloadProgress) => void } = {}
  ): Promise<SePreloadReport> {
    const uniqueFiles = Array.from(new Map(files.filter((file) => file.filePath.length > 0).map((file) => [file.filePath, file])).values());
    const total = uniqueFiles.length;
    const results: SePreloadProgress[] = [];
    const token = ++this.preloadToken;
    const concurrency = Math.max(1, Math.min(4, Math.round(options.concurrency ?? 3)));
    let nextIndex = 0;
    let completed = 0;

    const emit = (progress: SePreloadProgress) => {
      options.onProgress?.(progress);
    };

    const preloadOne = async (file: SeFile): Promise<void> => {
      if (this.bufferCache.has(file.filePath)) {
        completed += 1;
        const progress = { filePath: file.filePath, fileName: file.fileName, status: "ready" as const, completed, total };
        results.push(progress);
        emit(progress);
        return;
      }

      emit({ filePath: file.filePath, fileName: file.fileName, status: "loading", completed, total });
      try {
        await this.getBuffer(file.filePath);
        if (token !== this.preloadToken) return;
        completed += 1;
        const progress = { filePath: file.filePath, fileName: file.fileName, status: "ready" as const, completed, total };
        results.push(progress);
        emit(progress);
      } catch (error) {
        if (token !== this.preloadToken) return;
        completed += 1;
        const progress = {
          filePath: file.filePath,
          fileName: file.fileName,
          status: "error" as const,
          completed,
          total,
          error: error instanceof Error ? error.message : String(error)
        };
        results.push(progress);
        emit(progress);
      }
    };

    const worker = async (): Promise<void> => {
      while (token === this.preloadToken) {
        const file = uniqueFiles[nextIndex];
        nextIndex += 1;
        if (!file) return;
        await preloadOne(file);
        if (token !== this.preloadToken) return;
        await waitForNextTask();
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
    return { total, results };
  }

  cancelSePreload(): void {
    this.preloadToken += 1;
  }

  isSeReady(filePath: string): boolean {
    return this.bufferCache.has(filePath);
  }

  getSePreloadStatus(filePath: string): SePreloadStatus | "idle" {
    if (this.bufferCache.has(filePath)) return "ready";
    if (this.bufferLoadCache.has(filePath)) return "loading";
    return "idle";
  }

  stopAllSe(fadeMs = 40): void {
    for (const voice of this.voices) {
      this.stopVoice(voice, fadeMs);
    }
    this.voices = [];
    this.latestSePlayback = null;
  }

  stopSeByPlaybackKey(playbackKey: string, fadeMs = 28): boolean {
    if (!this.context) return false;
    this.trimEndedVoices();
    const before = this.voices.length;
    this.stopVoices((voice) => voice.playbackKey === playbackKey, fadeMs);
    const stopped = this.voices.length !== before;
    if (this.latestSePlayback?.playbackKey === playbackKey) {
      this.latestSePlayback = null;
    }
    return stopped;
  }

  getActiveVoiceCount(): number {
    this.trimEndedVoices();
    return this.voices.length;
  }

  getActiveSePlaybackKeys(): string[] {
    this.trimEndedVoices();
    const keys = new Set<string>();
    for (const voice of this.voices) {
      if (voice.playbackKey) keys.add(voice.playbackKey);
    }
    return Array.from(keys);
  }

  getBgmPositionMs(): number {
    if (!this.context || this.bgmSources.length === 0) return 0;
    const elapsedSec = Math.max(0, (this.context.currentTime - this.bgmStartedAt) * this.debugPlaybackRate + this.bgmOffsetSec);
    if (!this.bgmLoopState || elapsedSec < this.bgmLoopState.startSec) {
      return elapsedSec * 1000;
    }
    const loopElapsedSec = elapsedSec - this.bgmLoopState.startSec;
    return (this.bgmLoopState.startSec + (loopElapsedSec % this.bgmLoopState.lengthSec)) * 1000;
  }

  getLatestSePositionMs(fileId?: string): number {
    if (!this.context || !this.latestSePlayback) return 0;
    if (fileId && this.latestSePlayback.fileId !== fileId) return 0;
    const elapsedMs = (this.context.currentTime - this.latestSePlayback.startedAtSec) * this.debugPlaybackRate * 1000;
    return Math.min(this.latestSePlayback.durationMs, Math.max(0, elapsedMs));
  }

  getBgmAnalyser(): AnalyserNode | null {
    return this.bgmAnalyser;
  }

  getSeAnalyser(): AnalyserNode | null {
    return this.seAnalyser;
  }

  getSeTransientLevel(): number {
    if (!this.context) return 0;
    const remaining = this.seTransientUntilSec - this.context.currentTime;
    if (remaining <= 0) {
      this.seTransientLevel = 0;
      return 0;
    }
    return clampTrackVolume(this.seTransientLevel * Math.min(1, remaining / 0.18));
  }

  getDebugSnapshot(): AudioDebugSnapshot {
    return {
      contextState: this.context?.state ?? null,
      currentTimeSec: this.context ? roundNumber(this.context.currentTime, 3) : null,
      baseLatencySec: this.context ? roundNumber(this.context.baseLatency ?? 0, 4) : null,
      outputLatencySec: this.context ? roundNumber(this.context.outputLatency ?? 0, 4) : null,
      bgmSourceCount: this.bgmSources.length,
      bgmLoopActive: Boolean(this.bgmLoopState),
      bgmLoopLengthSec: this.bgmLoopState ? roundNumber(this.bgmLoopState.lengthSec, 3) : null,
      debugPlaybackRate: this.debugPlaybackRate,
      bgmPositionMs: Math.round(this.getBgmPositionMs()),
      bgmLoopLateLastMs: Math.round(this.bgmLoopLateLastSec * 1000),
      bgmLoopLateMaxMs: Math.round(this.bgmLoopLateMaxSec * 1000),
      seVoiceCount: this.getActiveVoiceCount(),
      bufferCacheSize: this.bufferCache.size,
      bufferLoadCacheSize: this.bufferLoadCache.size
    };
  }

  private async getBuffer(filePath: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(filePath);
    if (cached) return cached;
    const loading = this.bufferLoadCache.get(filePath);
    if (loading) return loading;
    const load = this.loadBuffer(filePath);
    this.bufferLoadCache.set(filePath, load);
    try {
      const buffer = await load;
      this.bufferCache.set(filePath, buffer);
      return buffer;
    } finally {
      this.bufferLoadCache.delete(filePath);
    }
  }

  private async loadBuffer(filePath: string): Promise<AudioBuffer> {
    const context = await this.ready();
    const arrayBuffer = await window.gamingLooper.readAudioFile(filePath);
    return context.decodeAudioData(arrayBuffer.slice(0));
  }

  private startLoopedBgm(buffer: AudioBuffer, offsetSec: number, startAtSec: number, loopState: BgmLoopState, sessionId: number): void {
    const firstSegmentSec = Math.max(loopState.crossfadeSec + 0.005, loopState.endSec - offsetSec);
    const firstFadeOutStartSec = startAtSec + (firstSegmentSec - loopState.crossfadeSec) / this.debugPlaybackRate;
    this.startBgmSource(buffer, offsetSec, startAtSec, sessionId, {
      fadeOutStartSec: firstFadeOutStartSec,
      fadeOutSec: loopState.crossfadeSec / this.debugPlaybackRate,
      stopAtSec: startAtSec + firstSegmentSec / this.debugPlaybackRate + 0.03
    });
    this.scheduleLoopSource(buffer, firstFadeOutStartSec, loopState, sessionId);
  }

  private scheduleLoopSource(buffer: AudioBuffer, startAtSec: number, loopState: BgmLoopState, sessionId: number): void {
    if (!this.context) return;
    this.clearBgmLoopTimer();
    const delayMs = Math.max(0, (startAtSec - this.context.currentTime - LOOP_SCHEDULE_LOOKAHEAD_SEC) * 1000);
    this.bgmLoopTimer = window.setTimeout(() => {
      if (!this.context || this.bgmSessionId !== sessionId || this.bgmLoopState !== loopState) return;
      const lateBySec = Math.max(0, this.context.currentTime - startAtSec);
      this.bgmLoopLateLastSec = lateBySec;
      this.bgmLoopLateMaxSec = Math.max(this.bgmLoopLateMaxSec, lateBySec);
      const sourceOffsetSec = Math.min(loopState.endSec - loopState.crossfadeSec - 0.005, loopState.startSec + lateBySec * this.debugPlaybackRate);
      const actualStartAtSec = Math.max(this.context.currentTime, startAtSec);
      const segmentSec = Math.max(loopState.crossfadeSec + 0.005, loopState.endSec - sourceOffsetSec);
      const fadeOutStartSec = actualStartAtSec + (segmentSec - loopState.crossfadeSec) / this.debugPlaybackRate;

      this.startBgmSource(buffer, sourceOffsetSec, actualStartAtSec, sessionId, {
        fadeInSec: loopState.crossfadeSec / this.debugPlaybackRate,
        fadeOutStartSec,
        fadeOutSec: loopState.crossfadeSec / this.debugPlaybackRate,
        stopAtSec: actualStartAtSec + segmentSec / this.debugPlaybackRate + 0.03
      });
      this.scheduleLoopSource(buffer, fadeOutStartSec, loopState, sessionId);
    }, delayMs);
  }

  private startBgmSource(
    buffer: AudioBuffer,
    offsetSec: number,
    startAtSec: number,
    sessionId: number,
    options: { fadeInSec?: number; fadeOutStartSec?: number; fadeOutSec?: number; stopAtSec?: number } = {}
  ): void {
    if (!this.context || !this.bgmGain) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const startGain = options.fadeInSec ? 0.0001 : this.bgmTrackVolume;
    const fadeOutSec = options.fadeOutStartSec !== undefined ? options.fadeOutSec ?? LOOP_CROSSFADE_SEC : undefined;
    source.buffer = buffer;
    source.playbackRate.value = this.debugPlaybackRate;
    source.connect(gain);
    gain.connect(this.bgmGain);
    gain.gain.setValueAtTime(startGain, startAtSec);

    if (options.fadeInSec) {
      gain.gain.linearRampToValueAtTime(this.bgmTrackVolume, startAtSec + options.fadeInSec);
    }
    if (options.fadeOutStartSec !== undefined) {
      gain.gain.setValueAtTime(this.bgmTrackVolume, options.fadeOutStartSec);
      gain.gain.linearRampToValueAtTime(0.0001, options.fadeOutStartSec + fadeOutSec!);
    }

    const item: BgmSource = {
      source,
      gain,
      startAtSec,
      startGain,
      targetGain: this.bgmTrackVolume,
      fadeInSec: options.fadeInSec,
      fadeOutStartSec: options.fadeOutStartSec,
      fadeOutSec
    };
    this.bgmSources.push(item);
    source.onended = () => {
      this.bgmSources = this.bgmSources.filter((entry) => entry !== item);
    };
    source.start(startAtSec, Math.max(0, offsetSec));
    if (options.stopAtSec !== undefined) {
      source.stop(options.stopAtSec);
    }
  }

  private fadeBgmSourceToStop(item: BgmSource, now: number, fadeSec: number): void {
    item.stopping = true;
    const currentGain = this.getBgmSourceGainAt(item, now);
    item.stopFadeStartSec = now;
    item.stopFadeSec = fadeSec;
    item.stopFadeStartGain = currentGain;
    item.gain.gain.cancelScheduledValues(now);
    item.gain.gain.setValueAtTime(currentGain, now);
    item.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    try {
      item.source.stop(now + fadeSec + 0.02);
    } catch {
      // Already stopped sources can be ignored during transport cleanup.
    }
  }

  private getBgmSourceGainAt(item: BgmSource, now: number): number {
    if (item.stopFadeStartSec !== undefined && item.stopFadeSec !== undefined && item.stopFadeStartGain !== undefined && now >= item.stopFadeStartSec) {
      return interpolateGain(item.stopFadeStartGain, 0.0001, (now - item.stopFadeStartSec) / item.stopFadeSec);
    }
    if (now < item.startAtSec) return item.startGain;
    if (item.fadeInSec !== undefined && item.fadeInSec > 0 && now < item.startAtSec + item.fadeInSec) {
      return interpolateGain(item.startGain, item.targetGain, (now - item.startAtSec) / item.fadeInSec);
    }
    if (item.fadeOutStartSec !== undefined && item.fadeOutSec !== undefined && item.fadeOutSec > 0 && now >= item.fadeOutStartSec) {
      return interpolateGain(item.targetGain, 0.0001, (now - item.fadeOutStartSec) / item.fadeOutSec);
    }
    return item.targetGain;
  }

  private clearBgmLoopTimer(): void {
    if (this.bgmLoopTimer === null) return;
    window.clearTimeout(this.bgmLoopTimer);
    this.bgmLoopTimer = null;
  }

  private stopVoice(voice: Voice | undefined, fadeMs: number): void {
    if (!voice || !this.context) return;
    const now = this.context.currentTime;
    const fadeSec = Math.max(0.005, fadeMs / 1000);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
    try {
      voice.source.stop(now + fadeSec + 0.01);
    } catch {
      // Already stopped voices can be ignored when restarting the same key.
    }
  }

  private stopVoices(predicate: (voice: Voice) => boolean, fadeMs: number): void {
    const stopping = this.voices.filter(predicate);
    if (stopping.length === 0) return;
    for (const voice of stopping) {
      this.stopVoice(voice, fadeMs);
    }
    this.voices = this.voices.filter((voice) => !predicate(voice));
  }

  private markSeTransient(volume: number): void {
    if (!this.context) return;
    this.seTransientLevel = Math.max(this.seTransientLevel, 0.35 + clampTrackVolume(volume) * 0.65);
    this.seTransientUntilSec = Math.max(this.seTransientUntilSec, this.context.currentTime + 0.18);
  }

  private trimEndedVoices(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.voices = this.voices.filter((voice) => now - voice.startedAt < 120);
  }

}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function clampGain(value: number): number {
  return Math.min(1.2, Math.max(0, value));
}

function clampTrackVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 1));
}

function clampPlaybackRate(value: number): number {
  if (value === 4 || value === 8) return value;
  return 1;
}

function clampPan(value: number | undefined): number {
  return Math.min(1, Math.max(-1, typeof value === "number" && Number.isFinite(value) ? value : 0));
}

function roundNumber(value: number, digits: number): number {
  const scale = Math.pow(10, digits);
  return Math.round(value * scale) / scale;
}

function interpolateGain(from: number, to: number, progress: number): number {
  const safeProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return from + (to - from) * safeProgress;
}

function createLoopState(track: BgmTrack, buffer: AudioBuffer, loopEnabled: boolean): BgmLoopState | null {
  if (!loopEnabled || !track.loop || track.sampleRate <= 0) return null;
  const rawStartSec = track.loop.startSample / track.sampleRate;
  const rawEndSec = track.loop.endSample / track.sampleRate;
  const startSec = Math.max(0, Math.min(buffer.duration - 0.01, rawStartSec));
  const endSec = Math.max(startSec + 0.01, Math.min(buffer.duration, rawEndSec));
  const lengthSec = endSec - startSec;
  if (lengthSec <= 0.01) return null;
  const crossfadeSec = Math.min(LOOP_CROSSFADE_SEC, Math.max(0.005, lengthSec / 4));
  return { startSec, endSec, lengthSec, crossfadeSec };
}

function normalizeLoopOffset(offsetSec: number, loopState: BgmLoopState): number {
  const latestStartSec = loopState.endSec - loopState.crossfadeSec - 0.005;
  if (offsetSec >= latestStartSec) return loopState.startSec;
  return Math.max(0, offsetSec);
}

function configureAnalyser(analyser: AnalyserNode, fftSize: number, smoothingTimeConstant: number): void {
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = smoothingTimeConstant;
}

function configureOutputLimiter(limiter: DynamicsCompressorNode): void {
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.09;
}

function waitForNextTask(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 12));
}
