import type { BgmTrack, GamingProject } from "./types.js";

export interface SourceClearResult {
  project: GamingProject;
  clearedIds: string[];
  skippedReferencedIds: string[];
}

export function clearVisibleSourceTracks(project: GamingProject, visibleSourceTrackIds: Iterable<string>): SourceClearResult {
  const requestedIds = new Set(visibleSourceTrackIds);
  if (requestedIds.size === 0) {
    return { project, clearedIds: [], skippedReferencedIds: [] };
  }

  const referencedIds = getReferencedBgmTrackIds(project);
  const clearedIds: string[] = [];
  const skippedReferencedIds: string[] = [];
  for (const id of requestedIds) {
    if (referencedIds.has(id)) {
      skippedReferencedIds.push(id);
    } else {
      clearedIds.push(id);
    }
  }

  if (clearedIds.length === 0 && skippedReferencedIds.length === 0) {
    return { project, clearedIds, skippedReferencedIds };
  }

  const clearIdSet = new Set(clearedIds);
  const hiddenIdSet = new Set([...(project.sourceHiddenTrackIds ?? []), ...skippedReferencedIds]);
  for (const id of clearIdSet) {
    hiddenIdSet.delete(id);
  }
  const unavailableIdSet = new Set([...clearIdSet, ...skippedReferencedIds]);
  const bgmTracks = project.bgmTracks.filter((track) => !clearIdSet.has(track.id));
  return {
    project: {
      ...project,
      bgmTracks,
      sourceHiddenTrackIds: Array.from(hiddenIdSet).filter((id) => bgmTracks.some((track) => track.id === id)),
      selectedTrackId: getNextSelectedTrackId(project.selectedTrackId, unavailableIdSet, project.playlist.map((item) => item.trackId), bgmTracks)
    },
    clearedIds,
    skippedReferencedIds
  };
}

function getReferencedBgmTrackIds(project: GamingProject): Set<string> {
  const ids = new Set<string>();
  project.playlist.forEach((item) => ids.add(item.trackId));
  project.savedPlaylists.forEach((playlist) => playlist.items.forEach((item) => ids.add(item.trackId)));
  return ids;
}

function getNextSelectedTrackId(
  currentId: string | null,
  unavailableIds: Set<string>,
  playlistTrackIds: string[],
  bgmTracks: BgmTrack[]
): string | null {
  if (!currentId || !unavailableIds.has(currentId)) return currentId;
  return playlistTrackIds.find((id) => !unavailableIds.has(id)) ?? bgmTracks.find((track) => !unavailableIds.has(track.id))?.id ?? null;
}
