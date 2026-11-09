import { buttonClass, Layout, pillClass } from "@mojibun/ui";
import { MotionConfig } from "motion/react";
import { useCallback, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { AccountMenu } from "./AccountMenu.tsx";
import { CommandMenu, CommandTrigger, useCommandKey } from "./CommandMenu.tsx";
import { Paths, Welcome } from "./Home.tsx";
import { PrototypeHome } from "./prototype/PrototypeHome.tsx";
import { barEntries, sessionAt, todayEntries, visibleTo, type Who } from "./places.ts";
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
  const entries = todayEntries(visibleTo(shell.nav, who));
  if (who.state === "loading") return null;
  if (who.state === "out") return <Welcome entries={entries} />;
  return (
    <>
      <Slot shell={shell} name="home" />
      <Paths entries={entries} linked heading="Every way in" />
    </>
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
  const [params] = useSearchParams();
  const prototype = import.meta.env.DEV && pathname === "/" ? params.get("variant") : null;

  const signOut = async () => {
    const result = await client.signOut();
    if (!result.ok) return void toast.error("You're still logged in.", { description: result.message });
    setWho({ state: "out" });
    navigate("/");
    toast("Logged out. See you next time.");
  };

  const bar = session ? (
    <span className="session-name">
      <span className="jp" lang="ja" aria-hidden>
        {session.glyph}
      </span>
      {session.label}
    </span>
  ) : (
    barEntries(nav).map((n) => (
      <NavLink key={n.path} to={n.path} end={n.path === "/"} className={({ isActive }) => pillClass(isActive)}>
        {n.label}
      </NavLink>
    ))
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
      {prototype ? (
        <PrototypeHome variant={prototype} nav={nav} who={who} openMenu={openMenu} />
      ) : (
      <Layout nav={bar} aside={aside}>
        <Routes>
          {shell.routes.map((r) => (
            <Route key={r.path} path={r.path} element={<r.component />} />
          ))}
          <Route path="*" element={<Home shell={shell} who={who} />} />
        </Routes>
      </Layout>
      )}
      <CommandMenu open={menuOpen} onOpenChange={setMenuOpen} nav={nav} who={who} onSignOut={signOut} />
      <Toaster position="bottom-center" />
    </MotionConfig>
  );
};
