import { expect, test } from "@playwright/test";
import { installCamera } from "./harness";

test("enter the available eyeliner practice from the makeup workspace", async ({
  page,
}) => {
  await installCamera(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "今天，从哪一步开始？" }),
  ).toBeVisible();
  await expect(page.getByText("尚未开放", { exact: true })).toHaveCount(4);
  await page.getByRole("link", { name: "开始眼线练习" }).click();
  await expect(page).toHaveURL(/#\/eyeliner$/);
  await expect(
    page.getByRole("button", { name: "开启摄像头", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("摄像头尚未开启", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "返回妆容工作台" }).click();
  await expect(
    page.getByRole("heading", { name: "今天，从哪一步开始？" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "开启摄像头", exact: true }),
  ).toBeVisible();
});

test("leaving an active practice can be cancelled, then releases the camera on confirmation", async ({
  page,
}) => {
  await installCamera(page);
  await page.goto("/#/eyeliner");
  await page.getByRole("button", { name: "开启摄像头", exact: true }).click();
  await expect(page.getByText("眼部已定位", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "返回妆容工作台" }).click();
  await expect(page).toHaveURL(/#\/eyeliner$/);
  await expect(page.getByText("眼部已定位", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "返回妆容工作台" }).click();
  await expect(
    page.getByRole("heading", { name: "今天，从哪一步开始？" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __cameraTest: { streams: MediaStream[] } }
        ).__cameraTest.streams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    )
    .toBe(true);
  await page.getByRole("link", { name: "开始眼线练习" }).click();
  await expect(page.getByText("摄像头尚未开启", { exact: true })).toBeVisible();
});

test("completing a practice releases capture and a deep link cannot bypass preparation", async ({
  page,
}) => {
  const { begin, check } = await import("./harness");
  await installCamera(page);
  await page.goto("/#/eyeliner/check");
  await expect(
    page.getByRole("heading", { name: "选择你的自然眼线" }),
  ).toBeVisible();
  await begin(page);
  await check(page);
  await page.getByRole("button", { name: "我已自行确认，继续下一步" }).click();
  await check(page);
  await page.getByRole("button", { name: "我已自行确认，完成练习" }).click();
  await expect(
    page.getByRole("heading", { name: "这一侧，练习完成。" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __cameraTest: { streams: MediaStream[] } }
        ).__cameraTest.streams.every((s) =>
          s.getTracks().every((t) => t.readyState === "ended"),
        ),
      ),
    )
    .toBe(true);
});

test("three cancelled captures leave no live camera or stale result on reentry", async ({
  page,
}) => {
  await installCamera(page);
  await page.goto("/");
  for (let round = 0; round < 3; round++) {
    await page.getByRole("link", { name: "开始眼线练习" }).click();
    await page.getByRole("button", { name: "开启摄像头", exact: true }).click();
    await page.getByRole("button", { name: "确认形状，拍画前照片" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "拍画前照片", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "今天，从哪一步开始？" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as { __cameraTest: { streams: MediaStream[] } }
          ).__cameraTest.streams.every((s) =>
            s.getTracks().every((t) => t.readyState === "ended"),
          ),
        ),
      )
      .toBe(true);
  }
  await page.getByRole("link", { name: "开始眼线练习" }).click();
  await expect(
    page.getByRole("heading", { name: "选择你的自然眼线" }),
  ).toBeVisible();
  await expect(page.getByText("摄像头尚未开启", { exact: true })).toBeVisible();
});
