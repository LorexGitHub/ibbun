import { useEffect, useSyncExternalStore } from "react";

/** The five looks in palettes.css (ADR 0014). */
export const PALETTES = [
  { key: "shu", name: "Shu", glyph: "朱", note: "Washi paper, sumi ink, a vermilion seal." },
  { key: "ai", name: "Ai", glyph: "藍", note: "Indigo dye on undyed cotton." },
  { key: "matcha", name: "Matcha", glyph: "抹茶", note: "Tea-house green, soft and calm." },
  { key: "sakura", name: "Sakura", glyph: "桜", note: "Cherry blossom on plum bark." },
  { key: "shiro-kuro", name: "Shiro / Kuro", glyph: "白黒", note: "Pure white and pure black, no colour at all." },
] as const;

export type PaletteKey = (typeof PALETTES)[number]["key"];
export type ThemeMode = "light" | "dark" | "system";
export type Theme = { palette: PaletteKey; mode: ThemeMode };

export const MODES: { key: ThemeMode; label: string }[] = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "system", label: "Match my device" },
];

const KEY = "ibbun.theme";
const DEFAULT: Theme = { palette: "shu", mode: "system" };

/** Reads the saved theme; anything unreadable or unknown falls back to the default. */
export const parseTheme = (raw: string | null): Theme => {
  try {
    const t = JSON.parse(raw ?? "") as Partial<Theme>;
    return {
      palette: PALETTES.some((p) => p.key === t.palette) ? t.palette! : DEFAULT.palette,
      mode: MODES.some((m) => m.key === t.mode) ? t.mode! : DEFAULT.mode,
    };
  } catch {
    return DEFAULT;
  }
};

const read = (): Theme => {
  try {
    return parseTheme(localStorage.getItem(KEY));
  } catch {
    return DEFAULT;
  }
};

let current: Theme = typeof window === "undefined" ? DEFAULT : read();
const listeners = new Set<() => void>();
const dark = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

/** Puts the theme on <html>, where palettes.css reads it. "system" follows the device. */
export const applyTheme = (theme: Theme = current) => {
  const root = document.documentElement;
  root.dataset.palette = theme.palette;
  root.dataset.mode = theme.mode === "system" ? (dark() ? "dark" : "light") : theme.mode;
};

export const setTheme = (change: Partial<Theme>) => {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // A private window may refuse storage; the theme still applies for this visit.
  }
  applyTheme();
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useTheme = (): Theme => useSyncExternalStore(subscribe, () => current, () => DEFAULT);

/** Keeps "Match my device" in step when the device switches between light and dark. */
export const useSystemModeSync = () => {
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => current.mode === "system" && applyTheme();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
};

/** A small preview of one look: the page, a line of ink and the accent seal, drawn by palettes.css itself. */
const Swatch = ({ palette, mode }: { palette: PaletteKey; mode: "light" | "dark" }) => (
  <span className="swatch" data-palette={palette} data-mode={mode} aria-hidden="true">
    <span className="swatch-seal" lang="ja">文</span>
    <span className="swatch-lines" />
  </span>
);

/** Settings → Appearance: one of the five looks, and light, dark or the device's choice. */
export const ThemePicker = () => {
  const theme = useTheme();
  const shown = theme.mode === "dark" || (theme.mode === "system" && dark()) ? "dark" : "light";
  return (
    <div className="theme-picker">
      <div role="radiogroup" aria-label="Look" className="theme-looks">
        {PALETTES.map((p) => (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={theme.palette === p.key}
            className="theme-look"
            onClick={() => setTheme({ palette: p.key })}
          >
            <Swatch palette={p.key} mode={shown} />
            <span className="theme-look-name">
              {p.name} <span lang="ja">{p.glyph}</span>
            </span>
            <span className="theme-look-note">{p.note}</span>
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Mode" className="theme-modes">
        {MODES.map((m) => (
          <button key={m.key} type="button" role="radio" aria-checked={theme.mode === m.key} className="theme-mode" onClick={() => setTheme({ mode: m.key })}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
};
