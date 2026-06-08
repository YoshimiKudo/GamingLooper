import type { BgmTrack, PlaylistEndBehavior, PlaylistRule } from "./types.js";
import { sampleToMs } from "./format.js";

export const PLAYLIST_TRANSITION_GAP_MS = 120;

export function getPlaylistPlayMs(track: BgmTrack, rule: PlaylistRule): number {
  if (!track.loop || rule.mode === "straight") {
    return Math.max(1000, track.durationMs);
  }
  if (rule.mode === "duration") {
    return Math.max(1000, Math.max(rule.durationMs, getPlaylistMinimumDurationMs(track, rule)));
  }
  const introMs = sampleToMs(track.loop.startSample, track.sampleRate);
  const loopMs = sampleToMs(track.loop.lengthSamples, track.sampleRate);
  const loopEndMs = introMs + loopMs * Math.max(1, rule.loopCount);
  return Math.max(1000, loopEndMs + getRuleFadeMs(rule));
}

export function getPlaylistMinimumDurationMs(track: BgmTrack, rule: PlaylistRule): number {
  if (!track.loop || rule.mode === "straight") return 1000;
  const loopStartMs = sampleToMs(track.loop.startSample, track.sampleRate);
  const boundaryMs = loopStartMs + getRuleFadeMs(rule);
  return Math.max(1000, (Math.floor(boundaryMs / 1000) + 1) * 1000);
}

export function getPlaylistDurationInputMs(track: BgmTrack, rule: PlaylistRule): number {
  if (rule.mode === "duration") return rule.durationMs;
  return rule.durationMs ?? getPlaylistPlayMs(track, rule);
}

export function getPlaylistFadeMs(track: BgmTrack, rule: PlaylistRule): number {
  if (!track.loop || rule.mode === "straight") return 0;
  return Math.min(getRuleFadeMs(rule), getPlaylistPlayMs(track, rule));
}

export function getPlaylistFadeStartMs(plannedMs: number, fadeMs: number): number {
  const safePlannedMs = Math.max(0, plannedMs);
  const safeFadeMs = Math.max(0, Math.min(fadeMs, safePlannedMs));
  return Math.max(0, safePlannedMs - safeFadeMs);
}

export function getPlaylistTransitionDelayMs(plannedMs: number): number {
  return Math.max(0, plannedMs) + PLAYLIST_TRANSITION_GAP_MS;
}

export function getNextPlaylistIndex(currentIndex: number, playlistLength: number, endBehavior: PlaylistEndBehavior): number | null {
  if (playlistLength <= 0) return null;
  const nextIndex = currentIndex + 1;
  if (nextIndex >= playlistLength && endBehavior === "stop") return null;
  return nextIndex % playlistLength;
}

export function getRuleFadeMs(rule: PlaylistRule): number {
  return Math.max(0, rule.fadeOutMs);
}
