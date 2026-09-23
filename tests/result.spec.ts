import { expect, test } from "@playwright/test";
import { begin, check, installCamera, setCamera } from "./harness";

test("result shows this capture and evidence, never a previous photo after failed capture", async ({
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
  await expect(page.getByLabel("本次检查照片")).toBeVisible();
  await expect(page.getByText("实线：检测候选", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "画前照片", exact: true }).click();
  await expect(page.getByLabel("画前照片对照")).toBeVisible();
  await expect(
    page.getByText("实线：检测候选", { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "本次照片", exact: true }).click();
  await setCamera(page, { mark: "blur" });
  await check(page);
  await expect(page.getByText("这次无法判断", { exact: true })).toBeVisible();
  await expect(
    page.getByText("这次未取得可用照片，请重拍。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("本次检查照片")).toHaveCount(0);
  await expect(page.getByText("实线：检测候选", { exact: true })).toHaveCount(
    0,
  );
});
