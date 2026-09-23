import { mkdir, cp, access, writeFile, rename } from "node:fs/promises";
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
const target = new URL("face_landmarker.task", root);
try {
  await access(target);
} catch {
  console.log(
    "Downloading the official Face Landmarker model (first install only)…",
  );
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  );
  if (!response.ok)
    throw new Error(
      `Model download failed: ${response.status}. Retry npm run assets.`,
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1_000_000)
    throw new Error("Incomplete model download");
  const temporary = new URL("face_landmarker.task.tmp", root);
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}
console.log("Local vision assets ready.");
