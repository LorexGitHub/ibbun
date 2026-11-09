// PROTOTYPE: throwaway. Variant C, "Playground": top tabs, a bold bento of tiles, a progress ring for the level.
import NumberFlow from "@number-flow/react";
import type { NavEntry } from "@mojibun/slice";
import { ArrowUpRight, BookOpen, Flame, Headphones, Layers, Library, Target, Zap } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { entriesAt, type Who } from "../places.ts";
import { breakdown, currentLevel, greeting, pct, type TodayData } from "./data.ts";

const C = {
  bg: "oklch(97% 0.01 290)",
  ink: "oklch(20% 0.03 285)",
  violet: "oklch(52% 0.22 285)",
  lime: "oklch(90% 0.19 125)",
  coral: "oklch(72% 0.17 35)",
  sky: "oklch(85% 0.09 230)",
  butter: "oklch(93% 0.1 95)",
};

const theme = {
  "--font-display": "'Bricolage Grotesque', sans-serif",
  "--font-body": "'Bricolage Grotesque', sans-serif",
  "--muted": "oklch(92% 0.02 290)",
  "--muted-foreground": "oklch(45% 0.03 285)",
  "--background": "oklch(100% 0 0)",
  "--foreground": C.ink,
  "--radius": "18px",
  fontFamily: "'Bricolage Grotesque', sans-serif",
  background: C.bg,
  color: C.ink,
} as CSSProperties;

const ICON: Record<string, ReactNode> = {
  "/reviews": <Zap />, "/learn": <Layers />, "/placement": <Target />, "/cram": <Flame />,
  "/reading": <BookOpen />, "/listening": <Headphones />, "/browse": <Library />,
};
const TINT = [C.lime, C.sky, C.butter, C.coral];

const Tile = ({ className = "", style, children, to }: { className?: string; style?: CSSProperties; children: ReactNode; to?: string }) => {
  const cls = `relative flex flex-col rounded-[28px] p-6 text-inherit no-underline ${to ? "transition-transform hover:-translate-y-1" : ""} ${className}`;
  return to ? <Link to={to} className={cls} style={style}>{children}</Link> : <div className={cls} style={style}>{children}</div>;
};

const Place = ({ entries }: { entries: NavEntry[] }) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {entries.map((e, i) => (
      <Tile key={e.path} to={e.path} style={{ background: TINT[i % TINT.length] }} className="min-h-44 [&_svg]:size-7">
        {ICON[e.path]}
        <h3 className="mt-auto text-2xl font-bold" style={{ letterSpacing: "-0.02em" }}>{e.label}</h3>
        <p className="text-sm opacity-75">{e.blurb}</p>
        <ArrowUpRight className="absolute right-5 top-5 size-5! opacity-60" />
      </Tile>
    ))}
  </div>
);

export const VariantC = ({ today, nav, who }: { today: TodayData; nav: NavEntry[]; who: Who; openMenu: () => void }) => {
  const level = currentLevel(today.levels);
  return (
    <div style={theme} className="min-h-screen pb-28">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap" />
      <Tabs defaultValue="today" className="mx-auto max-w-6xl gap-8 px-5 pt-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-xl font-extrabold">
            <span className="grid size-10 place-items-center rounded-2xl text-xl text-white" style={{ background: C.violet }} lang="ja">文</span>
            mojibun
          </span>
          <TabsList className="h-12 rounded-full bg-white p-1 shadow-sm">
            {["today", "study", "practice", "library"].map((t) => (
              <TabsTrigger key={t} value={t} className="cursor-pointer rounded-full px-5 text-base capitalize data-[state=active]:bg-[var(--v)] data-[state=active]:text-white" style={{ "--v": C.violet } as CSSProperties}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
          <span className="grid size-10 place-items-center rounded-full bg-white font-bold shadow-sm">{who.state === "in" ? who.learner.email[0]?.toUpperCase() : "?"}</span>
        </header>

        <TabsContent value="today">
          <h1 className="mb-6 text-5xl font-extrabold" style={{ letterSpacing: "-0.04em" }}>{greeting()}.</h1>
          <div className="grid auto-rows-[minmax(150px,auto)] gap-4 md:grid-cols-4">
            <Tile to={today.due.total ? "/reviews" : "/learn"} className="text-white md:col-span-2 md:row-span-2" style={{ background: C.violet }}>
              <span className="text-sm font-semibold uppercase tracking-widest opacity-80">{today.due.total ? "Reviews due" : "All caught up"}</span>
              <span className="mt-2 text-[9rem] font-extrabold leading-none" style={{ letterSpacing: "-0.06em" }}><NumberFlow value={today.due.total} /></span>
              <div className="mt-auto flex flex-wrap gap-2">
                {breakdown(today.due).map((b) => (
                  <span key={b.label} className="rounded-full bg-white/15 px-3 py-1 text-sm">{b.n} {b.label}</span>
                ))}
              </div>
              <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-full px-6 py-3 font-bold" style={{ background: C.lime, color: C.ink }}>
                {today.due.total ? "Start reviews" : "Learn new"} <ArrowUpRight className="size-5" />
              </span>
            </Tile>

            <Tile style={{ background: C.coral }} className="text-white">
              <Flame className="size-8" />
              <span className="mt-auto text-5xl font-extrabold"><NumberFlow value={today.streakDays} /></span>
              <span className="font-semibold">day streak</span>
            </Tile>

            <Tile style={{ background: "white" }} className="items-center justify-center">
              <AnimatedCircularProgressBar value={pct(level)} gaugePrimaryColor={C.violet} gaugeSecondaryColor="oklch(92% 0.02 290)" className="size-28 text-2xl font-extrabold [&_span]:text-[oklch(20%_0.03_285)] [&_span]:opacity-100" />
              <span className="mt-2 font-semibold">{level.level} known</span>
            </Tile>

            <Tile style={{ background: "white" }} className="md:col-span-2">
              <span className="font-semibold">Your way to N1</span>
              <div className="mt-4 flex flex-1 items-end gap-3">
                {today.levels.map((l) => (
                  <div key={l.level} className="flex flex-1 flex-col items-center gap-2">
                    <div className="relative h-24 w-full overflow-hidden rounded-xl" style={{ background: "oklch(94% 0.015 290)" }}>
                      <div className="absolute inset-x-0 bottom-0 rounded-xl" style={{ height: `${Math.max(4, pct(l))}%`, background: l === level ? C.violet : C.sky }} />
                    </div>
                    <span className={`text-sm ${l === level ? "font-extrabold" : "opacity-60"}`}>{l.level}</span>
                  </div>
                ))}
              </div>
            </Tile>

            {entriesAt(nav, "practice").map((e, i) => (
              <Tile key={e.path} to={e.path} style={{ background: i ? C.sky : C.butter }} className="[&_svg]:size-7">
                {ICON[e.path]}
                <span className="mt-auto text-xl font-bold">{e.label}</span>
                <span className="text-sm opacity-70">{e.blurb}</span>
              </Tile>
            ))}
            {entriesAt(nav, "library").map((e) => (
              <Tile key={e.path} to={e.path} style={{ background: C.ink }} className="text-white md:col-span-2 [&_svg]:size-7">
                {ICON[e.path]}
                <span className="mt-auto text-xl font-bold">{e.label}</span>
                <span className="text-sm opacity-70">{e.blurb}</span>
              </Tile>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="study"><Place entries={entriesAt(nav, "study")} /></TabsContent>
        <TabsContent value="practice"><Place entries={entriesAt(nav, "practice")} /></TabsContent>
        <TabsContent value="library"><Place entries={entriesAt(nav, "library")} /></TabsContent>
      </Tabs>
    </div>
  );
};
