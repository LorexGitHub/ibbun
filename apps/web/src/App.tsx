import { buttonClass, Layout, onGoTo, useSystemModeSync } from "@mojibun/ui";
import { MotionConfig } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Link, Route, Routes, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AccountMenu } from "./AccountMenu.tsx";
import { AppDock } from "./AppDock.tsx";
import { CommandMenu, CommandTrigger, useCommandKey } from "./CommandMenu.tsx";
import { Welcome } from "./Home.tsx";
import { dockEntries, sessionAt, visibleTo, welcomeEntries, type Who } from "./places.ts";
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
  if (who.state === "out") return <Welcome entries={welcomeEntries(visibleTo(shell.nav, who))} />;
  return <Slot shell={shell} name="home" />;
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

  const sessionName = session && (
    <span className="session-name">
      <span className="jp" lang="ja" aria-hidden>
        {session.glyph}
      </span>
      {session.label}
    </span>
  );
  const aside = session ? (
    <Link className={buttonClass()} to="/">
      Done for now
    </Link>
  ) : (
    <>
      <CommandTrigger onOpen={openMenu} />
      <AccountMenu who={who} nav={nav} onSignOut={signOut} />
    </>
  );

  return (
    <MotionConfig reducedMotion="user">
      <Layout nav={sessionName} aside={aside} dock={session ? undefined : <AppDock entries={dockEntries(nav)} />}>
        <Routes>
          {shell.routes.map((r) => (
            <Route key={r.path} path={r.path} element={<r.component />} />
          ))}
          <Route path="*" element={<Home shell={shell} who={who} />} />
        </Routes>
      </Layout>
      <CommandMenu open={menuOpen} onOpenChange={setMenuOpen} nav={nav} who={who} onSignOut={signOut} />
      <Toaster position="top-center" />
    </MotionConfig>
  );
};
