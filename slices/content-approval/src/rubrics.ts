import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A rubric is a versioned prompt template: `rubrics/<kind>/v<N>.md`, with one `- id: text` line per criterion. */
export type Rubric = { kind: string; version: string; template: string; criteria: string[] };

const ROOT = join(import.meta.dirname, "..", "rubrics");
const CRITERION = /^- ([a-z][a-z-]*): /;

const versionNumber = (file: string) => Number(file.replace(/^v(\d+)\.md$/, "$1"));

const criteriaOf = (template: string): string[] =>
  template.split("\n").flatMap((line) => {
    const found = CRITERION.exec(line);
    return found ? [found[1]!] : [];
  });

/** The newest version of the rubric for a content kind. */
export const rubricFor = (kind: string, root = ROOT): Rubric => {
  const files = readdirSync(join(root, kind)).filter((f) => /^v\d+\.md$/.test(f));
  const latest = files.sort((a, b) => versionNumber(b) - versionNumber(a))[0]!;
  const template = readFileSync(join(root, kind, latest), "utf8").replaceAll("\r\n", "\n");
  return { kind, version: `${kind}/${latest.replace(/\.md$/, "")}`, template, criteria: criteriaOf(template) };
};

/** Fills `{{name}}` placeholders. */
export const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => name in values ? values[name]! : "");
