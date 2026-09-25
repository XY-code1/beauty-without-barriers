import { expect, test } from "@playwright/test";
import { begin, check, setCamera, installCamera } from "./harness";

test("three-second capture countdown can be cancelled without advancing", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page, { waitForPractice: false });
  await expect(page.getByText("保持正视 · 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "取消，返回练习" }).click();
  await page.waitForTimeout(3500);
  await expect(
    page.getByRole("heading", { name: "选择你的自然眼线" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).not.toBeVisible();
});

test("bounded capture chooses a usable frame from mixed blurred and clear video", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page);
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await setCamera(page, { mark: "mixed" });
  const before = await page.evaluate(
    () =>
      (window as unknown as { __cameraTest: { captures: number } }).__cameraTest
        .captures,
  );
  await check(page);
  await expect(page.getByText("眼尾明显偏高", { exact: true })).toBeVisible();
  const after = await page.evaluate(
    () =>
      (window as unknown as { __cameraTest: { captures: number } }).__cameraTest
        .captures,
  );
  expect(after - before).toBeGreaterThan(1);
  expect(after - before).toBeLessThanOrEqual(5);
});

test("stalled source sampling is bounded and never reuses a frame five times", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page);
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await check(page);
  const before = await page.evaluate(
    () =>
      (window as unknown as { __cameraTest: { captures: number } }).__cameraTest
        .captures,
  );
  await page
    .locator("video")
    .evaluate((video: HTMLVideoElement) => video.pause());
  await expect(page.getByText("这次无法判断", { exact: true })).toBeVisible();
  const after = await page.evaluate(
    () =>
      (window as unknown as { __cameraTest: { captures: number } }).__cameraTest
        .captures,
  );
  expect(after - before).toBeLessThanOrEqual(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("backgrounding cancels an active capture and cannot apply a late result", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page, { waitForPractice: false });
  await expect(page.getByText("保持正视 · 3", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(3500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "选择你的自然眼线" }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "开启摄像头" })).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText("摄像头已关闭");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __cameraTest: { streams: MediaStream[] } }
        ).__cameraTest.streams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
        ),
      ),
    )
    .toBe(true);
});

test("one decoded frame is sampled once even while the playback clock advances", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page);
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    Object.defineProperty(video, "getVideoPlaybackQuality", {
      value: () => ({ totalVideoFrames: 42 }),
    });
  });
  const before = await page.evaluate(
    () =>
      (window as unknown as { __cameraTest: { captures: number } }).__cameraTest
        .captures,
  );
  await check(page);
  await expect(page.getByText("这次无法判断", { exact: true })).toBeVisible();
  const after = await page.evaluate(
    () =>
      (window as unknown as { __cameraTest: { captures: number } }).__cameraTest
        .captures,
  );
  expect(after - before).toBe(1);
});
