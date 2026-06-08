import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("Build Sequencer rule tooltips", () => {
  it("adds hover descriptions to transition rule controls", () => {
    expect(appSource).toContain("type BuilderRuleTooltipKey");
    expect(appSource).toContain("getBuilderRuleTooltip(\"transition\", project.ui.language)");
    expect(appSource).toContain("function getPlaylistRuleModeTooltipKey(mode: PlaylistRule[\"mode\"]): BuilderRuleTooltipKey");
    expect(appSource).toContain("return \"loop\";");
    expect(appSource).toContain("return \"time\";");
    expect(appSource).toContain("return \"straight\";");
    expect(appSource).toContain("getBuilderRuleTooltip(getPlaylistRuleModeTooltipKey(displayRuleMode), project.ui.language)");
    expect(appSource).toContain("getBuilderRuleTooltip(\"loopCount\", project.ui.language)");
    expect(appSource).toContain("getBuilderRuleTooltip(\"playTime\", project.ui.language)");
    expect(appSource).toContain("getBuilderRuleTooltip(\"fade\", project.ui.language)");
  });

  it("renders rule descriptions in a fixed tooltip outside the scroll row", () => {
    expect(appSource).toContain("builderRuleTooltip");
    expect(appSource).toContain("scheduleBuilderRuleTooltip(target, 620)");
    expect(appSource).toContain('className={`builder-rule-tooltip-floating placement-${builderRuleTooltip.placement}`}');
    expect(styleSource).toContain(".builder-rule-tooltip-floating");
    expect(styleSource).toContain("position: fixed;");
    expect(styleSource).toContain("z-index: 1200;");
  });

  it("keeps top-row rule tooltips above the Sequence name controls", () => {
    expect(styleSource).toContain(".rule-tooltip-anchor::after {\n  content: none;");
    expect(appSource).toContain("placement = rect.top < 92 ? \"below\" : \"above\"");
  });
});
