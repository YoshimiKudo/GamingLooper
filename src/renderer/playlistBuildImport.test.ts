import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("playlist build prompt", () => {
  it("opens BGM import after accepting Build from an uncreated playlist prompt", () => {
    const requestPlaybackMatch = appSource.match(/async function requestPlaylistPlayback\(\): Promise<void> \{([\s\S]*?)\n  function createPlaylist/);

    expect(requestPlaybackMatch?.[1]).toContain("await importBgmForSequenceBuilder();");
    expect(requestPlaybackMatch?.[1]).not.toContain('setStatus(language === "ja" ? "Build Play Listを開きました。"');
  });
});
