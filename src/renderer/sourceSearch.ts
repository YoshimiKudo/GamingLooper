import type { BgmTrack } from "../shared/types.js";

const noMatchRank = Number.POSITIVE_INFINITY;

export function filterAndSortSourceTracks(sourceTracks: BgmTrack[], query: string): BgmTrack[] {
  const normalizedQuery = normalizeSourceSearchText(query);
  if (!normalizedQuery) return sourceTracks;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return sourceTracks
    .map((track, index) => ({
      track,
      index,
      rank: getSourceTrackSearchRank(track, normalizedQuery, tokens)
    }))
    .filter((entry) => entry.rank !== noMatchRank)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.track);
}

function getSourceTrackSearchRank(track: BgmTrack, query: string, tokens: string[]): number {
  const fileName = normalizeSourceSearchText(track.fileName);
  const filePath = normalizeSourceSearchText(track.filePath);
  const matchesAllTokens = tokens.every((token) => fileName.includes(token) || filePath.includes(token));
  if (!matchesAllTokens) return noMatchRank;

  if (fileName.startsWith(query)) return 0;
  if (fileName.includes(query)) return 1;
  if (tokens.every((token) => fileName.includes(token))) return 2;
  if (filePath.includes(query)) return 3;
  return 4;
}

function normalizeSourceSearchText(value: string): string {
  return value.trim().toLowerCase();
}
