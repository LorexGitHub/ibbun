import { Link } from "react-router";
import { buttonClass, Card, State } from "@ibbun/ui";
import type { Episode, EpisodeLists, TextLevel } from "../contract.ts";
import "./reading.css";

export type Story = Episode & { level: TextLevel };

export const levelName = (level: TextLevel) => (level === "unlevelled" ? "Unlevelled" : level);

/** Every Batch Text of every level as one line of stories, the newest first. */
export const newestFirst = (lists: EpisodeLists): Story[] =>
  lists.levels.flatMap(({ level, episodes }) => episodes.map((episode) => ({ ...episode, level }))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

const storyPath = (story: Story) => `/reading/texts/${story.id}`;

const Where = ({ story }: { story: Story }) => (
  <span className="story-where">
    Episode {story.episode} · {levelName(story.level)}
  </span>
);

const Newest = ({ story }: { story: Story }) => (
  <Card>
    <div className="story-newest">
      <p className="caps">Your newest story</p>
      <h2 lang="ja">{story.title}</h2>
      <Where story={story} />
      <Link className={buttonClass({ variant: "primary", big: true })} to={storyPath(story)}>
        Read
      </Link>
    </div>
  </Card>
);

const Earlier = ({ stories }: { stories: Story[] }) => (
  <section aria-labelledby="earlier-stories">
    <h2 id="earlier-stories">Earlier stories</h2>
    <ul className="story-list">
      {stories.map((story) => (
        <li key={story.id}>
          <Link to={storyPath(story)} lang="ja">
            {story.title}
          </Link>
          <Where story={story} />
        </li>
      ))}
    </ul>
  </section>
);

const NoStories = () => (
  <State mark="読" title="No stories yet" fact="Finish a Learn batch and your first one arrives.">
    <Link className={buttonClass({ variant: "primary" })} to="/learn">
      Learn a batch
    </Link>
  </State>
);

/** The Learner's Batch Texts: the newest one leads, the earlier ones are a plain list below it. */
export const EpisodeList = ({ lists }: { lists: EpisodeLists }) => {
  const [newest, ...earlier] = newestFirst(lists);
  return (
    <section aria-labelledby="reading-title" className="reading">
      <h1 id="reading-title">Reading</h1>
      {newest ? <Newest story={newest} /> : <NoStories />}
      {earlier.length > 0 && <Earlier stories={earlier} />}
      <p>
        <Link to="/reading/practice">Practice Texts</Link>
      </p>
    </section>
  );
};
