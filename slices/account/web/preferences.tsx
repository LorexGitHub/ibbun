import { useEffect, useState } from "react";
import type { Preferences, PreferencesChange } from "@mojibun/learner/client";
import { useClient } from "./client.ts";
import { Field, Notice, useOutcome } from "./form.tsx";
import { shows, switchLanguage, type Language } from "./explanations.ts";

const FURIGANA: { value: Preferences["furigana"]; label: string }[] = [
  { value: "mixed", label: "Only on Words still New to me" },
  { value: "on", label: "On every Word with kanji" },
  { value: "off", label: "Off" },
];

const Check = ({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) => (
  <label className="choice">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    {label}
  </label>
);

const Explanation = ({ prefs, language, label, save }: { prefs: Preferences; language: Language; label: string; save: (c: PreferencesChange) => void }) => {
  const on = shows(prefs.explanations, language);
  return (
    <Check
      label={label}
      checked={on}
      disabled={on && switchLanguage(prefs.explanations, language, false) === null}
      onChange={(next) => {
        const explanations = switchLanguage(prefs.explanations, language, next);
        if (explanations) save({ explanations });
      }}
    />
  );
};

const Count = ({ label, value, min, max, save }: { label: string; value: number; min: number; max: number; save: (n: number) => void }) => (
  <Field label={label} type="number" min={min} max={max} value={value} onChange={(e) => e.target.value && save(Number(e.target.value))} />
);

/** The Learner preference screens: every change is saved at once. */
export const PreferencesSection = () => {
  const client = useClient();
  const { outcome, run } = useOutcome();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  useEffect(() => {
    void client.preferences().then((r) => r.ok && setPrefs(r.data));
  }, [client]);
  if (!prefs) return null;

  const save = async (change: PreferencesChange) => {
    const result = await client.changePreferences(change);
    if (result.ok) setPrefs(result.data);
    await run(Promise.resolve(result), "Saved.");
  };

  return (
    <fieldset className="account-form">
      <legend>Preferences</legend>
      <div role="radiogroup" aria-label="Furigana">
        {FURIGANA.map(({ value, label }) => (
          <label className="choice" key={value}>
            <input type="radio" name="furigana" checked={prefs.furigana === value} onChange={() => void save({ furigana: value })} />
            {label}
          </label>
        ))}
      </div>
      <Explanation prefs={prefs} language="english" label="Show the English translation" save={(c) => void save(c)} />
      <Explanation prefs={prefs} language="japanese" label="Show the Japanese Explanation" save={(c) => void save(c)} />
      <Check label="Turn romaji into kana as I type" checked={prefs.convertRomaji} onChange={(convertRomaji) => void save({ convertRomaji })} />
      <Check label="Listening in exam mode" checked={prefs.examMode} onChange={(examMode) => void save({ examMode })} />
      <Check label="Play Listening audio slowly" checked={prefs.slowAudio} onChange={(slowAudio) => void save({ slowAudio })} />
      <Count label="Study Items per Learn batch" value={prefs.batchSize} min={1} max={20} save={(batchSize) => void save({ batchSize })} />
      <Count label="New Study Items per day" value={prefs.dailyBudget} min={0} max={200} save={(dailyBudget) => void save({ dailyBudget })} />
      <Notice outcome={outcome} />
    </fieldset>
  );
};
