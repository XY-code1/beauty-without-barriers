import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  cp,
  link,
  readFile,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
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
  temporary = new URL(`face-landmarker-${randomUUID()}.tmp`, target),
  fetchImpl = fetch,
  expectedSha256 = MODEL_SHA256,
  modelUrl = MODEL_URL,
  replaceFile = replaceModel,
}) {
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
    await replaceFile(temporary, target, expectedSha256);
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function replaceModel(
  temporary,
  target,
  expectedSha256,
  renameFile = rename,
  linkFile = link,
) {
  try {
    await renameFile(temporary, target);
    return;
  } catch (error) {
    if (!["EEXIST", "EPERM"].includes(error.code)) throw error;
  }

  const backup = new URL(`face-landmarker-${randomUUID()}.bak`, target);
  try {
    await renameFile(target, backup);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      await renameFile(temporary, target);
      return;
    } catch (retryError) {
      if (sha256(await readFile(target)) === expectedSha256) return;
      throw retryError;
    }
  }

  try {
    await renameFile(temporary, target);
  } catch (error) {
    try {
      if (sha256(await readFile(target)) === expectedSha256) {
        await rm(backup, { force: true });
        return;
      }
    } catch {
      // Restore below without overwriting a concurrent replacement.
    }
    try {
      await linkFile(backup, target);
      await rm(backup, { force: true });
    } catch (restoreError) {
      try {
        if (sha256(await readFile(target)) === expectedSha256) {
          await rm(backup, { force: true });
          return;
        }
      } catch {
        // Keep the backup when neither restoration nor a peer install succeeded.
      }
      throw new AggregateError(
        [error, restoreError],
        `Model replacement failed; previous model retained at ${backup.href}`,
      );
    }
    throw error;
  }
  await rm(backup, { force: true });
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await prepareAssets();
