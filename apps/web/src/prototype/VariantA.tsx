// PROTOTYPE: throwaway. Variant A, "Studio": a sidebar app shell, one "Up next" panel, levels as bars.
import NumberFlow from "@number-flow/react";
import type { NavEntry } from "@mojibun/slice";
import { BookOpen, ChevronRight, Command, Flame, Headphones, Layers, Library, Settings, Sparkles, Target, Zap } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { groups, type Who } from "../places.ts";
import { breakdown, currentLevel, greeting, pct, type TodayData } from "./data.ts";

const ICONS: Record<string, ReactNode> = {
  "/": <Sparkles />, "/reviews": <Zap />, "/learn": <Layers />, "/placement": <Target />, "/cram": <Flame />,
  "/reading": <BookOpen />, "/listening": <Headphones />, "/browse": <Library />, "/settings": <Settings />,
};

const theme = {
  "--font-display": "'Plus Jakarta Sans', sans-serif",
  "--font-body": "'Plus Jakarta Sans', sans-serif",
  "--background": "oklch(98.5% 0.003 80)",
  "--foreground": "oklch(22% 0.01 60)",
  "--card": "oklch(100% 0 0)",
  "--card-foreground": "oklch(22% 0.01 60)",
  "--primary": "oklch(60% 0.19 33)",
  "--primary-foreground": "oklch(99% 0 0)",
  "--secondary": "oklch(95% 0.006 80)",
  "--secondary-foreground": "oklch(22% 0.01 60)",
  "--muted": "oklch(95% 0.006 80)",
  "--muted-foreground": "oklch(52% 0.01 60)",
  "--accent": "oklch(94% 0.02 33)",
  "--border": "oklch(91% 0.006 80)",
  "--ring": "oklch(60% 0.19 33)",
  "--radius": "10px",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
} as CSSProperties;

export const VariantA = ({ today, nav, who, openMenu }: { today: TodayData; nav: NavEntry[]; who: Who; openMenu: () => void }) => {
  const level = currentLevel(today.levels);
  return (
    <div style={theme} className="flex min-h-screen bg-background text-foreground">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card/60 p-4 md:flex">
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground" lang="ja">文</span>
          <span className="text-lg font-bold tracking-tight">mojibun</span>
        </div>
        <button type="button" onClick={openMenu} className="mb-4 flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
          <Command className="size-4" /> Jump to…
          <kbd className="ml-auto rounded bg-muted px-1.5 text-xs">Ctrl K</kbd>
        </button>
        <nav className="flex flex-col gap-4 overflow-y-auto">
          {groups(nav).filter((g) => g.place !== "account" && g.place !== "supervisor").map((g) => (
            <div key={g.place}>
              {g.place !== "home" && <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.heading}</p>}
              {g.entries.map((e) => (
                <Link key={e.path} to={e.path} className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium no-underline [&_svg]:size-4 ${e.path === "/" ? "bg-accent text-primary" : "text-foreground hover:bg-secondary"}`}>
                  {ICONS[e.path]}
                  {e.label}
                  {e.path === "/reviews" && today.due.total > 0 && <Badge className="ml-auto h-5 rounded-full px-1.5">{today.due.total}</Badge>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 rounded-md border border-border p-2">
          <span className="grid size-8 place-items-center rounded-full bg-secondary text-sm font-semibold">{who.state === "in" ? who.learner.email[0]?.toUpperCase() : "?"}</span>
          <span className="truncate text-sm">{who.state === "in" ? who.learner.email : "Not logged in"}</span>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 md:px-10">
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight" style={{ letterSpacing: "-0.02em" }}>{greeting()}.</h1>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardDescription className="font-semibold uppercase tracking-wider text-primary">Up next</CardDescription>
              <CardTitle className="flex items-baseline gap-3 text-6xl font-extrabold tracking-tight">
                <NumberFlow value={today.due.total} />
                <span className="text-xl font-semibold text-muted-foreground">{today.due.total === 1 ? "review" : "reviews"} due</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-wrap gap-2">
                {breakdown(today.due).map((b) => (
                  <Badge key={b.label} variant="secondary" className="h-7 rounded-full px-3 text-sm">{b.n} {b.label}</Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-11 px-5 text-base no-underline">
                  <Link to={today.due.total ? "/reviews" : "/learn"}>{today.due.total ? "Start reviews" : "Learn something new"} <ChevronRight /></Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 px-5 text-base text-foreground no-underline">
                  <Link to={today.due.total ? "/learn" : "/reading"}>{today.due.total ? "Learn new" : "Read a text"}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Streak</CardDescription>
              <CardTitle className="flex items-center gap-2 text-4xl font-extrabold">
                <Flame className="size-8 text-primary" /> <NumberFlow value={today.streakDays} />
                <span className="text-base font-medium text-muted-foreground">days</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-1.5">
                {Array.from({ length: 14 }, (_, i) => (
                  <span key={i} className={`h-8 flex-1 rounded ${i >= 14 - Math.min(14, today.streakDays) ? "bg-primary" : "bg-secondary"}`} />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Last two weeks</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-5">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Your way to N1</CardTitle>
              <CardDescription>You're {pct(level)}% through {level.level}. Nothing is locked.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {today.levels.map((l) => (
              <div key={l.level} className="grid grid-cols-[3rem_1fr_7rem] items-center gap-4">
                <span className={`font-bold ${l.level === level.level ? "text-primary" : ""}`}>{l.level}</span>
                <Progress value={pct(l)} className="h-2.5" />
                <span className="text-right text-sm tabular-nums text-muted-foreground">{l.known} / {l.total}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Separator className="my-8" />
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Practice</h2>
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {nav.filter((n) => n.place === "practice" || n.place === "library").map((e) => (
            <Link key={e.path} to={e.path} className="flex items-center gap-4 px-4 py-3.5 text-foreground no-underline hover:bg-secondary [&_svg]:size-5">
              <span className="grid size-10 place-items-center rounded-lg bg-accent text-primary">{ICONS[e.path]}</span>
              <span className="flex-1">
                <span className="block font-semibold">{e.label}</span>
                <span className="block text-sm text-muted-foreground">{e.blurb}</span>
              </span>
              <ChevronRight className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
};
