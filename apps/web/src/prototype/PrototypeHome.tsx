// PROTOTYPE: throwaway. Three redesigns of the home screen on "/", switched by ?variant=A|B|C.
import type { NavEntry } from "@mojibun/slice";
import type { Who } from "../places.ts";
import { useToday } from "./data.ts";
import { PaletteSheet } from "./PaletteSheet.tsx";
import { PaletteSwitcher, usePalette } from "./PaletteSwitcher.tsx";
import { PrototypeSwitcher } from "./PrototypeSwitcher.tsx";
import { VariantA } from "./VariantA.tsx";
import { VariantB } from "./VariantB.tsx";
import { VariantC } from "./VariantC.tsx";

const VARIANTS = [
  { key: "A", name: "Studio", View: VariantA },
  { key: "B", name: "Ma", View: VariantB },
  { key: "C", name: "Playground", View: VariantC },
];

export const PrototypeHome = ({ variant, nav, who, openMenu }: { variant: string; nav: NavEntry[]; who: Who; openMenu: () => void }) => {
  const data = useToday();
  const { View, key } = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0]!;
  const { palette, mode } = usePalette();
  if (key === "B" && data && new URLSearchParams(location.search).has("sheet"))
    return <PaletteSheet today={data.today} nav={nav} who={who} openMenu={openMenu} />;
  return (
    <>
      {data && <View today={data.today} nav={nav} who={who} openMenu={openMenu} palette={palette} mode={mode} />}
      {key === "B" && <PaletteSwitcher />}
      {data?.sample && (
        <p className="fixed left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full bg-black px-3 py-1 font-mono text-xs text-white">sample data</p>
      )}
      <PrototypeSwitcher variants={VARIANTS} />
    </>
  );
};
