import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("Build Sequencer auto scroll", () => {
  it("tracks the newly added playlist row and scrolls it into view", () => {
    expect(appSource).toContain("const builderSequenceScrollRef = useRef<HTMLDivElement | null>(null)");
    expect(appSource).toContain("const previousPlaylistItemIdsRef = useRef(project.playlist.map((item) => item.id))");
    expect(appSource).toContain("const addedItem = project.playlist.find((item) => !previousIds.has(item.id))");
    expect(appSource).toContain('scroll.querySelectorAll<HTMLElement>("[data-playlist-item-id]")');
    expect(appSource).toContain('data-playlist-item-id={item.id}');
    expect(appSource).toContain("scroll.scrollTo({ top: scroll.scrollTop + targetRect.bottom - scrollRect.bottom + padding, behavior: \"smooth\" })");
  });
});
