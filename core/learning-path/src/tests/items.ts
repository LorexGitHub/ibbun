import type { PathItem } from "@ibbun/content-graph";
import type { StudyItemId } from "@ibbun/shared";

let n = 0;
/** A fresh UUID-shaped Study Item ID. */
export const newId = () => `00000000-0000-7000-8000-${(++n).toString().padStart(12, "0")}` as StudyItemId;

/** A visible PathItem with no sort facts or dependencies unless given. */
export const pathItem = (type: PathItem["type"], level: PathItem["level"], fields: Partial<PathItem> = {}): PathItem => ({
  id: newId(),
  type,
  level,
  suspended: false,
  priorityTags: [],
  frequency: null,
  grade: null,
  dependsOn: [],
  demonstrates: [],
  ...fields,
});
