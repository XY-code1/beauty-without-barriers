// Imported only by the local real-sample test runner; not by the production app.
import { createDetector } from "../vision/detector";
import { eyeFromLandmarks } from "../guidance/geometry";
import { evaluateFrames } from "./evaluate";
import { loadOpenCV } from "./opencv";
import type { Frame, Target } from "../types";
let clock = 0;
export async function evaluatePair(
  beforeUrl: string,
  afterUrl: string,
  target: Target,
) {
  const frames: Frame[] = [];
  for (const url of [beforeUrl, afterUrl]) {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    // A fresh VIDEO detector prevents tracking state leaking across participants.
    const detector = await createDetector();
    const timestamp = ++clock * 1000;
    let landmarks;
    try {
      landmarks = detector.detectForVideo(canvas, timestamp).faceLandmarks[0];
    } finally {
      detector.close();
    }
    const eye = landmarks
      ? eyeFromLandmarks(landmarks, target.side, canvas.width, canvas.height)
      : null;
    if (!eye)
      return {
        verdict: "unknown",
        message: "无法判断",
        reason: "真实样本未检测到眼部",
        durationMs: 0,
      };
    frames.push({
      pixels: ctx.getImageData(0, 0, canvas.width, canvas.height),
      eye,
      target,
      revision: 0,
      timestamp,
    });
  }
  return evaluateFrames(await loadOpenCV(), frames[0], frames[1]);
}
