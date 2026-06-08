import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../shared/types.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main/main.ts", import.meta.url), "utf8");

describe("LOAD EXP award flow", () => {
  it("adds a fixed registration bonus each time a List is registered", () => {
    expect(appSource).toContain("createListRegistrationExpIdentities(targetPlaylistId, listRegistrationExpAward)");
    expect(appSource).toContain("createListBuildExpIdentities(targetPlaylistId, expAward)");
    expect(appSource).toContain("queueLoadExpIdentityAwardAnimations(projectRef.current, expIdentityGroups)");
  });

  it("rolls SE Pad playback EXP only after successful playback", () => {
    const triggerSeBody = appSource.slice(appSource.indexOf("  async function triggerSe("), appSource.indexOf("  function stopSe("));

    expect(triggerSeBody).toContain("await audioRef.current.playSe(");
    expect(triggerSeBody.indexOf("awardSePlaybackExp(key);")).toBeGreaterThan(triggerSeBody.indexOf("await audioRef.current.playSe("));
    expect(appSource).toContain("calculateSePlaybackExpAward(Math.random(), Math.random())");
    expect(appSource).toContain("createSePlaybackExpIdentities(key, amount)");
    expect(appSource).toContain("queueLoadExpIdentityAwardAnimations(currentProject, [identities])");
    expect(appSource).toContain("addActiveSeSetExpTotal(recordLoadExpIdentities(draft, identities), effectiveAmount)");
    expect(appSource).toContain("setStatus(`SE EXP +${effectiveAmount}`);");
  });

  it("stores per-SE-Set EXP totals and blocks SE playback EXP at the limit", () => {
    expect(typesSource).toContain("expTotal: number;");
    expect(typesSource).toContain("activeSeSetId: string | null;");
    expect(typesSource).toContain("noActiveSeSetExpTotal: number;");
    expect(appSource).toContain("const seSetExpAwardLimit = 300;");
    expect(appSource).toContain("getActiveSeSetExpTotal(currentProject) >= seSetExpAwardLimit");
    expect(appSource).toContain("queueExpLimitAnimation();");
    expect(appSource).toContain('setStatus("EXP Limit");');
    expect(appSource).toContain("expTotal: sanitizeSeSetExpTotal(set.expTotal)");
    expect(appSource).toContain("expTotal: sanitizeSeSetExpTotal(source.expTotal)");
  });

  it("halves per-SE-Set EXP totals when saving a SE Set under another name", () => {
    expect(appSource).toContain("const savedExpTotal = getSeSetExpTotalForSave(defaultName, savedName, currentSeSetExpTotal);");
    expect(appSource).toContain("sameNameSet?.createdAt ?? draftSet.createdAt, savedExpTotal");
    expect(appSource).toContain("return sourceName.trim() === savedName.trim() ? safeExpTotal : Math.floor(safeExpTotal / 2);");
    expect(mainSource).toContain("const exportedExpTotal = getSeSetExpTotalForSave(payload.seSet.name, exportedName, payload.seSet.expTotal);");
    expect(mainSource).toContain("expTotal: exportedExpTotal");
  });

  it("shows queued pixel-style EXP award popups above the EXP gauge", () => {
    expect(appSource).toContain("const [expAwardPopups, setExpAwardPopups] = useState<ExpAwardPopup[]>([]);");
    expect(appSource).toContain("expAwardQueueRef.current.push(...awards.map((amount) => ({ text: `+ ${amount}EXP`, limited: false })));");
    expect(appSource).toContain("expAwardTimerRef.current = window.setTimeout(showNextExpAwardAnimation, 100);");
    expect(appSource).toContain("awardPopups={expAwardPopups}");
    expect(appSource).toContain("className={`exp-award-float ${popup.limited ? \"limited\" : \"\"}`}");
    expect(appSource).toContain("popup.limited ? \"limited\" : \"\"");
    expect(styleSource).toContain(".exp-award-floats");
    expect(styleSource).toContain(".exp-award-float.limited");
    expect(styleSource).toContain("@keyframes exp-award-rise");
    expect(styleSource).not.toContain(".exp-award-float i");
    expect(styleSource).not.toContain(".exp-award-float::before");
    expect(styleSource).not.toContain("68% {\n    opacity: 0.94;");
  });
});
