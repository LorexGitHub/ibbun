// Measures the VOICEVOX Lambda image (docker/voicevox) under the Lambda Runtime
// Interface Emulator (#253): cold start to the first clip, then the time per
// clip for each voice, at Lambda memory sizes. Lambda gives one vCPU per
// 1,769 MB, so each size runs with that CPU share and memory cap, on a
// read-only root with only /tmp writable.
//
//   docker build -t mojibun-voicevox-lambda docker/voicevox
//   node scripts/measure-voicevox-lambda.mjs <path to aws-lambda-rie> [voice ids...]
import { execFileSync } from "node:child_process";

const [rie, ...ids] = process.argv.slice(2);
if (!rie) throw new Error("usage: measure-voicevox-lambda.mjs <aws-lambda-rie> [voice ids...]");
const voices = (ids.length ? ids : ["2", "8", "11", "13", "14", "21"]).map(Number);
const KANA = "キョ'オワ/イ'イ/テ'ンキ/デ'スネ、サ'ンポニ/イキマ'ショオ";
const PORT = 9090;

const event = (method, path, query, body) => ({
  version: "2.0",
  rawPath: path,
  rawQueryString: new URLSearchParams(query).toString(),
  headers: { "content-type": "application/json" },
  requestContext: { http: { method, path, protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "measure" } },
  body: body === undefined ? undefined : JSON.stringify(body),
  isBase64Encoded: false,
});

const post = (payload) =>
  fetch(`http://localhost:${PORT}/2015-03-31/functions/function/invocations`, { method: "POST", body: JSON.stringify(payload) })
    .then((response) => response.json())
    .catch(() => undefined);

/** The emulator refuses connections until the container is up, so the first call retries. */
const retry = async (attempt) => (await attempt()) ?? new Promise((resolve) => setTimeout(resolve, 50)).then(() => retry(attempt));

const checked = (path, result) => {
  if (result.statusCode !== 200) throw new Error(`${path} answered ${JSON.stringify(result).slice(0, 300)}`);
  return result;
};

const invoke = async (method, path, query, body) => checked(path, await retry(() => post(event(method, path, query, body))));

const clip = async (speaker) => {
  const phrases = await invoke("POST", "/accent_phrases", { text: KANA, speaker, is_kana: "true" });
  const query = {
    accent_phrases: JSON.parse(phrases.body), speedScale: 1, pitchScale: 0, intonationScale: 1, volumeScale: 1,
    prePhonemeLength: 0.1, postPhonemeLength: 0.1, pauseLength: null, pauseLengthScale: 1,
    outputSamplingRate: 24000, outputStereo: false, kana: KANA,
  };
  const wav = await invoke("POST", "/synthesis", { speaker }, query);
  return Buffer.from(wav.body, wav.isBase64Encoded ? "base64" : "utf8").length;
};

const timed = async (work) => {
  const start = performance.now();
  const value = await work();
  return { seconds: (performance.now() - start) / 1000, value };
};

const docker = (...args) => execFileSync("docker", args, { encoding: "utf8" }).trim();

const results = [];
for (const memory of [2048, 3072, 4096]) {
  const cpus = (memory / 1769).toFixed(2);
  const name = `voicevox-lambda-${memory}`;
  try { docker("rm", "-f", name); } catch {}
  const start = performance.now();
  docker(
    "run", "-d", "--name", name, "-p", `${PORT}:8080`, `--memory=${memory}m`, `--cpus=${cpus}`,
    "--read-only", "--tmpfs", "/tmp:exec,size=512m", "--user", "993:990",
    "-v", `${rie}:/aws-lambda-rie:ro`, "--entrypoint", "/aws-lambda-rie",
    "mojibun-voicevox-lambda", "/opt/voicevox_engine/run", "--host", "127.0.0.1", "--port", "50021",
  );
  const bytes = await clip(voices[0]);
  const cold = (performance.now() - start) / 1000;
  const perVoice = [];
  for (const voice of voices) {
    const first = await timed(() => clip(voice));
    const warm = [];
    for (let i = 0; i < 3; i++) warm.push((await timed(() => clip(voice))).seconds);
    perVoice.push({ voice, first: first.seconds, warm: warm.sort((a, b) => a - b)[1] });
  }
  const peak = docker("stats", "--no-stream", "--format", "{{.MemUsage}}", name);
  docker("rm", "-f", name);
  results.push({ memory, cpus, cold, bytes, peak, perVoice });
  console.log(JSON.stringify(results.at(-1)));
}

console.log(`\n| Memory | vCPU | Cold start to first clip | Memory in use after | ${voices.map((v) => `voice ${v} first / warm`).join(" | ")} |`);
console.log(`| --- | --- | --- | --- | ${voices.map(() => "---").join(" | ")} |`);
for (const r of results) {
  const cells = r.perVoice.map((p) => `${p.first.toFixed(2)} s / ${p.warm.toFixed(2)} s`);
  console.log(`| ${r.memory} MB | ${r.cpus} | ${r.cold.toFixed(1)} s | ${r.peak.split(" / ")[0]} | ${cells.join(" | ")} |`);
}
