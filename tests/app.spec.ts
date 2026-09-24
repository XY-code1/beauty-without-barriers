import { expect, test } from "@playwright/test";
import { begin, check, installCamera, setCamera } from "./harness";

test("complete two explicit checkpoints without auto-advancing", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page);
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await setCamera(page, { mark: "high" });
  await check(page);
  await expect(page.getByText("眼尾明显偏高", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.getByRole("button", { name: "检查这一步" })).toBeDisabled();
  await page.getByRole("button", { name: "继续练习" }).click();
  await page.getByRole("button", { name: "重看这一步的提示" }).click();
  await expect(
    page.getByText("放大画面中的“起”是外眼角", { exact: false }),
  ).toBeVisible();
  await setCamera(page, { mark: "close" });
  await check(page);
  await expect(
    page.getByText("眼尾方向接近参考", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我已看过结果，继续下一步" }).click();
  await expect(
    page.getByRole("heading", { name: "轻轻连接眼睑外段" }),
  ).toBeVisible();
  await check(page);
  await expect(
    page.getByText("眼尾方向接近参考", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我已看过结果，完成练习" }).click();
  await expect(
    page.getByRole("heading", { name: "这一侧，练习完成。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "再练一次" }).click();
  await expect(
    page.getByRole("heading", { name: "选择你的自然眼线" }),
  ).toBeVisible();
});

test("camera refusal and model failure have a recovery entry", async ({
  page,
}) => {
  await installCamera(page, { denied: true });
  await page.goto("/#/eyeliner");
  await page.getByRole("button", { name: "开启摄像头" }).click();
  await expect(page.getByRole("alert")).toContainText("权限被拒绝");
  await expect(
    page.getByRole("button", { name: "重试开启摄像头" }),
  ).toBeVisible();
});

test("model load failure closes camera and allows retry", async ({ page }) => {
  await installCamera(page, { modelFailure: true });
  await page.goto("/#/eyeliner");
  await page.getByRole("button", { name: "开启摄像头" }).click();
  await expect(page.getByRole("alert")).toContainText("模型加载失败");
  await expect(
    page.getByRole("button", { name: "重试开启摄像头" }),
  ).toBeVisible();
  await expect(page.getByLabel("眼线参考路径")).toHaveAttribute(
    "data-visible",
    "false",
  );
});

test("face loss hides the guide and failed capture returns no judgment", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page);
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await check(page);
  await setCamera(page, { face: false });
  await expect(page.getByLabel("眼线参考路径")).toHaveAttribute(
    "data-visible",
    "false",
  );
  await expect(page.getByText("这次无法判断", { exact: true })).toBeVisible();
  await expect(
    page.getByText("没有找到可用眼部画面", { exact: false }),
  ).toBeVisible();
  await setCamera(page, { face: true });
  await expect(page.getByLabel("眼线参考路径")).toHaveAttribute(
    "data-visible",
    "true",
  );
});

test("duplicate clicks and cancel prevent stale completion; side/target changes reset baseline", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page);
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await check(page);
  await expect(
    page.getByRole("button", { name: "正在处理…", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "取消，返回练习" }).click();
  await page.getByRole("button", { name: "重新选择侧别或调整路径" }).click();
  await page.getByRole("button", { name: "左眼", exact: true }).click();
  await page.getByText("微调长度与上扬程度", { exact: true }).click();
  await page.getByLabel("上扬程度").fill("25");
  await expect(
    page.getByRole("button", { name: "左眼", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "选择你的自然眼线" }),
  ).toBeVisible();
  await expect(page.locator(".feedback")).toHaveCount(0);
  await page.getByRole("button", { name: "确认形状，拍画前照片" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "拍画前照片", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await setCamera(page, { mark: "none" });
  await check(page);
  await expect(page.getByText("这次无法判断", { exact: true })).toBeVisible();
});

test("raw keyframe does not contain the guide, including mirror and resize", async ({
  page,
}) => {
  await installCamera(page);
  await page.goto("/#/eyeliner");
  await page.getByRole("button", { name: "开启摄像头" }).click();
  await expect(page.getByLabel("眼线参考路径")).toHaveAttribute(
    "data-visible",
    "true",
  );
  expect(
    await page
      .getByLabel("眼线参考路径")
      .evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels.some((value, index) => index % 4 === 3 && value > 0);
      }),
  ).toBe(true);
  const saveRaw = () =>
    page.evaluate(async () => {
      const source = "/src/vision/camera.ts";
      const module = await import(/* @vite-ignore */ source);
      const data = module.captureRaw(document.querySelector("video")).data;
      const store = window as unknown as { __rawFrames?: Uint8ClampedArray[] };
      (store.__rawFrames ??= []).push(data);
    });
  await saveRaw();
  await page.getByRole("button", { name: "看效果", exact: true }).click();
  await expect(page.getByLabel("眼线参考路径")).toHaveAttribute(
    "data-mode",
    "preview",
  );
  await saveRaw();
  await page.getByText("参考线显示设置", { exact: true }).click();
  await page.getByLabel("高对比度参考线").check();
  await page.getByLabel("参考线不透明度").fill("0.5");
  await saveRaw();
  await page.getByRole("button", { name: "隐藏参考线" }).click();
  await page.getByRole("button", { name: "镜像已开" }).click();
  await page.setViewportSize({ width: 1000, height: 900 });
  await saveRaw();
  const comparison = await page.evaluate(() => {
    const [a, ...rest] = (
      window as unknown as { __rawFrames: Uint8ClampedArray[] }
    ).__rawFrames;
    let max = 0,
      sum = 0,
      changed = 0;
    for (const b of rest)
      for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        max = Math.max(max, d);
        sum += d;
        if (d) changed++;
      }
    return { max, mean: sum / (a.length * rest.length), changed };
  });
  // Chromium's canvas→video color conversion can round by one gray level after
  // resizing. A green overlay entering the raw frame would exceed this bound.
  expect(comparison.max).toBeLessThanOrEqual(1);
  expect(comparison.mean).toBeLessThan(0.1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("shape preview is explicitly an illustration before camera starts", async ({
  page,
}) => {
  await page.goto("/#/eyeliner");
  const detail = page.getByLabel("眼部放大画面");
  await expect(
    page.getByText("形状示意 · 非实时", { exact: true }),
  ).toBeVisible();
  await expect(detail).toHaveAttribute("data-source", "illustration");
  const pixels = () => detail.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const outline = await pixels();
  await page.getByRole("button", { name: "看效果", exact: true }).click();
  await expect(detail).toHaveAttribute("data-mode", "preview");
  expect(await pixels()).not.toBe(outline);
  await expect(
    page.getByRole("button", { name: "确认形状，拍画前照片" }),
  ).toBeDisabled();
  const originalTarget = await pixels();
  await page.getByText("微调长度与上扬程度", { exact: true }).click();
  await page.getByLabel("眼尾长度").fill("0.45");
  expect(await pixels()).not.toBe(originalTarget);
  await page.getByRole("button", { name: "左眼", exact: true }).click();
  await page.getByRole("button", { name: "跟着画", exact: true }).click();
  await page
    .locator(".guidance-card")
    .screenshot({ path: "test-results/v2-shape-guide.png" });
  await page.getByRole("button", { name: "看效果", exact: true }).click();
  await page
    .locator(".guidance-card")
    .screenshot({ path: "test-results/v2-shape-preview.png" });
});

test("live magnifier follows the current step and clears on face loss or pause", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page);
  const detail = page.getByLabel("眼部放大画面");
  await expect(detail).toHaveAttribute("data-source", "live");
  await expect(detail).toHaveAttribute("data-step", "wing");
  await expect(
    page.getByText("从“起”向“收”轻画短线", { exact: false }),
  ).toBeVisible();
  await page
    .locator(".guidance-card")
    .screenshot({ path: "test-results/v2-live-wing.png" });
  await page.getByRole("button", { name: "看效果", exact: true }).click();
  await setCamera(page, { mark: "close" });
  await check(page);
  await expect(
    page.getByText("眼尾方向接近参考", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我已看过结果，继续下一步" }).click();
  await expect(detail).toHaveAttribute("data-mode", "guide");
  await expect(detail).toHaveAttribute("data-step", "connect");
  await expect(
    page.getByText("从眼睑外段的“起”点", { exact: false }),
  ).toBeVisible();
  await page
    .locator(".guidance-card")
    .screenshot({ path: "test-results/v2-live-connect.png" });
  await setCamera(page, { face: false });
  await expect(detail).toHaveAttribute("data-source", "none");
  expect(
    await detail.evaluate((c: HTMLCanvasElement) =>
      c
        .getContext("2d")!
        .getImageData(0, 0, c.width, c.height)
        .data.every((v) => v === 0),
    ),
  ).toBe(true);
  await setCamera(page, { face: true });
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(detail).toHaveAttribute("data-source", "none");
  await expect(page.getByText("已暂停，恢复后显示实时画面")).toBeVisible();
  await page.getByRole("button", { name: "继续练习" }).click();
  await expect(detail).toHaveAttribute("data-source", "live");
});

test("actual OpenCV rejects blur and large occlusion in the page", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page);
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  for (const mark of ["blur", "occlusion"]) {
    await setCamera(page, { mark });
    await check(page);
    await expect(page.getByText("这次无法判断", { exact: true })).toBeVisible();
    await expect(page.locator(".feedback small")).toHaveCount(0);
  }
});

test("analysis loading failure preserves the guidance flow, never invents a result", async ({
  page,
}) => {
  await installCamera(page);
  await page.route("**/assets/opencv.js", (route) => route.abort());
  await begin(page);
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await check(page);
  await expect(page.getByText("分析暂不可用", { exact: true })).toBeVisible();
  await expect(page.locator(".feedback small")).toHaveCount(0);
});

test("local MediaPipe WASM/model actually load and infer on an empty frame", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installCamera(page, { realModel: true });
  await page.goto("/#/eyeliner");
  await page.getByRole("button", { name: "开启摄像头" }).click();
  await expect(page.getByRole("button", { name: "关闭摄像头" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("眼线参考路径")).toHaveAttribute(
    "data-visible",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "确认形状，拍画前照片" }),
  ).toBeDisabled();
});

test("mobile and desktop layout fit the viewport", async ({ page }) => {
  await page.goto("/#/eyeliner");
  await expect(
    page.getByRole("heading", { name: "从一条眼线，开始。" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/demo-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/demo-desktop.png",
    fullPage: true,
  });
});

test("stalled video hides the old guide and recovers on fresh frames", async ({
  page,
}) => {
  await installCamera(page);
  await page.goto("/#/eyeliner");
  await page.getByRole("button", { name: "开启摄像头" }).click();
  await expect(page.getByLabel("眼线参考路径")).toHaveAttribute(
    "data-visible",
    "true",
  );
  await page
    .locator("video")
    .evaluate((video: HTMLVideoElement) => video.pause());
  await expect(page.getByLabel("眼线参考路径")).toHaveAttribute(
    "data-visible",
    "false",
  );
  await expect(
    page.getByRole("button", { name: "确认形状，拍画前照片" }),
  ).toBeDisabled();
  await page
    .locator("video")
    .evaluate((video: HTMLVideoElement) => video.play());
  await expect(page.getByLabel("眼线参考路径")).toHaveAttribute(
    "data-visible",
    "true",
  );
  await page.getByRole("button", { name: "关闭摄像头" }).click();
  expect(
    await page
      .locator("video")
      .evaluate((video: HTMLVideoElement) => video.srcObject),
  ).toBeNull();
});
