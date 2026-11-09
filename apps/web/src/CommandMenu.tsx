import type { NavEntry } from "@mojibun/slice";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { groups, type Who } from "./places.ts";

const onMac = () => typeof navigator !== "undefined" && /Mac|iP(hone|ad)/.test(navigator.userAgent);

/**
 * A screen matches by its name, or by a word in its description that starts with the search.
 * No fuzzy or mid-word matching: "read" must find Reading, not Today or "already".
 */
export const matchScore = (value: string, search: string, keywords: string[] = []) => {
  const q = search.trim().toLowerCase();
  if (!q || value.toLowerCase().includes(q)) return 1;
  const words = keywords.join(" ").toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return words.some((w) => w.startsWith(q)) ? 0.5 : 0;
};

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** Opens the menu on ⌘K or Ctrl+K anywhere, and on "/" when the Learner isn't typing an answer. */
export const useCommandKey = (open: () => void) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const chord = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      if (!chord && !(e.key === "/" && !typing(e.target))) return;
      e.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
};

export const CommandTrigger = ({ onOpen }: { onOpen: () => void }) => (
  <button type="button" className="pill go-to" onClick={onOpen} aria-keyshortcuts="Control+K Meta+K">
    Go to
    <Kbd className="go-to-key">{onMac() ? "⌘K" : "Ctrl K"}</Kbd>
  </button>
);

const Glyph = ({ entry }: { entry: NavEntry }) => (
  <span className="cmd-glyph jp" lang="ja" aria-hidden>
    {entry.glyph ?? entry.label[0]}
  </span>
);

export const CommandMenu = ({
  open,
  onOpenChange,
  nav,
  who,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: NavEntry[];
  who: Who;
  onSignOut: () => void;
}) => {
  const navigate = useNavigate();
  const run = (act: () => void) => () => {
    onOpenChange(false);
    act();
  };
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Go to"
      description="Jump to any screen in mojibun."
      className="cmd zoom-in-100 zoom-out-100 sm:max-w-xl"
    >
      <Command filter={matchScore}>
        <CommandInput placeholder="Where to? Try “listen” or “kanji”" />
        <CommandList className="max-h-[min(60vh,28rem)]">
          <CommandEmpty>Nothing goes by that name.</CommandEmpty>
          {groups(nav).map((g) => (
            <CommandGroup key={g.place} heading={g.heading}>
              {g.entries.map((entry) => (
                <CommandItem key={entry.path} value={entry.label} keywords={[entry.blurb]} onSelect={run(() => navigate(entry.path))}>
                  <Glyph entry={entry} />
                  <span className="cmd-text">
                    {entry.label}
                    <small>{entry.blurb}</small>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="You">
            {who.state === "in" ? (
              <CommandItem value="Log out" onSelect={run(onSignOut)}>
                Log out
              </CommandItem>
            ) : (
              <>
                <CommandItem value="Log in" onSelect={run(() => navigate("/login"))}>
                  Log in
                </CommandItem>
                <CommandItem value="Sign up" onSelect={run(() => navigate("/signup"))}>
                  Sign up
                </CommandItem>
              </>
            )}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
};
