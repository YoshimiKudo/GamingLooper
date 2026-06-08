import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("./i18n.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main/main.ts", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../preload/index.ts", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const projectStoreSource = readFileSync(new URL("../main/services/projectStore.ts", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../../package.json", import.meta.url), "utf8");

describe("file storage layout", () => {
  it("keeps Config detail cards aligned with the SE Pad Control panel", () => {
    expect(styleSource).toContain(".config-detail-slot {\n  grid-column: 2;");
    expect(styleSource).toContain("  display: grid;");
    expect(styleSource).toContain("  padding: 0;\n}");
    expect(styleSource).toContain(".config-view .se-config-panel {\n  min-height: 100%;\n  height: 100%;");
    expect(styleSource).toContain(".se-config-panel {\n  padding: 14px 16px 16px;\n  min-height: 100%;\n  height: 100%;");
    expect(appSource).toContain('{ id: "se-pad-control", label: t("sePadAssign") }');
    expect(appSource).toContain('activeSection === "se-pad-control"');
    expect(styleSource).not.toContain(".app.big-font-mode .config-detail-slot {\n  padding-inline:");
  });

  it("keeps stacked storage cards on the same edge and shared inner action column", () => {
    expect(styleSource).toContain(".file-storage-section {\n  width: min(1180px, 100%);");
    expect(styleSource).toContain(".file-storage-card,\n.file-backup-strip {\n  width: 100%;");
    expect(styleSource).toContain("grid-template-columns: minmax(0, 1fr) minmax(360px, auto);");
    expect(styleSource).toContain(".file-backup-strip .file-action-row {\n  justify-self: end;");
  });

  it("lets users select or change the project save location from Files & Save", () => {
    expect(appSource).toContain("function selectProjectStorePath(): Promise<void>");
    expect(appSource).toContain("window.gamingLooper.saveProjectAs(projectToSave)");
    expect(appSource).toContain("onSelectSaveLocation={() => void selectProjectStorePath()}");
    expect(mainSource).toContain('handleIpc("project:save-as"');
    expect(preloadSource).toContain('saveProjectAs: (project: GamingProject)');
  });

  it("splits project, Sequence, and SE Set save destinations", () => {
    expect(i18nSource).toContain('saveDataTitle: "Project Save Location"');
    expect(i18nSource).toContain('sequenceSaveLocationTitle: "Sequence Save Location"');
    expect(i18nSource).toContain('seSetSaveLocationTitle: "SE Set Save Location"');
    expect(i18nSource).toContain('saveDataTitle: "Project 保存先"');
    expect(i18nSource).toContain('sequenceSaveLocationTitle: "Sequence 保存先"');
    expect(i18nSource).toContain('seSetSaveLocationTitle: "SE Set 保存先"');
    expect(appSource).toContain("window.gamingLooper.selectDataFolder(kind)");
    expect(appSource).toContain('onSelectDataFolder={(kind) => void selectDataFolder(kind)}');
    expect(mainSource).toContain('handleIpc("project:select-data-folder"');
    expect(preloadSource).toContain('selectDataFolder: (kind: DataFolderKind)');
  });

  it("orders Files & Save cards as settings, project, Sequence, then SE Set", () => {
    const settingsIndex = appSource.indexOf('<h3>{t("backupTools")}</h3>');
    const projectIndex = appSource.indexOf('<h3>{t("saveDataTitle")}</h3>');
    const sequenceIndex = appSource.indexOf('<h3>{t("sequenceSaveLocationTitle")}</h3>');
    const seSetIndex = appSource.indexOf('<h3>{t("seSetSaveLocationTitle")}</h3>');

    expect(settingsIndex).toBeGreaterThan(-1);
    expect(settingsIndex).toBeLessThan(projectIndex);
    expect(projectIndex).toBeLessThan(sequenceIndex);
    expect(sequenceIndex).toBeLessThan(seSetIndex);
  });

  it("adds simple leading icons to each Files & Save item", () => {
    expect(appSource).toContain('className="file-storage-heading"');
    expect(appSource).toContain('className="file-storage-heading-icon"');
    expect(appSource).toContain("<Settings size={17} />");
    expect(appSource).toContain("<Library size={17} />");
    expect(appSource).toContain("<ListMusic size={17} />");
    expect(appSource).toContain("<Music2 size={17} />");
    expect(styleSource).toContain(".file-storage-heading {");
    expect(styleSource).toContain(".file-storage-heading-icon {");
    expect(styleSource).toContain(".primary-storage-card .file-storage-heading-icon");
  });

  it("explains that saved SE Sets are included in the project save data", () => {
    expect(i18nSource).toContain("saved SE Sets");
    expect(i18nSource).toContain("保存済みSE Set");
    expect(i18nSource).toContain('selectSaveLocation: "保存先を選択"');
    expect(i18nSource).toContain('changeSaveLocation: "保存先を変更"');
  });

  it("uses the portable save folder as the initial save location", () => {
    expect(projectStoreSource).toContain("getDefaultProjectSavePath()");
    expect(projectStoreSource).toContain("const projectFileName = getProjectSaveFileName();");
    expect(mainSource).toContain("getDefaultSaveFolderPath()");
    expect(mainSource).toContain("sequencePath: normalizeStoredFolderPath(locations.sequencePath) ?? defaultSaveFolderPath");
    expect(mainSource).toContain("seSetPath: normalizeStoredFolderPath(locations.seSetPath) ?? defaultSaveFolderPath");
    expect(mainSource).toContain('path.join(getDefaultSaveFolderPath(), "gaminglooper-settings.json")');
  });

  it("packages only the release save template and bundled self-made SE assets", () => {
    expect(packageSource).toContain('"extraFiles"');
    expect(packageSource).toContain('"from": "release-template/save"');
    expect(packageSource).toContain('"to": "save"');
    expect(packageSource).toContain('"from": "asset/se"');
    expect(packageSource).toContain('"to": "asset/se"');
    expect(packageSource).not.toContain('"from": "save"');
    expect(packageSource).not.toContain('"from": "asset/bgm"');
  });
});
