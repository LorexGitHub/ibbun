// PROTOTYPE: throwaway. Five colour looks for variant B, each in a light and a dark mode.
// Every look sets the same six roles, so the layout never changes, only the colours.
export type Mode = "light" | "dark";

type Roles = {
  /** The page. */
  bg: string;
  /** Text and lines. */
  ink: string;
  /** The one strong colour: the button, the logo tile, the path so far. */
  accent: string;
  /** Text on the accent. */
  onAccent: string;
  /** Unreached level dots and quiet lines. */
  quiet: string;
  /** The dock's glass. */
  glass: string;
};

export type Palette = { key: string; name: string; note: string; modes: Record<Mode, Roles> };

export const PALETTES: Palette[] = [
  {
    key: "shu",
    name: "Shu 朱",
    note: "Washi paper, sumi ink, a vermilion seal.",
    modes: {
      light: { bg: "oklch(96.5% 0.012 85)", ink: "oklch(22% 0.008 270)", accent: "oklch(58% 0.2 32)", onAccent: "oklch(99% 0 0)", quiet: "oklch(80% 0.01 80)", glass: "oklch(100% 0 0 / 0.7)" },
      dark: { bg: "oklch(17% 0.008 60)", ink: "oklch(93% 0.015 85)", accent: "oklch(65% 0.19 34)", onAccent: "oklch(15% 0.01 60)", quiet: "oklch(35% 0.01 60)", glass: "oklch(25% 0.01 60 / 0.75)" },
    },
  },
  {
    key: "ai",
    name: "Ai 藍",
    note: "Indigo dye on undyed cotton.",
    modes: {
      light: { bg: "oklch(97% 0.008 250)", ink: "oklch(25% 0.06 265)", accent: "oklch(45% 0.16 265)", onAccent: "oklch(99% 0 0)", quiet: "oklch(82% 0.02 255)", glass: "oklch(100% 0 0 / 0.7)" },
      dark: { bg: "oklch(19% 0.04 265)", ink: "oklch(93% 0.02 250)", accent: "oklch(72% 0.12 245)", onAccent: "oklch(18% 0.04 265)", quiet: "oklch(36% 0.05 265)", glass: "oklch(27% 0.05 265 / 0.75)" },
    },
  },
  {
    key: "matcha",
    name: "Matcha 抹茶",
    note: "Tea-house green, soft and calm.",
    modes: {
      light: { bg: "oklch(96.5% 0.02 115)", ink: "oklch(26% 0.04 145)", accent: "oklch(55% 0.12 140)", onAccent: "oklch(99% 0 0)", quiet: "oklch(83% 0.03 125)", glass: "oklch(100% 0 0 / 0.65)" },
      dark: { bg: "oklch(19% 0.025 145)", ink: "oklch(93% 0.03 115)", accent: "oklch(76% 0.14 130)", onAccent: "oklch(18% 0.03 145)", quiet: "oklch(36% 0.03 145)", glass: "oklch(26% 0.03 145 / 0.75)" },
    },
  },
  {
    key: "sakura",
    name: "Sakura 桜",
    note: "Cherry blossom on plum bark.",
    modes: {
      light: { bg: "oklch(97% 0.015 350)", ink: "oklch(27% 0.05 340)", accent: "oklch(62% 0.17 355)", onAccent: "oklch(99% 0 0)", quiet: "oklch(85% 0.03 350)", glass: "oklch(100% 0 0 / 0.7)" },
      dark: { bg: "oklch(19% 0.035 340)", ink: "oklch(94% 0.02 350)", accent: "oklch(78% 0.12 355)", onAccent: "oklch(19% 0.035 340)", quiet: "oklch(37% 0.04 340)", glass: "oklch(27% 0.04 340 / 0.75)" },
    },
  },
  {
    key: "shiro-kuro",
    name: "Shiro / Kuro 白黒",
    note: "Pure white and pure black, no colour at all.",
    modes: {
      light: { bg: "oklch(100% 0 0)", ink: "oklch(14% 0 0)", accent: "oklch(14% 0 0)", onAccent: "oklch(100% 0 0)", quiet: "oklch(86% 0 0)", glass: "oklch(97% 0 0 / 0.8)" },
      dark: { bg: "oklch(8% 0 0)", ink: "oklch(96% 0 0)", accent: "oklch(96% 0 0)", onAccent: "oklch(8% 0 0)", quiet: "oklch(30% 0 0)", glass: "oklch(18% 0 0 / 0.8)" },
    },
  },
];

export const paletteVars = (key: string | null, mode: Mode) => {
  const p = PALETTES.find((x) => x.key === key) ?? PALETTES[0]!;
  const r = p.modes[mode];
  return { "--bg": r.bg, "--ink": r.ink, "--accent": r.accent, "--on-accent": r.onAccent, "--quiet": r.quiet, "--glass": r.glass };
};
