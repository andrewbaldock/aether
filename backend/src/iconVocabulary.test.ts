import { describe, expect, it } from "bun:test";
import { ICON_VOCABULARY } from "./tools";

// The backend ICON_VOCABULARY and the frontend VOCABULARY map must stay 1:1 —
// generateTitle drops any icon outside the backend list, and the frontend can
// only render names in its map, so a name present on one side and missing on
// the other silently never shows. The frontend file can't be imported here
// (it pulls lucide-react/JSX), so read it as text and extract the map keys.

// "FlaskConical" -> "flask-conical" — same kebab rule as the frontend's toKebab.
function toKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .toLowerCase();
}

async function frontendVocabularyKeys(): Promise<Set<string>> {
  const src = await Bun.file(
    new URL(
      "../../frontend/src/capabilities/widgets/vocabularyIcon.tsx",
      import.meta.url
    )
  ).text();
  // The map body sits between its declaration and the first closing "};".
  const body = src.split("const VOCABULARY: Record<string, LucideIcon> = {")[1];
  if (!body) throw new Error("VOCABULARY map not found in vocabularyIcon.tsx");
  const mapSource = body.split("\n};")[0];
  if (!mapSource) throw new Error("VOCABULARY map end not found");
  // Keys are either bare identifiers (`user:`) or quoted kebabs (`"dice-5":`).
  const keys = [...mapSource.matchAll(/^\s*(?:"([a-z0-9-]+)"|([a-z0-9]+)):/gm)]
    .map((m) => m[1] ?? m[2])
    .filter((k): k is string => !!k);
  return new Set(keys);
}

describe("icon vocabulary sync", () => {
  it("frontend VOCABULARY map mirrors backend ICON_VOCABULARY exactly", async () => {
    const frontend = await frontendVocabularyKeys();
    const backend = new Set(ICON_VOCABULARY.map(toKebab));

    const missingInFrontend = [...backend].filter((k) => !frontend.has(k));
    const missingInBackend = [...frontend].filter((k) => !backend.has(k));

    expect(missingInFrontend).toEqual([]);
    expect(missingInBackend).toEqual([]);
  });

  it("has no duplicate names", () => {
    expect(new Set(ICON_VOCABULARY).size).toBe(ICON_VOCABULARY.length);
  });
});
