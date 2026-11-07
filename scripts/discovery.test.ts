import { cp, mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ServerContext } from "@mojibun/slice";
import { createFakeJobs } from "@mojibun/jobs";
import { createApp } from "../apps/api/src/app.ts";
import { startWorker } from "../apps/worker/src/worker.ts";
import { generate } from "./gen-slice-index.mjs";

const ctx = { db: {}, sessions: { resolve: async () => null } } as unknown as ServerContext;
const fixture = resolve(import.meta.dirname, "fixtures/root");

const listFiles = async (dir: string): Promise<string[]> =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).replaceAll("\\", "/"))
    .sort();

describe("slice discovery", () => {
  it("indexes no slices when there are none", async () => {
    const root = await mkdtemp(join(tmpdir(), "root-"));
    const [api] = await generate(root);
    expect(await readFile(api!, "utf8")).toContain("export const slices: Slice[] = [];");
  });

  it("adding a slice folder changes only the two generated, git-ignored index files", async () => {
    const root = await mkdtemp(join(tmpdir(), "root-"));
    await generate(root);
    const before = await listFiles(root);
    await mkdir(join(root, "slices"));
    await cp(join(fixture, "slices"), join(root, "slices"), { recursive: true });
    await generate(root);
    const added = (await listFiles(root)).filter((f) => !before.includes(f));
    expect(added.filter((f) => !f.startsWith("slices/"))).toEqual([]);
    expect(await readFile(join(root, "apps/api/src/slices.generated.ts"), "utf8")).toContain("sample/register.ts");
    expect(await readFile(join(root, "apps/worker/src/slices.generated.ts"), "utf8")).toContain("sample/register.ts");
  });

  it("api mounts the sample slice's routes under /api/<name>", async () => {
    await generate(fixture);
    const { slices } = await import(join(fixture, "apps/api/src/slices.generated.ts"));
    const app = await createApp(slices, ctx);
    expect(await (await app.request("/api/sample/ping")).json()).toEqual({ pong: true });
    expect(await (await app.request("/api/health")).json()).toEqual({ ok: true });
  });

  it("worker runs the sample slice's jobs", async () => {
    await generate(fixture);
    const { slices } = await import(join(fixture, "apps/worker/src/slices.generated.ts"));
    const { Ping, pinged } = await import("./fixtures/root/slices/sample/server/index.ts");
    const jobs = createFakeJobs();
    expect(await startWorker(jobs, slices, ctx)).toEqual(["sample.ping"]);
    await jobs.enqueue(Ping, { who: "Aki" });
    await jobs.drain();
    expect(pinged).toEqual(["Aki"]);
  });
});
