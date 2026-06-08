import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("confirmation dialog button order", () => {
  it("keeps affirmative actions before cancel actions", () => {
    const actionBlocks = [...appSource.matchAll(/<div className="confirm-actions">([\s\S]*?)<\/div>/g)].map((match) => match[1]);

    expect(actionBlocks.length).toBe(2);
    for (const block of actionBlocks) {
      const affirmativeIndex = block.search(/onClick=\{(?:onConfirm|\(\) => onConfirm\(value\))/);
      const cancelIndex = block.indexOf("onClick={onCancel}");

      expect(affirmativeIndex).toBeGreaterThanOrEqual(0);
      expect(cancelIndex).toBeGreaterThanOrEqual(0);
      expect(affirmativeIndex).toBeLessThan(cancelIndex);
    }
  });

  it("supports OK-only alert dialogs without changing normal confirm dialogs", () => {
    expect(appSource).toContain("alertOnly?: boolean;");
    expect(appSource).toContain("onMouseDown={dialog.alertOnly ? onConfirm : onCancel}");
    expect(appSource).toContain("{dialog.alertOnly ? null : (");
  });

  it("does not blur the app behind confirm, prompt, and OK-only dialogs", () => {
    const confirmBackdropBlock = styleSource.match(/\.confirm-modal-backdrop \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(confirmBackdropBlock).toContain("background:");
    expect(confirmBackdropBlock).not.toContain("backdrop-filter");
    expect(confirmBackdropBlock).not.toContain("blur(");
  });
});
