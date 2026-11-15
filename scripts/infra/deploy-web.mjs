// `pnpm stack:deploy:web` builds the web app and uploads it to the showcase stage's web bucket.
// Hashed assets are cached for a year; index.html is revalidated on every visit, so a deploy shows
// at once. The bucket and distribution come from `terraform output` in infra/showcase.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout.trim();
};
const output = (name) => run("terraform", ["output", "-raw", name], resolve(root, "infra/showcase"));

run("node", ["scripts/infra/build.mjs"]);
const bucket = `s3://${output("web_bucket")}`;
const dist = resolve(root, "apps/web/dist");
run("aws", ["s3", "sync", dist, bucket, "--delete", "--exclude", "index.html", "--cache-control", "public,max-age=31536000,immutable", "--only-show-errors"]);
run("aws", ["s3", "cp", resolve(dist, "index.html"), `${bucket}/index.html`, "--cache-control", "no-cache", "--only-show-errors"]);
// index.html is revalidated anyway; this clears a copy cached before it carried no-cache.
run("aws", ["cloudfront", "create-invalidation", "--distribution-id", output("distribution_id"), "--paths", "/index.html"]);
console.log(`deployed to ${output("url")}`);
