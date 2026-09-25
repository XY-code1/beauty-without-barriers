import { expect, test } from "@playwright/test";
import { begin, installCamera } from "./harness";

test("mobile practice keeps the eye, instruction and primary action together", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCamera(page);
  await begin(page);
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "眼部已定位" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "查看整体画面", exact: true }),
  ).toBeVisible();
  for (const item of [
    page.getByLabel("眼部放大画面"),
    page.getByRole("heading", { name: "先画一小段眼尾" }),
    page.getByRole("button", { name: "检查这一步" }),
  ]) {
    const box = await item.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  await page.screenshot({
    path: "test-results/v3-practice-390.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "查看整体画面", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "回到眼部放大", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "回到眼部放大", exact: true }).click();
  await expect(page.getByRole("button", { name: "检查这一步" })).toBeEnabled();
});

test("mobile startup exposes model failure and restores retry without enabling fake guidance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installCamera(page, { modelFailure: true });
  await page.goto("/#/eyeliner");
  await page.getByRole("button", { name: "开启摄像头", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("眼部模型加载失败");
  await expect(
    page.getByRole("button", { name: "重新开启摄像头" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "仅跟随指引练习" }),
  ).toBeDisabled();
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

test("display preferences keep the captured baseline and practice step", async ({
  page,
}) => {
  await installCamera(page);
  await begin(page);
  await page.getByRole("button", { name: "看效果", exact: true }).click();
  await page.getByRole("button", { name: "跟着画", exact: true }).click();
  await page.getByText("参考线显示设置", { exact: true }).click();
  await page.getByLabel("高对比度参考线").check();
  await page.getByLabel("参考线不透明度").fill("0.5");
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "检查这一步" })).toBeEnabled();
  await expect(page.getByLabel("眼部放大画面")).toHaveAttribute(
    "data-opacity",
    "0.5",
  );
  await expect(page.getByLabel("眼部放大画面")).toHaveAttribute(
    "data-step",
    "wing",
  );
});

test("320px, 200% zoom approximation and reduced motion keep core controls usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installCamera(page);
  await page.goto("/#/eyeliner");
  await expect(
    page.getByRole("button", { name: "开启摄像头", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const box = await page
    .getByRole("button", { name: "开启摄像头", exact: true })
    .boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.addStyleTag({ content: "body { zoom: 2 }" });
  await expect(
    page.getByRole("button", { name: "开启摄像头", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "开启摄像头", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector(".eye-art")!).animationDuration,
    ),
  ).toMatch(/^(0\.01ms|1e-05s)$/);
});
