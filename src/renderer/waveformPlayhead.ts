export interface WaveformPlayheadNode {
  setAttribute(name: string, value: string): void;
}

export function getWaveformPlayheadX(currentMs: number, durationMs: number, width = 1200): number {
  const safeDuration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const safeCurrent = Number.isFinite(currentMs) ? currentMs : 0;
  if (safeDuration <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, safeCurrent / safeDuration));
  return ratio * width;
}

export function applyWaveformPlayheadPosition(node: WaveformPlayheadNode, currentMs: number, durationMs: number): void {
  const x = String(getWaveformPlayheadX(currentMs, durationMs));
  node.setAttribute("x1", x);
  node.setAttribute("x2", x);
}
