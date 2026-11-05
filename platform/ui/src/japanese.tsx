import { Fragment, type ChangeEvent, type InputHTMLAttributes } from "react";
import { toKana } from "wanakana";

/** One run of Japanese text, with the reading to set over it when it has kanji. */
export type FuriganaSegment = { text: string; reading?: string };

/**
 * Japanese text with furigana. `readings` comes from the furigana rule in progress; the kit only draws.
 * The `rp` parentheses show only where ruby is not supported.
 */
export const Furigana = ({ segments, readings = true }: { segments: readonly FuriganaSegment[]; readings?: boolean }) => (
  <span className="jp" lang="ja">
    {segments.map((s, i) =>
      readings && s.reading ? (
        <ruby key={i}>
          {s.text}
          <rp>(</rp>
          <rt>{s.reading}</rt>
          <rp>)</rp>
        </ruby>
      ) : (
        <Fragment key={i}>{s.text}</Fragment>
      ),
    )}
  </span>
);

/** Which kana wanakana writes as the Learner types romaji. */
export type Ime = "hiragana" | "katakana";
const IME_MODE = { hiragana: "toHiragana", katakana: "toKatakana" } as const;

/**
 * Turns the romaji before the cursor into kana, as wanakana's `bind` does. `bind` writes through React's
 * value tracker, which hides the change from `onChange`, so the kit converts inside `onChange` instead.
 */
const toKanaBeforeCursor = (input: HTMLInputElement, ime: Ime) => {
  // A text input always has a cursor; only types such as email and number report null.
  const cursor = input.selectionEnd as number;
  const head = input.value.slice(0, cursor);
  const kana = toKana(head, { IMEMode: IME_MODE[ime] });
  if (kana === head) return;
  input.value = kana + input.value.slice(cursor);
  input.setSelectionRange(kana.length, kana.length);
};

type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** A text input in card stock. */
export const Input = (props: InputProps) => <input {...props} className="input" />;

/**
 * A text input for answers in Japanese: typed romaji becomes kana before `onChange` sees it.
 * Text a Japanese IME is still composing is left to the IME.
 */
export const KanaInput = ({ ime, onChange, ...rest }: { ime: Ime } & Omit<InputProps, "type">) => {
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    if (!(event.nativeEvent as InputEvent).isComposing) toKanaBeforeCursor(event.target, ime);
    onChange?.(event);
  };
  return <input type="text" lang="ja" autoComplete="off" {...rest} className="input" onChange={change} />;
};
