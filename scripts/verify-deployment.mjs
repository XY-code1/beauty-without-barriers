import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = new URL(process.env.PAGE_URL || "");
const assets = [
  "assets/face_landmarker.task",
  "assets/opencv.js",
  "assets/wasm/vision_wasm_internal.js",
  "assets/wasm/vision_wasm_internal.wasm",
];

for (const asset of assets) {
  const url = new URL(asset, base);
  const response = await fetch(url);
  assert.equal(response.status, 200, `${url} returned ${response.status}`);
  assert(Number(response.headers.get("content-length")) > 0, `${url} is empty`);
  await response.body?.cancel();
}

const browser = await chromium.launch({
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext();
await context.grantPermissions(["camera"], { origin: base.origin });
const page = await context.newPage();
const failedAssets = [];
page.on("response", (response) => {
  if (response.url().includes("/assets/") && response.status() >= 400)
    failedAssets.push(`${response.status()} ${response.url()}`);
});

await page.goto(base.href, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "今天，从哪一步开始？" }).waitFor();
assert(
  await page.evaluate(
    () =>
      isSecureContext &&
      typeof navigator.mediaDevices?.getUserMedia === "function",
  ),
  "camera permission API is unavailable in this context",
);

await page.goto(new URL("#/eyeliner", base).href, { waitUntil: "networkidle" });
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("heading", { name: "从一条眼线，开始。" }).waitFor();
await page.getByRole("button", { name: "开启摄像头" }).click();
await page.getByRole("button", { name: "关闭摄像头" }).waitFor({
  timeout: 30_000,
});
assert.deepEqual(
  failedAssets,
  [],
  `asset requests failed: ${failedAssets.join(", ")}`,
);
await browser.close();

console.log(`Deployment verified: ${base.href}`);
