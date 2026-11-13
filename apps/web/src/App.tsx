import type { NavEntry } from "@ibbun/slice";
import { buttonClass, KeyMark, Layout, LevelFilter, onGoTo, SessionCountSlot, useKey, useLevelFilter, useSystemModeSync } from "@ibbun/ui";
import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Toaster } from "@/vendor/ui/sonner";
import { AccountMenu } from "./AccountMenu.tsx";
import { AppDock } from "./AppDock.tsx";
import { CommandMenu, CommandTrigger, useCommandKey } from "./CommandMenu.tsx";
import { Welcome } from "./Home.tsx";
import { LevelLinks } from "./LevelLinks.tsx";
import { dockEntries, kanjiAt, sessionAt, takesLevel, visibleTo, welcomeEntries, type Who } from "./places.ts";
import type { Shell } from "./slices.ts";
import { client, useWho } from "./who.ts";

/** Renders every widget a slice registered for `name`. Neither the screen nor the widget's slice knows the other. */
export const Slot = ({ shell, name }: { shell: Shell; name: string }) => (
  <>
    {shell.widgets
      .filter((w) => w.slot === name)
      .map((w, i) => (
        <w.component key={i} />
      ))}
  </>
);

const Home = ({ shell, who }: { shell: Shell; who: Who }) => {
  if (who.state === "loading") return null;
  if (who.state === "out") {
    const door = shell.widgets.some((w) => w.slot === "welcome") && <Slot shell={shell} name="welcome" />;
    return <Welcome entries={welcomeEntries(visibleTo(shell.nav, who))} door={door} />;
  }
  return <Slot shell={shell} name="home" />;
};

/** The way out of a session. Esc takes it too. */
const DoneForNow = () => {
  const navigate = useNavigate();
  useKey("Escape", () => navigate("/"));
  return (
    <Link className={buttonClass()} to="/" aria-keyshortcuts="Escape">
      Done for now
      <KeyMark of="Escape" />
    </Link>
  );
};

const SessionName = ({ session }: { session: NavEntry }) => (
  <span className="session-name">
    <span className="jp" lang="ja" aria-hidden>
      {session.glyph}
    </span>
    {session.label}
    <SessionCountSlot />
  </span>
);

/** What the header shows beside the seal: a door opened for one level keeps "All" and the levels, a session included. */
const useLevels = (nav: NavEntry[], who: Who, pathname: string, map: boolean) => {
  const filtered = useLevelFilter() !== undefined && who.state === "in" && takesLevel(nav, pathname);
  if (filtered) return <LevelFilter />;
  return map ? <LevelLinks /> : undefined;
};

/** A session is the Learner's own: a visitor goes to Log in and comes back here afterwards. */
const LogInFirst = () => {
  const { pathname, search } = useLocation();
  return <Navigate replace to={`/login?next=${encodeURIComponent(pathname + search)}`} />;
};

/** The screen at the address: a slice's route, or Home. */
const Screens = ({ shell, who, session }: { shell: Shell; who: Who; session: NavEntry | undefined }) => {
  if (session && who.state === "out") return <LogInFirst />;
  return (
    <Routes>
      {shell.routes.map((r) => (
        <Route key={r.path} path={r.path} element={<r.component />} />
      ))}
      <Route path="*" element={<Home shell={shell} who={who} />} />
    </Routes>
  );
};

export const App = ({ shell, initialWho }: { shell: Shell; initialWho?: Who }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [fetched, setWho] = useWho(pathname);
  const who = initialWho ?? fetched;
  const nav = visibleTo(shell.nav, who);
  const session = sessionAt(nav, pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  useCommandKey(openMenu);
  useEffect(() => onGoTo(openMenu), [openMenu]);
  useSystemModeSync();

  const signOut = async () => {
    const result = await client.signOut();
    if (!result.ok) return void toast.error("You're still logged in.", { description: result.message });
    setWho({ state: "out" });
    navigate("/");
    toast("Logged out. See you next time.");
  };

  // The dock and the levels are a Learner's map: hidden from visitors, and during a session
  const map = who.state === "in" && !session;
  const dock = map ? <AppDock entries={dockEntries(nav)} /> : undefined;
  const levels = useLevels(nav, who, pathname, map);
  const sessionName = session && <SessionName session={session} />;
  const aside = session ? (
    <DoneForNow />
  ) : (
    <>
      <CommandTrigger onOpen={openMenu} />
      <AccountMenu who={who} nav={nav} onSignOut={signOut} />
    </>
  );

  return (
    <MotionConfig reducedMotion="user">
      <Layout nav={(sessionName || levels) && <>{sessionName}{levels}</>} aside={aside} dock={dock} kanji={kanjiAt(nav, pathname)}>
        <Screens shell={shell} who={who} session={session} />
      </Layout>
      <CommandMenu open={menuOpen} onOpenChange={setMenuOpen} nav={nav} who={who} onSignOut={signOut} />
      <Toaster position="top-center" />
    </MotionConfig>
  );
};
