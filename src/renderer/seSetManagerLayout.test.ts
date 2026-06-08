import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main/main.ts", import.meta.url), "utf8");

describe("SE Set manager layout", () => {
  it("does not expose SE Set deletion in the pad control UI", () => {
    expect(appSource).not.toContain("confirmDeleteSeSet");
    expect(appSource).not.toContain("onDeleteSet");
    expect(i18nSource).not.toContain("deleteSeSet");
  });

  it("keeps SE Set file operations on direct SAVE and LOAD controls", () => {
    expect(appSource).toContain('className="se-config-current-strip"');
    expect(appSource).toContain('className="current-se-set-field"');
    expect(appSource).toContain('className="se-config-global-section"');
    expect(appSource).toContain('className="se-voice-limit-control se-config-row-control config-tooltip-anchor"');
    expect(appSource).toContain("se-config-clear-control");
    expect(appSource).toContain("onClick={onSaveSet} disabled={!hasAssignedSe}");
    expect(appSource).toContain("onClick={onLoadSet}");
    expect(appSource).not.toContain('t("savedSeSetGroup")');
    expect(appSource).not.toContain('t("importSeSet")');
    expect(appSource).not.toContain('t("exportSeSet")');
    expect(appSource).toContain('t("globalControl")');
    expect(appSource).toContain('t("noActiveSeSet")');
    expect(styleSource).toContain(".se-config-current-strip");
    expect(styleSource).toContain(".current-se-set-field");
    expect(styleSource).toContain(".se-config-global-section");
    expect(styleSource).toContain(".se-config-row-control");
  });

  it("adds SE Pad Control as an independent Config category with delayed help tooltips", () => {
    expect(appSource).toContain('{ id: "se-pad-control", label: t("sePadAssign") }');
    expect(appSource).toContain('activeSection === "se-pad-control"');
    expect(appSource).toContain('data-config-tooltip={t("seTooltipSaveSet")}');
    expect(appSource).toContain('data-config-tooltip={t("seTooltipLoadSet")}');
    expect(appSource).not.toContain('data-config-tooltip={t("seTooltipImportSet")}');
    expect(appSource).not.toContain('data-config-tooltip={t("seTooltipExportSet")}');
    expect(appSource).toContain('data-config-tooltip={t("seTooltipDefault")}');
    expect(appSource).toContain('data-config-tooltip={t("seTooltipClearAll")}');
    expect(styleSource).toContain(".config-tooltip-anchor::after");
    expect(styleSource).toContain("transition-delay: 460ms;");
    expect(i18nSource).toContain('seTooltipSaveSet: "現在のSE Pad状態を .glset ファイルとして保存します。"');
  });

  it("uses the .glset extension for SE Set files while keeping legacy JSON readable", () => {
    expect(mainSource).toContain('`${safeJsonBaseName(payload.seSet.name || "se-set")}.glset`');
    expect(mainSource).toContain('path.basename(result.filePath).replace(/\\.glset$/i, "")');
    expect(mainSource).toContain('{ name: "GamingLooper SE Set", extensions: ["glset"] }');
    expect(mainSource).toContain('{ name: "Legacy GamingLooper SE Set JSON", extensions: ["json"] }');
  });

  it("shows the active SE Set name and quick save/load controls in Main and Config", () => {
    expect(appSource).toContain("activeSeSetName={project.activeSeSetName}");
    expect(appSource).toContain("const activeSeSetName = sanitizeOptionalSeSetName");
    expect(appSource).toContain("activeSeSetName: savedSet.name");
    expect(styleSource).toContain(".se-pad-set-toolbar");
    expect(appSource).toContain("onSaveSeSet={() => void saveCurrentSeSetFile()}");
    expect(appSource).toContain("onLoadSeSet={() => void importSeSetFile()}");
  });

  it("plays assigned SE keys from the Config SE Pad without breaking assign and unload clicks", () => {
    expect(appSource).toContain("onTriggerSe={handleTriggerSe}");
    expect(appSource).toContain("onTrigger={onTriggerSe}");
    expect(appSource).toContain("onTrigger: (key: SeKey) => void;");
    expect(appSource).toContain("const configClickSuppressRef = useRef(false);");
    expect(appSource).toContain("if (configClickSuppressRef.current) {\n                      event.preventDefault();\n                      event.stopPropagation();\n                      return;\n                    }");
    expect(appSource).toContain("if (event.shiftKey && assigned) {\n                      onUnload(key);\n                      return;\n                    }");
    expect(appSource).toContain("if (assigned) {\n                      onTrigger(key);\n                      return;\n                    }\n                    onAssign(key);");
  });

  it("does not render decorative red lamps in the Config SE Pad keys", () => {
    expect(appSource).toContain('className={`se-config-key se-key color-${assignment.colorId}');
    expect(appSource).not.toContain('className={`key-control-well ${assigned ? "loaded" : ""}`} aria-hidden="true"');
    expect(appSource).not.toContain('className={`assign-lamp ${assigned ? "lit" : ""}`} />');
  });

  it("opens SE Pad Control from the Main SE Pad edit shortcut", () => {
    expect(appSource).toContain('const [initialConfigSection, setInitialConfigSection] = useState<ConfigSectionId>("mix");');
    expect(appSource).toContain('function openSePadControlConfig(): void {\n    setInitialConfigSection("se-pad-control");\n    setView("config");\n  }');
    expect(appSource).toContain("onEditSeSet={openSePadControlConfig}");
    expect(appSource).toContain("initialSection={initialConfigSection}");
    expect(appSource).toContain("const [activeSection, setActiveSection] = useState<ConfigSectionId>(initialSection);");
    expect(appSource).toContain("useEffect(() => {\n    setActiveSection(initialSection);\n  }, [initialSection]);");
    expect(appSource).toContain('setInitialConfigSection("mix");\n              setView("config");');
    expect(styleSource).toContain(".se-edit-set-button");
  });
});
