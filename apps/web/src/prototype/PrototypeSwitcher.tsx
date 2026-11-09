// PROTOTYPE: throwaway. A floating bar that cycles ?variant= on the current route.
import { useEffect } from "react";
import { useSearchParams } from "react-router";

export const PrototypeSwitcher = ({ variants }: { variants: { key: string; name: string }[] }) => {
  const [params, setParams] = useSearchParams();
  const index = Math.max(0, variants.findIndex((v) => v.key === params.get("variant")));
  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length]!;
    setParams((p) => (p.set("variant", next.key), p), { replace: true });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA"].includes(t.tagName))) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const current = variants[index]!;
  return (
    <div
      style={{ fontFamily: "ui-monospace, monospace" }}
      className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#111] p-1 text-sm text-white shadow-2xl ring-1 ring-white/20"
    >
      <button type="button" onClick={() => go(-1)} className="cursor-pointer rounded-full px-3 py-1.5 hover:bg-white/15" aria-label="Previous variant">
        ←
      </button>
      <span className="px-2">
        PROTOTYPE {current.key} · {current.name}
      </span>
      <button type="button" onClick={() => go(1)} className="cursor-pointer rounded-full px-3 py-1.5 hover:bg-white/15" aria-label="Next variant">
        →
      </button>
    </div>
  );
};
