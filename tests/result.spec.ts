import { expect, test } from "@playwright/test";
import {
  begin,
  check,
  installCamera,
  setCamera,
  waitForCameraReady,
} from "./harness";

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

for (const side of ["left", "right"] as const) {
  for (const mirror of [true, false]) {
    test(`detected line stays on the photographed wing for ${side}, mirror=${mirror}`, async ({
      page,
    }) => {
      await installCamera(page);
      await page.goto("/#/eyeliner");
      await page
        .getByRole("button", {
          name: side === "left" ? "左眼" : "右眼",
          exact: true,
        })
        .click();
      if (!mirror) await page.getByRole("button", { name: "镜像已开" }).click();
      await page
        .getByRole("button", { name: "开启摄像头", exact: true })
        .click();
      await waitForCameraReady(page);
      await page.getByRole("button", { name: "确认形状，拍画前照片" }).click();
      await page.getByRole("dialog").getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "拍画前照片", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "先画一小段眼尾" }),
      ).toBeVisible();
      await setCamera(page, { mark: "high" });
      await check(page);
      await expect(
        page.getByText("眼尾明显偏高", { exact: true }),
      ).toBeVisible();
      const bounds = await page
        .getByLabel("本次检查照片")
        .evaluate((canvas: HTMLCanvasElement) => {
          const pixels = canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          const xs: number[] = [],
            ys: number[] = [];
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 210 && pixels[i + 1] > 170 && pixels[i + 2] < 140) {
              xs.push((i / 4) % canvas.width);
              ys.push(Math.floor(i / 4 / canvas.width));
            }
          }
          return {
            n: xs.length,
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
          };
        });
      // Known fixture: raw wing from eye-local (0,0) to (.36,.302),
      // canonical photo is 684x468 with outer corner at (378,270).
      expect(bounds.n).toBeGreaterThan(100);
      const flipped = side === "left" ? mirror : !mirror;
      expect(bounds.minX).toBeGreaterThan((flipped ? 176 : 378) - 8);
      expect(bounds.minX).toBeLessThan((flipped ? 176 : 378) + 8);
      expect(bounds.maxX).toBeGreaterThan((flipped ? 306 : 508) - 8);
      expect(bounds.maxX).toBeLessThan((flipped ? 306 : 508) + 8);
      expect(bounds.minY).toBeGreaterThan(150);
      expect(bounds.minY).toBeLessThan(175);
      expect(bounds.maxY).toBeGreaterThan(260);
      expect(bounds.maxY).toBeLessThan(280);
    });
  }
}
