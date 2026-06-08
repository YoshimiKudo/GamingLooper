export const SOURCE_TRACK_DRAG_TYPE = "application/x-gaminglooper-source-track";
export const SOURCE_TRACKS_DRAG_TYPE = "application/x-gaminglooper-source-tracks";
export const PLAYLIST_ITEM_DRAG_TYPE = "application/x-gaminglooper-playlist-item";

export function hasSourceTrackDragType(types: Iterable<string>): boolean {
  const values = new Set(Array.from(types));
  return values.has(SOURCE_TRACKS_DRAG_TYPE) || values.has(SOURCE_TRACK_DRAG_TYPE);
}

export function parseSourceTrackDragIds(packedIds: string, singleId: string, fallbackText: string): string[] {
  if (packedIds) {
    try {
      const parsed = JSON.parse(packedIds);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
      }
    } catch {
      return [];
    }
  }
  const id = singleId || fallbackText;
  return id ? [id] : [];
}

export function filterSourceDragDropIds(trackIds: Iterable<string>, sourceTrackIds: Iterable<string>): string[] {
  const sourceIds = new Set(sourceTrackIds);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of trackIds) {
    if (!sourceIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function selectSourceDragTrackIds(
  trackId: string,
  selectedTrackIds: Iterable<string>,
  sourceTrackIds: Iterable<string>,
  scanningTrackId: string | null
): string[] {
  const sourceIds = Array.from(sourceTrackIds);
  if (scanningTrackId === trackId || !sourceIds.includes(trackId)) return [];
  const selected = new Set(selectedTrackIds);
  if (!selected.has(trackId)) return [trackId];
  return sourceIds.filter((id) => selected.has(id) && id !== scanningTrackId);
}

export function shouldSwitchSourceDragToRangeSelection({
  deltaX,
  deltaY,
  rowHeightPx
}: {
  deltaX: number;
  deltaY: number;
  rowHeightPx: number;
}): boolean {
  const verticalDistance = Math.abs(deltaY);
  const horizontalDistance = Math.abs(deltaX);
  const rowThreshold = Math.max(80, Math.max(1, rowHeightPx) * 2);
  const maxHorizontalDrift = Math.max(28, verticalDistance * 0.3);
  return verticalDistance >= rowThreshold && horizontalDistance <= maxHorizontalDrift;
}

export function shouldLockSourceDragToCardMove({
  deltaX,
  deltaY,
  rowHeightPx,
  rowWidthPx
}: {
  deltaX: number;
  deltaY: number;
  rowHeightPx: number;
  rowWidthPx: number;
}): boolean {
  const verticalDistance = Math.abs(deltaY);
  const horizontalDistance = Math.abs(deltaX);
  const verticalThreshold = Math.max(80, Math.max(1, rowHeightPx) * 2);
  const horizontalThreshold = Math.max(80, Math.min(Math.max(1, rowHeightPx), Math.max(1, rowWidthPx)) * 2);
  return verticalDistance < verticalThreshold && horizontalDistance >= horizontalThreshold;
}
