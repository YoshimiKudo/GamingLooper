import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../preload/index.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main/main.ts", import.meta.url), "utf8");

describe("README first touch guidance", () => {
  it("persists the first README click with a stable local storage key", () => {
    expect(appSource).toContain('README_SEEN_STORAGE_KEY = "gaminglooper:readme-seen:v1"');
    expect(appSource).toContain("markReadmeSeen();");
    expect(appSource).toContain('window.localStorage.setItem(README_SEEN_STORAGE_KEY, "1")');
  });

  it("highlights the README button only while unseen", () => {
    expect(appSource).toContain('readme-action ${!readmeSeen ? "readme-unseen" : ""}');
    expect(styles).toContain(".topbar-action.readme-action.readme-unseen");
    expect(styles).toContain("readme-first-touch-glow");
  });

  it("puts purpose, SE assignment, and Sequence build guidance before detailed README sections", () => {
    expect(readme).toContain("## WHAT GAMINGLOOPER IS FOR");
    expect(readme).toContain("## HOW TO ASSIGN SE TO KEYS");
    expect(readme).toContain("## HOW TO BUILD SEQUENCE");
    expect(readme.indexOf("## WHAT GAMINGLOOPER IS FOR")).toBeLessThan(readme.indexOf("## HOW TO ASSIGN SE TO KEYS"));
    expect(readme.indexOf("## HOW TO ASSIGN SE TO KEYS")).toBeLessThan(readme.indexOf("## HOW TO BUILD SEQUENCE"));
    expect(readme.indexOf("## HOW TO BUILD SEQUENCE")).toBeLessThan(readme.indexOf("## BGM / Play List"));
    expect(readme).toContain("SE Pad key  --->  Load SE file  --->  Tune Vol / Pan / Icon  --->  Save SE Set");
    expect(readme).toContain("BGM Source  --->  Build Sequencer  --->  Complete & Save Sequence");
    expect(readme).toContain("An SE Set is the saved key layout");
    expect(readme).toContain("Build a List that plays game soundtrack files with the loop count or play duration you choose.");
    expect(readme).toContain("Use `Time` when you want to check a track briefly, or `Loop` when you want to hear it repeat.");
    expect(readme).toContain("Main View can load the saved Sequence and play it back with the order, `Loop`, `Time`, and `Fade` you set.");
  });

  it("shows a graphical sequence quick start in the in-app README modal", () => {
    expect(appSource).toContain("function HelpSequenceQuickStart");
    expect(appSource).toContain("HOW TO ASSIGN SE TO KEYS");
    expect(appSource).toContain("HOW TO BUILD SEQUENCE");
    expect(appSource).toContain("WHAT GAMINGLOOPER IS FOR");
    expect(appSource).toContain("help-purpose-card");
    expect(appSource).toContain("help-purpose-points");
    expect(appSource).toContain("help-result-strip");
    expect(appSource).toContain('className="help-purpose-jump"');
    expect(appSource).toContain('id="help-assign-se"');
    expect(appSource).toContain('id="help-build-sequence"');
    expect(appSource).toContain('href={`#${jumpTarget}`}');
    expect(appSource).toContain('jumpTarget: "help-build-sequence"');
    expect(appSource).toContain('jumpTarget: "help-assign-se"');
    expect(appSource).toContain("renderHelpFlow(seSteps");
    expect(appSource).toContain("ゲームのサウンドトラックを、好きなループ回数や再生時間で聴けるListにします。");
    expect(appSource).toContain("曲ごとの聴き方を決める");
    expect(appSource).toContain("Loopなら「何周するか」、Timeなら「何秒再生するか」を指定します。");
    expect(appSource).toContain("Build a List that plays game soundtrack files with the loop count or play duration you choose.");
    expect(appSource).toContain("Choose how each track plays");
    expect(appSource).not.toContain("下の HOW TO BUILD SEQUENCE はこの流れの詳しい手順です。");
    expect(styles).toContain(".help-flow-diagram");
    expect(styles).toContain(".help-purpose-card");
    expect(styles).toContain(".help-purpose-jump");
  });

  it("closes the active README modal instead of closing the app on window close", () => {
    expect(appSource).toContain("window.gamingLooper.setWindowCloseGuard(helpModal !== null);");
    expect(appSource).toContain("window.gamingLooper.onCloseActiveModalRequested");
    expect(appSource).toContain("setHelpModal(null);");
    expect(preloadSource).toContain('ipcRenderer.send("app:set-window-close-guard", guarded);');
    expect(preloadSource).toContain('ipcRenderer.on("app:close-active-modal", listener);');
    expect(mainSource).toContain("modalCloseGuardByWebContents");
    expect(mainSource).toContain('window.webContents.send("app:close-active-modal");');
  });
});
