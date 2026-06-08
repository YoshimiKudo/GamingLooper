export interface OrderedPlaylistItem {
  id: string;
}

export interface EnabledPlaylistItem {
  enabled: boolean;
}

export function getEnabledPlaylistItems<T extends EnabledPlaylistItem>(items: T[]): T[] {
  return items.filter((item) => item.enabled);
}

export function insertPlaylistItemAt<T>(items: T[], item: T, targetIndex?: number): T[] {
  const playlist = [...items];
  const safeIndex =
    typeof targetIndex === "number" && Number.isFinite(targetIndex)
      ? Math.max(0, Math.min(playlist.length, Math.floor(targetIndex)))
      : playlist.length;
  playlist.splice(safeIndex, 0, item);
  return playlist;
}

export function reorderPlaylistItems<T extends OrderedPlaylistItem>(items: T[], id: string, targetIndex: number): T[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return items;
  const safeTargetIndex = Math.max(0, Math.min(items.length, targetIndex));
  if (index === safeTargetIndex || index + 1 === safeTargetIndex) return items;
  const playlist = [...items];
  const [item] = playlist.splice(index, 1);
  if (!item) return items;
  playlist.splice(index < safeTargetIndex ? safeTargetIndex - 1 : safeTargetIndex, 0, item);
  return playlist;
}
