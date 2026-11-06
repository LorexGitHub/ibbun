import type { Authoring } from "../authoring/authoring.ts";
import { tables, type Graph } from "../graph.ts";
import { FIXTURE_PROVENANCE_ID, n5Fixture } from "./n5.ts";

/**
 * Loads the N5 fixture graph through `content-graph/authoring`, in dev and test only.
 * Refuses in production. Safe to run again: a second load finds the fixture and does nothing.
 */
export const loadN5Fixture = async (authoring: Authoring, env: { NODE_ENV?: string }): Promise<string> => {
  if (env.NODE_ENV === "production") throw new Error("the N5 fixture graph is for dev and test; refused in production");
  if ((await authoring.rows("provenance", { id: FIXTURE_PROVENANCE_ID })).length) return "N5 fixture: already loaded";
  const { graph } = n5Fixture();
  for (const name of Object.keys(tables) as (keyof Graph)[]) await authoring.insert(name, graph[name] as never);
  return `N5 fixture: ${graph.studyItem.length} Study Items loaded`;
};
