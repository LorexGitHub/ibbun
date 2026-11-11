// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Attribution, AudioPlayer, Button, buttonClass, Card, Footer, Furigana, Input, KanaInput, Layout, openGoTo, onGoTo, Pill, pillClass, SessionCount, SessionCountSlot, setTheme, Sheet, ThemePicker, useSystemModeSync } from "./index.ts";

afterEach(cleanup);

describe("Layout", () => {
  it("frames a screen with the seal alone as the way home, what it is given for the top line, the screen and the EDRDG footer", () => {
    const { container } = render(
      <Layout nav={<a href="/reviews">Reviews</a>} aside={<span>N4</span>}>
        <h1>Today</h1>
      </Layout>,
    );
    const home = screen.getByRole("link", { name: "mojibun" });
    expect(home.getAttribute("href")).toBe("/");
    expect(home.textContent).toBe("");
    expect(container.querySelector(".nav-links")!.textContent).toBe("Reviews");
    expect(container.querySelector(".app-kanji")).toBeNull();
    expect(screen.getByText("N4")).toBeTruthy();
    expect(screen.getByRole("main").textContent).toBe("Today");
    expect(screen.getByRole("contentinfo").textContent).toContain("Electronic Dictionary Research and Development Group");
  });
});

describe("Layout's dock", () => {
  it("puts the dock after the screen, and leaves the middle of the top line out when there is nothing for it", () => {
    const { container } = render(
      <Layout dock={<nav aria-label="Dock">Today</nav>}>
        <h1>Today</h1>
      </Layout>,
    );
    expect(container.querySelector(".nav-links")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Dock" }).textContent).toBe("Today");
  });
});

describe("Layout's background kanji", () => {
  it("stands the screen's kanji behind it, in Japanese and hidden from a screen reader", () => {
    const { container } = render(
      <Layout kanji="復">
        <h1>Reviews</h1>
      </Layout>,
    );
    const kanji = container.querySelector(".app-kanji")!;
    expect(kanji.textContent).toBe("復");
    expect(kanji.getAttribute("lang")).toBe("ja");
    expect(kanji.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("main").textContent).toBe("Reviews");
  });
});

describe("SessionCount", () => {
  it("shows how far the session is in the frame's header when the frame has a place for it", () => {
    render(
      <>
        <header>
          <SessionCountSlot />
        </header>
        <main>
          <SessionCount at={2} of={5} />
        </main>
      </>,
    );
    expect(screen.getByRole("banner").textContent).toBe("2 / 5");
    expect(screen.getByRole("main").textContent).toBe("");
  });

  it("shows where it is rendered when no frame is around it", () => {
    render(
      <main>
        <SessionCount at={1} of={5} />
      </main>,
    );
    expect(screen.getByRole("main").textContent).toBe("1 / 5");
  });
});

describe("ThemePicker", () => {
  const saved = new Map<string, string>();
  beforeEach(() => {
    saved.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("puts the chosen look and mode on <html> and saves them on the device", () => {
    render(<ThemePicker />);
    fireEvent.click(screen.getByRole("radio", { name: /^Ai/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.palette).toBe("ai");
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(JSON.parse(localStorage.getItem("mojibun.theme")!)).toEqual({ palette: "ai", mode: "dark" });
    expect(screen.getByRole("radio", { name: /^Ai/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /^Shu/ }).getAttribute("aria-checked")).toBe("false");
  });

  it("follows the device's light or dark setting when asked to", () => {
    render(<ThemePicker />);
    fireEvent.click(screen.getByRole("radio", { name: "Match my device" }));
    expect(["light", "dark"]).toContain(document.documentElement.dataset.mode);
    expect(JSON.parse(localStorage.getItem("mojibun.theme")!).mode).toBe("system");
  });
});

describe("useSystemModeSync", () => {
  /** A device whose light or dark setting the test flips. */
  const device = () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: false,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    };
    vi.stubGlobal("matchMedia", () => media);
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    return { flip: (dark: boolean) => ((media.matches = dark), listeners.forEach((l) => l())), listeners };
  };
  afterEach(() => vi.unstubAllGlobals());

  it("follows the device while the Learner chose Match my device, and lets go on unmount", () => {
    const { flip, listeners } = device();
    setTheme({ palette: "ai", mode: "system" });
    const { unmount } = renderHook(() => useSystemModeSync());
    flip(true);
    expect(document.documentElement.dataset.mode).toBe("dark");
    flip(false);
    expect(document.documentElement.dataset.mode).toBe("light");
    unmount();
    expect(listeners.size).toBe(0);
  });

  it("ignores the device once the Learner picked Light or Dark", () => {
    const { flip } = device();
    setTheme({ palette: "ai", mode: "light" });
    renderHook(() => useSystemModeSync());
    flip(true);
    expect(document.documentElement.dataset.mode).toBe("light");
  });
});

describe("openGoTo", () => {
  it("reaches whoever listens, until they stop", () => {
    const open = vi.fn();
    const stop = onGoTo(open);
    openGoTo();
    stop();
    openGoTo();
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("Footer", () => {
  it("acknowledges EDRDG in its sample wording and links to Credits", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain(
      "These files are the property of the Electronic Dictionary Research and Development Group, and are used in conformance with the Group’s licence.",
    );
    expect(screen.getByRole("link", { name: "licence" }).getAttribute("href")).toBe("https://www.edrdg.org/edrdg/licence.html");
    expect(screen.getByRole("link", { name: "Credits" }).getAttribute("href")).toBe("/credits");
  });
});

describe("Attribution", () => {
  it("shows each credit, linked when it has a link", () => {
    render(<Attribution credits={[{ text: "VOICEVOX:ずんだもん" }, { text: "CK", href: "https://tatoeba.org/sentences/show/1" }]} />);
    const line = screen.getByText(/VOICEVOX/);
    expect(line.textContent).toBe("Credit: VOICEVOX:ずんだもん · CK");
    expect(screen.getByRole("link", { name: "CK" }).getAttribute("href")).toBe("https://tatoeba.org/sentences/show/1");
  });

  it("shows nothing when the record needs no inline credit", () => {
    const { container } = render(<Attribution credits={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("Furigana", () => {
  it("sets readings over the segments that have one, in Japanese", () => {
    const { container } = render(<Furigana segments={[{ text: "男", reading: "おとこ" }, { text: "の" }, { text: "人", reading: "ひと" }]} />);
    const span = container.firstElementChild!;
    expect(span.getAttribute("lang")).toBe("ja");
    expect([...span.querySelectorAll("rt")].map((rt) => rt.textContent)).toEqual(["おとこ", "ひと"]);
    expect(span.textContent).toBe("男(おとこ)の人(ひと)");
  });

  it("leaves the readings out when the Learner should read without them", () => {
    const { container } = render(<Furigana readings={false} segments={[{ text: "男", reading: "おとこ" }, { text: "の" }]} />);
    expect(container.querySelector("rt")).toBeNull();
    expect(container.textContent).toBe("男の");
  });
});

describe("KanaInput and Input", () => {
  const type = (input: HTMLInputElement, text: string) => fireEvent.input(input, { target: { value: text } });

  it("turns romaji into hiragana as the Learner types when bound to hiragana", () => {
    const onChange = vi.fn();
    render(<KanaInput aria-label="Reading" ime="hiragana" onChange={(e) => onChange(e.target.value)} />);
    const input = screen.getByLabelText<HTMLInputElement>("Reading");
    type(input, "otoko");
    expect(input.value).toBe("おとこ");
    expect(onChange).toHaveBeenLastCalledWith("おとこ");
    expect(input.getAttribute("lang")).toBe("ja");
  });

  it("turns romaji into katakana when bound to katakana", () => {
    render(<KanaInput aria-label="Reading" ime="katakana" onChange={() => {}} />);
    const input = screen.getByLabelText<HTMLInputElement>("Reading");
    type(input, "dan");
    expect(input.value).toBe("ダn");
    type(input, "dann");
    expect(input.value).toBe("ダン");
  });

  it("converts only the text before the cursor", () => {
    render(<KanaInput aria-label="Reading" ime="hiragana" onChange={() => {}} />);
    const input = screen.getByLabelText<HTMLInputElement>("Reading");
    fireEvent.input(input, { target: { value: "kaとこ", selectionStart: 2, selectionEnd: 2 } });
    expect(input.value).toBe("かとこ");
    expect(input.selectionStart).toBe(1);
  });

  it("keeps the Learner's selection when there is nothing to convert", () => {
    render(<KanaInput aria-label="Reading" ime="hiragana" onChange={() => {}} />);
    const input = screen.getByLabelText<HTMLInputElement>("Reading");
    fireEvent.input(input, { target: { value: "おとこ", selectionStart: 0, selectionEnd: 3 } });
    expect(input.value).toBe("おとこ");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
  });

  it("leaves text a Japanese IME is still composing to the IME", () => {
    render(<KanaInput aria-label="Reading" ime="hiragana" onChange={() => {}} />);
    const input = screen.getByLabelText<HTMLInputElement>("Reading");
    fireEvent.input(input, { target: { value: "ka" }, isComposing: true });
    expect(input.value).toBe("ka");
  });

  it("passes typed text through untouched in a plain input", () => {
    const onChange = vi.fn();
    render(<Input aria-label="Meaning" type="search" onChange={(e) => onChange(e.target.value)} />);
    const input = screen.getByLabelText<HTMLInputElement>("Meaning");
    type(input, "man");
    expect(input.value).toBe("man");
    expect(onChange).toHaveBeenLastCalledWith("man");
    expect(input.getAttribute("type")).toBe("search");
    expect(input.className).toBe("input");
  });
});

describe("AudioPlayer", () => {
  it("plays and pauses the clip and says which it will do next", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const { container } = render(<AudioPlayer src="/audio/1.mp3" label="あの男の人は先生です。" />);
    const audio = container.querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe("/audio/1.mp3");

    fireEvent.click(screen.getByRole("button", { name: "Play あの男の人は先生です。" }));
    expect(play).toHaveBeenCalledOnce();
    act(() => void audio.dispatchEvent(new Event("play")));

    fireEvent.click(screen.getByRole("button", { name: "Pause あの男の人は先生です。" }));
    expect(pause).toHaveBeenCalledOnce();
    act(() => void audio.dispatchEvent(new Event("pause")));
    expect(screen.getByRole("button").textContent).toBe("Play");

    act(() => void audio.dispatchEvent(new Event("play")));
    act(() => void audio.dispatchEvent(new Event("ended")));
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("AudioPlayer when the browser refuses to play", () => {
  it("stays ready to play and raises no error", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    render(<AudioPlayer src="/audio/1.mp3" label="clip" />);
    fireEvent.click(screen.getByRole("button", { name: "Play clip" }));
    await Promise.resolve();
    expect(screen.getByRole("button").textContent).toBe("Play");
  });
});

describe("card stock and paper", () => {
  it("names the button recipe for each variant and size", () => {
    expect(buttonClass()).toBe("btn");
    expect(buttonClass({ variant: "primary", big: true })).toBe("btn btn--primary btn--big");
    expect(buttonClass({ variant: "loud" })).toBe("btn btn--loud");
  });

  it("renders a button that never submits a form by accident", () => {
    const onClick = vi.fn();
    render(<Button variant="primary" onClick={onClick}>Start reviews</Button>);
    const button = screen.getByRole("button", { name: "Start reviews" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toBe("btn btn--primary");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("marks the selected pill with ink", () => {
    expect(pillClass(true)).toBe("pill pill--ink");
    expect(pillClass(false)).toBe("pill");
    render(<><Pill ink>Kanji</Pill><Pill>N5</Pill></>);
    expect(screen.getByText("Kanji").className).toBe("pill pill--ink");
    expect(screen.getByText("N5").className).toBe("pill");
  });

  it("puts content on a card", () => {
    render(<><Card>plain</Card><Card className="study">study</Card></>);
    expect(screen.getByText("plain").className).toBe("card");
    expect(screen.getByText("study").className).toBe("card study");
  });

  it("tears a sheet of paper with a pale fringe under it", () => {
    const { container } = render(<Sheet tear="band" fill="kraft">What you know so far</Sheet>);
    const wrap = container.firstElementChild!;
    expect(wrap.getAttribute("data-tear")).toBe("band");
    expect(wrap.querySelector(".fringe")!.getAttribute("aria-hidden")).toBe("true");
    expect(wrap.querySelector(".torn")!.getAttribute("data-fill")).toBe("kraft");
    expect(wrap.textContent).toBe("What you know so far");
  });
});
