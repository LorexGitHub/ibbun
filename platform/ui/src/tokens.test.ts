import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PALETTES, parseTheme } from "./theme.tsx";

// ADR 0014: every look sets the same six roles in light and dark; tokens.css derives the rest from them.
const palettes = readFileSync(new URL("./palettes.css", import.meta.url), "utf8");
const ROLES = ["--p-bg", "--p-ink", "--p-accent", "--p-on-accent", "--p-quiet", "--p-glass"];

const block = (palette: string, mode: string) => {
  const match = palettes.match(new RegExp(String.raw`\[data-palette="${palette}"\]\[data-mode="${mode}"\][^{]*\{([^}]*)\}`));
  return match?.[1] ?? "";
};

describe("palettes.css", () => {
  it.each(PALETTES.flatMap((p) => [[p.key, "light"], [p.key, "dark"]]))("gives %s in %s mode all six roles", (palette, mode) => {
    const body = block(palette, mode);
    for (const role of ROLES) expect(body, `${palette} ${mode} ${role}`).toMatch(new RegExp(String.raw`${role}:\s*oklch\(`));
  });

  it("offers no look the picker doesn't list", () => {
    const inCss = new Set([...palettes.matchAll(/data-palette="([\w-]+)"/g)].map(([, key]) => key));
    expect([...inCss].sort()).toEqual(PALETTES.map((p) => p.key).sort());
  });
});

describe("parseTheme", () => {
  it("reads a saved theme", () => {
    expect(parseTheme('{"palette":"ai","mode":"dark"}')).toEqual({ palette: "ai", mode: "dark" });
  });

  it("falls back to Shu following the device for anything it can't read", () => {
    expect(parseTheme(null)).toEqual({ palette: "shu", mode: "system" });
    expect(parseTheme("not json")).toEqual({ palette: "shu", mode: "system" });
    expect(parseTheme('{"palette":"neon","mode":"sepia"}')).toEqual({ palette: "shu", mode: "system" });
  });
});
