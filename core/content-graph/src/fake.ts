import type { Graph } from "./graph.ts";
import { reader, type ContentGraph } from "./read.ts";

/** The read interface over rows held in memory. Same behaviour as the Postgres one (see the contract tests). */
export const createFakeContentGraph = (graph: Graph): ContentGraph => {
  const read = reader(graph);
  return {
    studyItem: async (id) => read.studyItem(id),
    readingPassage: async (id) => read.readingPassage(id),
    successorOf: async (id) => read.successorOf(id),
    levelList: async (level, type) => read.levelList(level, type),
    listeningClips: async (level) => read.listeningClips(level),
    search: async (query, { limit } = {}) => read.search(query, limit),
    credits: async () => read.credits(),
    pathItems: async () => read.pathItems(),
  };
};
