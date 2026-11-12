import { Link } from "react-router";
import { Attribution, Card, buttonClass, pillClass } from "@mojibun/ui";
import type { Detail, ItemPage } from "../contract.ts";
import { itemPath, levelLabel } from "./BrowseView.tsx";

const list = (values: string[]) => values.join("、");

type Of<T extends Detail["type"]> = Extract<Detail, { type: T }>;

const KanjiDetail = ({ d }: { d: Of<"kanji"> }) => (
  <dl>
    <dt>Meanings</dt>
    <dd>{d.meanings.join(", ")}</dd>
    <dt>On readings</dt>
    <dd lang="ja">{list(d.onReadings) || "—"}</dd>
    <dt>Kun readings</dt>
    <dd lang="ja">{list(d.kunReadings) || "—"}</dd>
    <dt>Strokes</dt>
    <dd>{d.strokeCount}</dd>
    {d.grade !== null && (
      <>
        <dt>School grade</dt>
        <dd>{d.grade}</dd>
      </>
    )}
    {d.components.length > 0 && (
      <>
        <dt>Components</dt>
        <dd lang="ja">{d.components.join(" ")}</dd>
      </>
    )}
  </dl>
);

const WordDetail = ({ d }: { d: Of<"word"> }) => (
  <>
    <dl>
      <dt>Readings</dt>
      <dd lang="ja">{d.readings.map((r) => (r.pitchAccent?.length ? `${r.text} [${r.pitchAccent.join(", ")}]` : r.text)).join("、")}</dd>
    </dl>
    <ol>
      {d.senses.map((s, i) => (
        <li key={i}>
          {s.partsOfSpeech.length > 0 && <small>{s.partsOfSpeech.join(", ")} </small>}
          {s.glosses.join("; ")}
          {s.japaneseExplanation && <p lang="ja">{s.japaneseExplanation}</p>}
        </li>
      ))}
    </ol>
  </>
);

const GrammarDetail = ({ d }: { d: Of<"grammar_point"> }) => (
  <>
    <p>{d.meaning}</p>
    <dl>
      <dt>Forms</dt>
      <dd lang="ja">{d.forms.map((f) => `${f.text} (${f.register})`).join("、")}</dd>
      <dt>Formation</dt>
      <dd>{d.formation.join("; ")}</dd>
      <dt>Register</dt>
      <dd>{d.register}</dd>
    </dl>
    {d.japaneseExplanation && <p lang="ja">{d.japaneseExplanation}</p>}
    {d.notes && <p>{d.notes}</p>}
  </>
);

const DetailView = ({ d }: { d: Detail }) => {
  switch (d.type) {
    case "kanji":
      return <KanjiDetail d={d} />;
    case "word":
      return <WordDetail d={d} />;
    case "grammar_point":
      return <GrammarDetail d={d} />;
  }
};

const headword = (d: Detail) => {
  switch (d.type) {
    case "kanji":
      return d.literal;
    case "word":
      return d.forms[0] ?? d.readings[0]?.text ?? "";
    case "grammar_point":
      return d.title;
  }
};

/** Where Learn runs a Study Item early (docs/learning-path.md#learn-now). */
export const learnNowHref = (id: string) => `/learn?now=${encodeURIComponent(id)}`;

/** Where Cram practises one Study Item, Locked or not. */
export const cramHref = (id: string) => `/cram?items=${encodeURIComponent(id)}`;

/** One Study Item, as its own page or as the sheet over the wall. Locked items can always be read here; Learn now starts them early. */
export const ItemView = ({ page, sheet = false }: { page: ItemPage; sheet?: boolean }) => (
  <article aria-labelledby="item-title">
    {!sheet && (
      <p>
        <Link to="/browse">Library</Link>
      </p>
    )}
    <h1 id="item-title" lang="ja">
      {headword(page.detail)}
    </h1>
    <p>
      <span className={pillClass(false)}>{levelLabel(page.level)}</span>{" "}
      <span className={pillClass(false)}>{page.detail.type.replace("_", " ")}</span>
      {page.locked && <span className={pillClass(true)}>Locked</span>}
    </p>
    <p className="item-actions">
      {!page.introduced && (
        <a className={buttonClass({ variant: "primary" })} href={learnNowHref(page.id)}>
          Learn now
        </a>
      )}
      <a className={buttonClass()} href={cramHref(page.id)}>
        Cram this
      </a>
    </p>
    <Card>
      <DetailView d={page.detail} />
    </Card>
    {page.related.map((group) => (
      <Card key={group.heading}>
        <h2>{group.heading}</h2>
        <ul>
          {group.items.map(({ summary, note }) => (
            <li key={summary.id}>
              <Link to={itemPath(summary.id)}>
                <span lang="ja">{summary.label}</span> {summary.meaning}
              </Link>
              {note && <small> {note}</small>}
            </li>
          ))}
        </ul>
      </Card>
    ))}
    {page.examples.length > 0 && (
      <Card>
        <h2>Examples</h2>
        <ul>
          {page.examples.map((e) => (
            <li key={e.id}>
              <span lang="ja">{e.text}</span>
              {e.translation && <small> {e.translation}</small>}
              <Attribution credits={e.credits} />
            </li>
          ))}
        </ul>
      </Card>
    )}
    <Attribution credits={page.credits} />
  </article>
);
