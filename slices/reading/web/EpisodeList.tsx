import { Link } from "react-router";
import { Card } from "@mojibun/ui";
import type { EpisodeLists } from "../contract.ts";

/** The Learner's past Batch Texts, per level, as episodes to reread. */
export const EpisodeList = ({ lists }: { lists: EpisodeLists }) => (
  <Card>
    <h1>Reading</h1>
    {lists.levels.length === 0 && <p>No stories yet. Finish a Learn batch and your first one arrives.</p>}
    {lists.levels.map(({ level, episodes }) => (
      <section key={level}>
        <h2>{level === "unlevelled" ? "Unlevelled" : level}</h2>
        <ol>
          {episodes.map((e) => (
            <li key={e.id}>
              <Link to={`/reading/texts/${e.id}`}>
                Episode {e.episode}: <span lang="ja">{e.title}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    ))}
  </Card>
);
