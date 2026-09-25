import { createHash } from "node:crypto";
import { mkdir, cp, readFile, writeFile, rename, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODEL_SHA256 =
  "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function ensureModel({
  target,
  temporary = new URL(`${target.pathname}.tmp`, target),
  fetchImpl = fetch,
  expectedSha256 = MODEL_SHA256,
  modelUrl = MODEL_URL,
}) {
  await rm(temporary, { force: true });

  try {
    if (sha256(await readFile(target)) === expectedSha256) return false;
  } catch {
    // Missing or unreadable models are downloaded again.
  }

  console.log("Downloading the official Face Landmarker model…");
  try {
    const response = await fetchImpl(modelUrl);
    if (!response.ok)
      throw new Error(
        `Model download failed: ${response.status}. Retry npm run assets.`,
      );

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha256(bytes) !== expectedSha256)
      throw new Error("Model download failed integrity verification");

    await writeFile(temporary, bytes);
    await rm(target, { force: true });
    await rename(temporary, target);
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function prepareAssets() {
  const root = new URL("../public/assets/", import.meta.url);
  await mkdir(root, { recursive: true });
  await cp(
    new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url),
    new URL("wasm/", root),
    { recursive: true },
  );
  await cp(
    new URL(
      "../node_modules/@techstark/opencv-js/dist/opencv.js",
      import.meta.url,
    ),
    new URL("opencv.js", root),
  );
  await ensureModel({ target: new URL("face_landmarker.task", root) });
  console.log("Local vision assets ready.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  await prepareAssets();
