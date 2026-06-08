import type { AccentColorId, SeAssignment, SeIconId, SeKey } from "./types.js";

export const seKeyRows = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"]
] as const;

export const seKeys = seKeyRows.flat() as SeKey[];

export const seIconIds: SeIconId[] = [
  "generic",
  "slash",
  "hit",
  "whoosh",
  "fire",
  "guard",
  "spark",
  "wind",
  "rock",
  "magic",
  "heal",
  "shock",
  "step",
  "item",
  "alert"
];

export const accentColorIds: AccentColorId[] = ["red", "green", "blue", "yellow", "amber", "violet", "cyan", "white"];

const iconColorMap: Record<SeIconId, AccentColorId> = {
  generic: "white",
  slash: "red",
  hit: "amber",
  whoosh: "blue",
  fire: "red",
  guard: "green",
  spark: "yellow",
  wind: "cyan",
  rock: "amber",
  magic: "violet",
  heal: "green",
  shock: "yellow",
  step: "white",
  item: "amber",
  alert: "red"
};

const genericColorSpread: AccentColorId[] = ["white", "cyan", "violet", "yellow", "green", "blue", "red", "amber"];

export function createDefaultSeAssignments(): SeAssignment[] {
  return seKeys.map((key, index) => ({
    key,
    file: null,
    iconId: null,
    iconSource: "none",
    colorId: accentColorIds[index % accentColorIds.length],
    volume: 1,
    pan: 0
  }));
}

export function inferSeIconId(fileName: string): SeIconId {
  const normalized = fileName.toLowerCase();
  const rules: Array<[SeIconId, RegExp]> = [
    ["slash", /slash|sword|knife|blade|cut|斬|剣/],
    ["hit", /hit|impact|punch|attack|damage|打|殴/],
    ["whoosh", /whoosh|swoosh|swing|air|swish/],
    ["fire", /fire|flame|burn|explosion|ignite|炎|火/],
    ["guard", /guard|shield|block|defen[cs]e|parry/],
    ["spark", /spark|shine|light|flash|kirakira|キラ/],
    ["wind", /wind|gust|dash|speed|move|風/],
    ["rock", /rock|stone|earth|debris|break/],
    ["magic", /magic|spell|mana|aura|cast|魔法/],
    ["heal", /heal|recover|cure|life|hp/],
    ["shock", /shock|thunder|bolt|electric|zap|雷/],
    ["step", /step|foot|walk|run|jump|足/],
    ["item", /item|coin|get|pickup|open|select/],
    ["alert", /alert|warning|notice|alarm|ui|beep/]
  ];
  return rules.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "generic";
}

export function inferSeColorId(iconId: SeIconId | null, key: SeKey): AccentColorId {
  if (iconId && iconId !== "generic") {
    return iconColorMap[iconId];
  }
  const keyIndex = Math.max(0, seKeys.indexOf(key));
  return genericColorSpread[keyIndex % genericColorSpread.length] ?? "white";
}

export function inferNewSeAssignmentColorId(iconId: SeIconId | null, key: SeKey, random = Math.random): AccentColorId {
  if (iconId && iconId !== "generic") {
    return inferSeColorId(iconId, key);
  }
  const safeRandom = typeof random === "function" ? random() : 0;
  const index = Math.min(genericColorSpread.length - 1, Math.max(0, Math.floor(safeRandom * genericColorSpread.length)));
  return genericColorSpread[index] ?? "white";
}

export function cycleSeIconId(iconId: SeIconId | null, delta: number): SeIconId {
  const current = iconId ? seIconIds.indexOf(iconId) : 0;
  const safeCurrent = current >= 0 ? current : 0;
  const direction = delta >= 0 ? 1 : -1;
  const next = (safeCurrent + direction + seIconIds.length) % seIconIds.length;
  return seIconIds[next];
}

export function compactFileName(name: string, max = 18): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const room = Math.max(6, max - ext.length - 1);
  return `${stem.slice(0, room)}...${ext}`;
}
