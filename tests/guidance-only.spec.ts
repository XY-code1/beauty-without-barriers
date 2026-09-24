import { expect, test } from "@playwright/test";
import { installCamera, setCamera, waitForCameraReady } from "./harness";

test("rejected photo does not trap a user who chooses guidance without analysis", async ({
  page,
}) => {
  await installCamera(page);
  await page.goto("/#/eyeliner");
  await expect(
    page.getByRole("button", { name: "仅跟随指引练习", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "开启摄像头", exact: true }).click();
  await waitForCameraReady(page);
  await setCamera(page, { mark: "blur" });
  await page.getByRole("button", { name: "确认形状，拍画前照片" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "拍画前照片", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "仅跟随指引练习", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeVisible();
  await expect(
    page.getByText("仅指引模式 · 不拍照、不自动判断画得是否正确", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "检查这一步" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "我已练习，继续下一步" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "继续练习", exact: true }).click();
  await page.getByRole("button", { name: "我已练习，继续下一步" }).click();
  await expect(
    page.getByRole("heading", { name: "轻轻连接眼睑外段" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我已练习，完成指引" }).click();
  await expect(
    page.getByText("本次仅完成指引，未进行自动方向检查。", {
      exact: false,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.srcObject === null),
    )
    .toBe(true);
  await page.getByRole("button", { name: "再练一次" }).click();
  await expect(
    page.getByRole("button", { name: "确认形状，拍画前照片" }),
  ).toBeVisible();
});
