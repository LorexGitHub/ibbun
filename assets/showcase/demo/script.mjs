// Writes script.json, the product-demo-director timeline for the README demo, from out/raw/marks.json (record.mjs).
// Each screen gets one held framing around the card (arrive, then let the viewer look); no push-ins.
// Run: node assets/showcase/demo/script.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { marks: m } = JSON.parse(readFileSync(join(here, "out", "raw", "marks.json"), "utf8"));
const V = { w: 1920, h: 1080 };
const r = (n) => +n.toFixed(2);

/** One fixed framing, centred on the app's column, wide enough to keep the whole card and its buttons. */
const hold = (box, dur, pad = 160) => {
  const scale = r(Math.max(1, Math.min(1.6, V.h / (box.h + pad * 2), V.w / (box.w + pad * 4))));
  const at = { scale, focusX: 50, focusY: r(((box.y + box.h / 2) / V.h) * 100) };
  return [{ atSec: 0, ...at }, { atSec: r(dur - 0.05), ...at }];
};
const clip = (n, from, to, box, intent = "demonstrate") => ({
  n, kind: "clip", src: "take.mp4", inSec: r(from), durSec: r(to - from),
  sourceType: "product", liveState: true, caption: false,
  direction: { intent, layout: "fullbleed", energy: 0.2 },
  ...(box ? { camera: hold(box, to - from) } : {}), transition: "cut",
});
const title = (n, durSec) => ({
  n, kind: "title", durSec, eyebrow: "一文ずつ",
  title: "Learn Japanese for the JLPT, N5 to N1, one sentence at a time.",
  titleLines: ["Learn Japanese for the JLPT,", "N5 to N1, one sentence at a time."], emphasis: "N5 to N1,", transition: "cut",
});
const shots = [
  title(1, 3.4),
  clip(2, m.today.t - 0.2, m.todayEnd.t, m.today.box),
  clip(3, m.lesson.t - 0.3, m.lessonEnd.t + 0.6, m.lessonTurned.box),
  clip(4, m.quiz.t - 0.2, m.quizEnd.t, m.quizCorrect.box),
  clip(5, m.review.t - 0.2, m.reviewEnd.t, m.reviewCorrect.box),
  clip(6, m.looks.t - 0.2, m.looksEnd.t, null, "payoff"),
  title(7, 4.2),
];
const script = {
  fps: 30,
  creativeDirection: { style: "studio", tone: "editorial", soundDesign: "silent" },
  production: { hardMaxSec: 50, maxZoomScale: 1.9 },
  shots,
};
writeFileSync(join(here, "script.json"), JSON.stringify(script, null, 2) + "\n");
