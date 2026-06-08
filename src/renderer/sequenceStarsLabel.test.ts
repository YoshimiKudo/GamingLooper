import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function ruleBody(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styleSource.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] ?? "";
}

describe("Sequence Stars label", () => {
  it("shows a compact Fav label next to the star rating", () => {
    expect(appSource).toContain('<span className="sequence-stars-label">Fav</span>');
    expect(styleSource).toContain(".sequence-stars-label");
  });

  it("decrements the rating when the current filled edge star is clicked", () => {
    expect(appSource).toContain("const nextRating = value === safeRating ? value - 1 : value;");
    expect(appSource).toContain("onChange(nextRating);");
  });

  it("previews the clicked result as glowing outlined stars while hovering", () => {
    expect(appSource).toContain("const [previewRating, setPreviewRating] = useState<number | null>(null);");
    expect(appSource).toContain("const [previewSuppressed, setPreviewSuppressed] = useState(false);");
    expect(appSource).toContain("const previewActive = previewRating !== null && !previewSuppressed;");
    expect(appSource).toContain("const filled = !previewActive && index < safeRating;");
    expect(appSource).toContain("const previewFilled = previewActive && index < (previewRating ?? 0);");
    expect(appSource).toContain('previewFilled ? "preview" : ""');
    expect(appSource).toContain('{filled ? "★" : "☆"}');
    expect(appSource).toContain("if (!previewSuppressed) setPreviewRating(nextRating);");
    expect(ruleBody(".sequence-star:hover,\n.sequence-star:focus-visible")).not.toContain("color:");
    expect(ruleBody(".sequence-star.preview")).toContain("text-shadow:");
  });

  it("suppresses hover preview after a star click until the pointer leaves the star control", () => {
    expect(appSource).toContain("setPreviewSuppressed(true);");
    expect(appSource).toContain("setPreviewSuppressed(false);");
    expect(appSource.indexOf("setPreviewSuppressed(true);")).toBeGreaterThan(appSource.indexOf("setPreviewRating(null);"));
  });
});
