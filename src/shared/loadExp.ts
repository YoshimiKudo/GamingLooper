export const loadExpOverflowBonusMax = 1_000_000_000_000;
export const listRegistrationExpAward = 5;
export const sePlaybackMinorExpChance = 1 / 16;
export const sePlaybackMajorExpChance = 1 / 64;
export const sePlaybackMajorExpAward = 30;
export const sePlaybackMinorExpMax = 8;

export function calculateLoadExpOverflowStepBonus(overflowIndex: number): number {
  const n = sanitizePositiveInteger(overflowIndex);
  if (n <= 0) return 0;
  return Math.min(loadExpOverflowBonusMax, Math.pow(1.5, n - 1));
}

export function calculateLoadExpOverflowTotalBonus(overflowCount: number): number {
  const n = sanitizePositiveInteger(overflowCount);
  if (n <= 0) return 0;
  const total = 2 * (Math.pow(1.5, n) - 1);
  if (!Number.isFinite(total) || total >= loadExpOverflowBonusMax) return loadExpOverflowBonusMax;
  return floorToSingleDecimal(total);
}

export function calculateListBuildExpAward(totalPlaybackMs: number): number {
  const safeMs = Math.max(0, totalPlaybackMs);
  const minute = 60 * 1000;
  if (safeMs >= 180 * minute) return 7;
  if (safeMs >= 90 * minute) return 12;
  if (safeMs >= 60 * minute) return 25;
  if (safeMs >= 30 * minute) return 50;
  return 0;
}

export function calculateSePlaybackExpAward(chanceRoll: number, amountRoll: number): number {
  const safeChanceRoll = sanitizeUnitRoll(chanceRoll);
  if (safeChanceRoll < sePlaybackMajorExpChance) return sePlaybackMajorExpAward;
  if (safeChanceRoll < sePlaybackMajorExpChance + sePlaybackMinorExpChance) {
    return 1 + Math.floor(sanitizeUnitRoll(amountRoll) * sePlaybackMinorExpMax);
  }
  return 0;
}

function sanitizePositiveInteger(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function floorToSingleDecimal(value: number): number {
  return Math.floor(Math.max(0, value) * 10) / 10;
}

function sanitizeUnitRoll(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(0.999999999, Math.max(0, value));
}
