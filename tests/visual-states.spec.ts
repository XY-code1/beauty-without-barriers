import { expect, test } from "@playwright/test";
import { begin, check, installCamera, setCamera } from "./harness";

for (const [width, height] of [
  [390, 844],
  [360, 800],
  [844, 390],
  [1440, 900],
]) {
  test(`all product states remain usable at ${width}x${height}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installCamera(page);
    const screenshot = async (name: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/v3-${width}-${name}.png`,
        fullPage: true,
      });
    };
    await page.goto("/");
    await screenshot("home");
    await page.getByRole("link", { name: "开始眼线练习" }).click();
    await screenshot("setup");
    await begin(page);
    await expect(
      page.getByRole("heading", { name: "先画一小段眼尾" }),
    ).toBeVisible();
    if (height > width && width < 500) {
      for (const item of [
        page.getByLabel("眼部放大画面"),
        page.getByRole("button", { name: "检查这一步" }),
        page.getByText("从“起”向“收”轻画短线", { exact: false }),
      ]) {
        const box = await item.boundingBox();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      }
    }
    await screenshot("practice");
    await page.addStyleTag({ content: "body {zoom: 2}" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "检查这一步" })
      .scrollIntoViewIfNeeded();
    await page.addStyleTag({ content: "body {zoom: 1}" });
    await setCamera(page, { mark: "high" });
    await check(page);
    await expect(page.getByText("眼尾明显偏高", { exact: true })).toBeVisible();
    await screenshot("result");
    await setCamera(page, { mark: "blur" });
    await check(page);
    await expect(page.getByText("这次无法判断", { exact: true })).toBeVisible();
    await screenshot("failure");
    await page
      .getByRole("button", { name: "我已自行确认，继续下一步" })
      .click();
    await setCamera(page, { mark: "close" });
    await check(page);
    await expect(
      page.getByText("眼尾方向接近参考", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "我已看过结果，完成练习" }).click();
    await screenshot("done");
    await page.addStyleTag({
      content:
        "html {font-size:200%} body, button, p, label, summary {font-size: 1.2rem !important}",
    });
    await screenshot("large-text");
    await expect(page.getByRole("button", { name: "再练一次" })).toBeVisible();
  });
}
