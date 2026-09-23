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
});
