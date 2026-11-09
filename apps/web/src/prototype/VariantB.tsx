// PROTOTYPE: throwaway. Variant B, "Ma" (間): one thing on screen, a Japanese-editorial voice, navigation in a dock.
import NumberFlow from "@number-flow/react";
import type { NavEntry } from "@mojibun/slice";
import type { CSSProperties } from "react";
import { Link } from "react-router";
import { Dock, DockIcon } from "@/components/ui/dock";
import type { Who } from "../places.ts";
import { breakdown, currentLevel, greeting, pct, type TodayData } from "./data.ts";
import { paletteVars, type Mode } from "./palettes.ts";

const SHU = "var(--accent)";

const theme = (palette: string | null, mode: Mode) =>
  ({
    ...paletteVars(palette, mode),
    "--font-display": "'Shippori Mincho B1', serif",
    "--font-body": "'Instrument Sans', sans-serif",
    fontFamily: "'Instrument Sans', sans-serif",
    background: "var(--bg)",
    color: "var(--ink)",
    colorScheme: mode,
    transition: "background-color 300ms, color 300ms",
  }) as CSSProperties;

const mincho = { fontFamily: "'Shippori Mincho B1', serif" };

export const VariantB = ({ today, nav, openMenu, palette = null, mode = "light" }: { today: TodayData; nav: NavEntry[]; who: Who; openMenu: () => void; palette?: string | null; mode?: Mode }) => {
  const level = currentLevel(today.levels);
  const dock = nav.filter((n) => n.place !== "supervisor" && n.glyph);
  const next = today.due.total ? { to: "/reviews", label: "Begin reviews" } : { to: "/learn", label: "Learn something new" };
  return (
    <div style={theme(palette, mode)} className="relative min-h-screen overflow-hidden">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Shippori+Mincho+B1:wght@500;700;800&display=swap" />
      <span aria-hidden lang="ja" className="pointer-events-none absolute -right-24 top-10 select-none text-[34rem] leading-none opacity-[0.06]" style={mincho}>
        文
      </span>

      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-8 text-sm">
        <span className="flex items-center gap-2 tracking-[0.3em] uppercase">
          <span className="grid size-6 place-items-center rounded-sm text-xs" style={{ background: SHU, color: "var(--on-accent)", ...mincho }} lang="ja">文</span>
          mojibun
        </span>
        <span className="opacity-60">{today.streakDays}日 連続 · {today.streakDays} day streak</span>
      </header>

      <main className="relative mx-auto flex max-w-3xl flex-col items-center px-6 pb-48 pt-[5vh] text-center">
        <p className="text-sm uppercase tracking-[0.35em] opacity-60">{greeting()}</p>
        <h1 className="mt-6 text-[clamp(88px,14vw,168px)] font-extrabold leading-[0.9]" style={mincho}>
          <NumberFlow value={today.due.total} />
        </h1>
        <p className="mt-4 text-2xl" style={mincho}>
          {today.due.total === 0 ? "Nothing waits for you today." : today.due.total === 1 ? "card waits for you." : "cards wait for you."}
        </p>
        <p className="mt-3 text-sm opacity-60">
          {breakdown(today.due).map((b) => `${b.n} ${b.label.toLowerCase()}`).join("  ·  ")}
        </p>

        <Link
          to={next.to}
          className="mt-12 inline-flex items-center gap-3 rounded-full px-10 py-4 text-lg font-medium no-underline transition-transform hover:-translate-y-0.5"
          style={{ background: SHU, color: "var(--on-accent)", boxShadow: "0 14px 30px -12px color-mix(in oklab, var(--accent) 70%, transparent)" }}
        >
          {next.label} <span aria-hidden>→</span>
        </Link>

        <button type="button" onClick={openMenu} className="mt-8 flex w-full max-w-md cursor-pointer items-center gap-3 border-0 border-b border-solid px-1 py-3 text-left text-base opacity-70 transition-opacity hover:opacity-100" style={{ borderColor: "currentColor", background: "none" }}>
          <span lang="ja" style={mincho}>探</span>
          Where to? A kanji, a word, a screen…
          <kbd className="ml-auto text-xs opacity-60">Ctrl K</kbd>
        </button>

        <section className="mt-16 w-full" aria-label="Your way to N1">
          <div className="relative flex justify-between">
            <span className="absolute left-0 right-0 top-[9px] h-px" style={{ background: "currentColor", opacity: 0.2 }} />
            <span className="absolute left-0 top-[8px] h-[3px] rounded" style={{ background: SHU, width: `${(today.levels.indexOf(level) + pct(level) / 100) * 25}%` }} />
            {today.levels.map((l) => {
              const done = pct(l) >= 90;
              const now = l === level;
              return (
                <div key={l.level} className="relative flex flex-col items-center gap-3">
                  <span className="size-5 rounded-full border-2" style={{ borderColor: done || now ? SHU : "var(--quiet)", background: done ? SHU : "var(--bg)" }} />
                  <span className={`text-2xl ${now ? "font-extrabold" : "opacity-50"}`} style={mincho}>{l.level}</span>
                  <span className="text-xs opacity-60">{pct(l)}%</span>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center">
        <Dock iconMagnification={64} iconDistance={120} className="mt-0 border-[color-mix(in_oklab,var(--ink)_12%,transparent)] bg-[var(--glass)] shadow-[0_10px_40px_-15px_rgba(0,0,0,.35)]">
          {dock.map((e) => (
            <DockIcon key={e.path} className="bg-transparent">
              <Link to={e.path} title={`${e.label}: ${e.blurb}`} className="grid size-full place-items-center rounded-full text-xl no-underline" style={{ ...mincho, color: "var(--ink)" }} lang="ja">
                {e.glyph}
              </Link>
            </DockIcon>
          ))}
        </Dock>
      </div>
    </div>
  );
};
