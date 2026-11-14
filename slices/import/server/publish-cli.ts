// `pnpm content:publish` copies approved content from the local Postgres to the showcase stage's Postgres and uploads the generated audio.
// Run it again after any import or Approval Decision; a run with nothing new changes nothing (docs/adr/0017-showcase-stage-on-aws.md).
//   TARGET_DATABASE_URL        the Aurora URL (required). TARGET_DATABASE_IAM_REGION signs an IAM token for it instead of a password.
//   TARGET_AUDIO_DIR           s3://audio-bucket/audio/ (required). The AWS SDK reads its credentials and region as usual.
//   DATABASE_URL, AUDIO_DIR    the local database and audio files.
import { resolve } from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { collectMigrations, createDb, migrate, workspacePackageDirs } from "@ibbun/db";
import { required } from "../sources/grammar-seed/connect.ts";
import { copyContent, directoryAudioSource, publishAudio, s3AudioTarget } from "./publish.ts";

const sourceUrl = required(process.env, "DATABASE_URL");
const targetUrl = required(process.env, "TARGET_DATABASE_URL");
const audioTo = required(process.env, "TARGET_AUDIO_DIR");
if (!audioTo.startsWith("s3://")) throw new Error("TARGET_AUDIO_DIR must be s3://bucket/prefix/");
const audioFrom = process.env.AUDIO_DIR ?? "./data/audio";
if (audioFrom.startsWith("s3://")) throw new Error("AUDIO_DIR must be the local directory the audio was generated into");

const source = createDb(sourceUrl, { max: 2, iamRegion: "" });
const target = createDb(targetUrl, { max: 2, iamRegion: process.env.TARGET_DATABASE_IAM_REGION ?? "" });
let failed = false;
try {
  const root = resolve(import.meta.dirname, "../../..");
  const applied = await migrate(target.$client, await collectMigrations(await workspacePackageDirs(root)));
  console.log(applied.length ? `target migrated: ${applied.length} migrations` : "target schema is up to date");

  const content = await copyContent(source.$client, target.$client);
  for (const t of content.tables) console.log(`${t.table.padEnd(30)} ${String(t.copied).padStart(7)} approved, ${String(t.changed).padStart(7)} changed`);

  const audio = await publishAudio(content.audioKeys, directoryAudioSource(audioFrom), s3AudioTarget(new S3Client({}), audioTo));
  console.log(`audio: ${audio.uploaded} uploaded, ${audio.unchanged} already there, ${audio.missing.length} missing locally`);
  if (audio.missing.length) {
    failed = true;
    console.error(`missing audio files:\n${audio.missing.join("\n")}`);
  }
} finally {
  await Promise.all([source.$client.end(), target.$client.end()]);
}
process.exit(failed ? 1 : 0);
