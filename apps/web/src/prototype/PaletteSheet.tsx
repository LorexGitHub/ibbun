// PROTOTYPE: throwaway. All five palettes in light and dark on one page, each a scaled copy of variant B.
import type { NavEntry } from "@mojibun/slice";
import type { Who } from "../places.ts";
import type { TodayData } from "./data.ts";
import { PALETTES } from "./palettes.ts";
import { VariantB } from "./VariantB.tsx";

const W = 1280;
const H = 960;
const SCALE = 0.34;

export const PaletteSheet = (props: { today: TodayData; nav: NavEntry[]; who: Who; openMenu: () => void }) => (
  <div className="min-h-screen bg-[#e9e9e9] p-6 pb-24" style={{ fontFamily: "ui-sans-serif, system-ui" }}>
    <div className="mx-auto grid w-fit grid-cols-2 gap-x-5 gap-y-6">
      {PALETTES.flatMap((p, i) =>
        (["light", "dark"] as const).map((mode) => (
          <div key={`${p.key}-${mode}`} role="link" tabIndex={0} onClick={() => location.assign(`/?variant=B&sample&palette=${p.key}&mode=${mode}`)} className="block cursor-pointer">
            <p className="mb-1.5 text-sm text-[#333]">
              <b>{i + 1}. {p.name}</b> · {mode}
            </p>
            <div className="overflow-hidden rounded-lg shadow-md ring-1 ring-black/10" style={{ width: W * SCALE, height: H * SCALE }}>
              <div className="pointer-events-none origin-top-left [&>div]:h-full [&>div]:min-h-0!" style={{ width: W, height: H, transform: `scale(${SCALE})` }}>
                <VariantB {...props} palette={p.key} mode={mode} />
              </div>
            </div>
          </div>
        )),
      )}
    </div>
  </div>
);
