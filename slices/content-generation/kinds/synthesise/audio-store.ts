import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GetObjectCommand, HeadObjectCommand, NotFound, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/** Object storage for audio files, keyed by `audioKeyOf`. A local volume in dev. */
export interface AudioStore {
  has(key: string): Promise<boolean>;
  put(key: string, audio: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export type AudioSpec = { kana: string; voice: number; engineVersion: string; speed: number };

/** hash(kana/accent string, voice, engine version, speed): the same speech always has the same key (listening.md#audio-files). */
export const audioKeyOf = ({ kana, voice, engineVersion, speed }: AudioSpec): string =>
  createHash("sha256").update(JSON.stringify([kana, voice, engineVersion, speed])).digest("hex");

export const createMemoryAudioStore = (): AudioStore => {
  const files = new Map<string, Uint8Array>();
  return {
    async has(key) {
      return files.has(key);
    },
    async put(key, audio) {
      files.set(key, audio);
    },
    async get(key) {
      return files.has(key) ? files.get(key)! : null;
    },
  };
};

/** Files in a directory, named by key. Writing an existing key replaces it with the same bytes' worth of speech. */
export const createDirectoryAudioStore = (dir: string): AudioStore => {
  const read = (key: string) => readFile(join(dir, key)).then((b) => new Uint8Array(b), () => null);
  return {
    async has(key) {
      return (await read(key)) !== null;
    },
    async put(key, audio) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, key), audio);
    },
    get: read,
  };
};

/** Where an S3 store keeps its files. CloudFront serves `/audio/*` from the bucket, so on AWS the prefix is `audio/` and the object key is the URL path. */
export type S3Location = { bucket: string; prefix: string };

/** Objects in a bucket under `prefix`. Keys are content hashes, so an object never changes and may be cached forever. */
export const createS3AudioStore = (client: S3Client, { bucket, prefix }: S3Location): AudioStore => {
  const Key = (key: string) => prefix + key;
  const missing = (error: unknown) => {
    if (error instanceof NotFound || error instanceof NoSuchKey) return null;
    throw error;
  };
  return {
    async has(key) {
      return (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: Key(key) })).catch(missing)) !== null;
    },
    async put(key, audio) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: Key(key), Body: audio, ContentType: "audio/ogg", CacheControl: "public, max-age=31536000, immutable" }));
    },
    async get(key) {
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: Key(key) })).catch(missing);
      return object ? object.Body!.transformToByteArray() : null;
    },
  };
};

/** `AUDIO_DIR` is a directory, or `s3://bucket/prefix` on AWS. The client reads `AWS_REGION`; a local S3 such as Compose's also needs `AWS_ENDPOINT_URL_S3`. */
export const audioStoreAt = (location: string): AudioStore => {
  if (!location.startsWith("s3://")) return createDirectoryAudioStore(location);
  const [bucket, ...path] = location.slice("s3://".length).split("/");
  return createS3AudioStore(new S3Client({ forcePathStyle: Boolean(process.env.AWS_ENDPOINT_URL_S3) }), { bucket: bucket!, prefix: path.join("/") });
};
