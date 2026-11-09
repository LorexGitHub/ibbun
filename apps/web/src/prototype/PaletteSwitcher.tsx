// PROTOTYPE: throwaway. Picks variant B's palette (?palette=) and mode (?mode=), above the variant bar.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { PALETTES, type Mode } from "./palettes.ts";

export const usePalette = () => {
  const [params] = useSearchParams();
  return { palette: params.get("palette") ?? PALETTES[0]!.key, mode: (params.get("mode") === "dark" ? "dark" : "light") as Mode };
};

export const PaletteSwitcher = () => {
  const [, setParams] = useSearchParams();
  const { palette, mode } = usePalette();
  const set = (key: string, value: string) => setParams((p) => (p.set(key, value), p), { replace: true });
  const index = PALETTES.findIndex((p) => p.key === palette);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA"].includes(t.tagName))) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        set("palette", PALETTES[(index + (e.key === "ArrowDown" ? 1 : -1) + PALETTES.length) % PALETTES.length]!.key);
      }
      if (e.key.toLowerCase() === "d") set("mode", mode === "dark" ? "light" : "dark");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const current = PALETTES[Math.max(0, index)]!;
  return (
    <div style={{ fontFamily: "ui-monospace, monospace" }} className="fixed right-4 top-4 z-[100] flex flex-col items-end gap-1">
      <div className="flex items-center gap-1 rounded-full bg-[#111] p-1 text-xs text-white shadow-2xl ring-1 ring-white/20">
        {PALETTES.map((p, i) => (
          <button
            key={p.key}
            type="button"
            title={`${p.name}: ${p.note}`}
            onClick={() => set("palette", p.key)}
            className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 ${p.key === current.key ? "bg-white text-black" : "hover:bg-white/15"}`}
          >
            <span className="size-3 rounded-full ring-1 ring-white/40" style={{ background: p.modes[mode].accent }} />
            {i + 1}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/25" />
        {(["light", "dark"] as const).map((m) => (
          <button key={m} type="button" onClick={() => set("mode", m)} className={`cursor-pointer rounded-full px-2.5 py-1.5 ${mode === m ? "bg-white text-black" : "hover:bg-white/15"}`}>
            {m}
          </button>
        ))}
      </div>
      <span className="rounded-full bg-[#111]/80 px-3 py-0.5 text-[11px] text-white/90">
        {current.name} · {current.note} · ↑↓ palette, D mode
      </span>
    </div>
  );
};
