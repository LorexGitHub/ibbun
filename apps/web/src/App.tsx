import { Layout, pillClass } from "@mojibun/ui";
import { NavLink, Route, Routes } from "react-router";
import type { Shell } from "./slices.ts";

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

export const App = ({ shell }: { shell: Shell }) => (
  <Layout
    nav={shell.nav.map((n) => (
      <NavLink key={n.path} to={n.path} className={({ isActive }) => pillClass(isActive)}>
        {n.label}
      </NavLink>
    ))}
  >
    <Routes>
      {shell.routes.map((r) => (
        <Route key={r.path} path={r.path} element={<r.component />} />
      ))}
      <Route path="*" element={<Slot shell={shell} name="home" />} />
    </Routes>
  </Layout>
);
