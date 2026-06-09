import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(path.resolve("src/main/main.ts"), "utf8");

describe("main process broken pipe handling", () => {
  it("wraps stdout and stderr writes before app startup work", () => {
    expect(mainSource).toContain("preventBrokenPipeCrash();");
    expect(mainSource.indexOf("preventBrokenPipeCrash();")).toBeLessThan(mainSource.indexOf("const isDev = !app.isPackaged;"));
    expect(mainSource).toContain("const originalWrite = stream.write.bind(stream)");
    expect(mainSource).toContain('candidate?.code === "EPIPE"');
    expect(mainSource).toContain('stream.prependListener("error"');
  });

  it("guards Electron console reporting paths for broken pipes", () => {
    expect(mainSource).toContain('for (const method of ["log", "info", "warn", "error", "debug"] as const)');
    expect(mainSource).toContain("if (isBrokenPipe(error)) return false;");
    expect(mainSource).toContain("if (isBrokenPipe(error)) return;");
    expect(mainSource).toContain('process.prependListener("uncaughtException"');
  });
});
