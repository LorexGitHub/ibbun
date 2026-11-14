import type { JlptLevel } from "@ibbun/shared";

/** One entry of a Tanos grammar list: its site id and the pattern. Only the plain list is read, never the Kanzen Master "usage" pages (docs/licensing.md). */
export type TanosEntry = { key: string; level: JlptLevel; title: string };

const LINK = /<a[^>]*grammarid=(\d+)"[^>]*>([^<]+)<\/a>/g;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]!);

/** Parses a level's list page (`/jlpt/jlptN/grammar/`), whose rows each link to a grammar id. */
export const parseTanos = (level: JlptLevel, html: string): TanosEntry[] =>
  [...html.matchAll(LINK)].map(([, id, title]) => ({ key: id!, level, title: decode(title!).trim() }));
