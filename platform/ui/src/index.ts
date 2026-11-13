// The Ma kit (docs/adr/0014-ma-visual-design.md). Import "@ibbun/ui/styles.css" once in the app.
export { Attribution, Footer, type Credit } from "./attribution.tsx";
export { AudioPlayer } from "./audio.tsx";
export { Furigana, Input, KanaInput, type FuriganaSegment, type Ime } from "./japanese.tsx";
export { KeyMark, keyRuns, useKey, type Press } from "./keys.tsx";
export { Layout } from "./layout.tsx";
export { Mark } from "./mark.tsx";
export { SessionCount, SessionCountSlot } from "./session.tsx";
export { onGoTo, openGoTo } from "./go-to.ts";
export { LevelFilter, levelIn, levelQuery, useLevelFilter } from "./level-filter.tsx";
export { applyTheme, MODES, PALETTES, parseTheme, setTheme, ThemePicker, useSystemModeSync, useTheme, type PaletteKey, type Theme, type ThemeMode } from "./theme.tsx";
export { Button, buttonClass, Card, Pill, pillClass, Sheet, type ButtonLook, type ButtonVariant, type Fill, type Tear } from "./paper.tsx";
