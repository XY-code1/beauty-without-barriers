import { expect, test } from "@playwright/test";
import { installCamera, setCamera } from "./harness";

test("keyboard can cancel capture, recover focus and complete both steps", async ({
  page,
}) => {
  await installCamera(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel() {}, speak() {} },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        constructor(public text: string) {}
      },
    });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "开始眼线练习" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "从一条眼线，开始。" }),
  ).toBeFocused();
  const press = async (name: string) => {
    await page.getByRole("button", { name, exact: true }).focus();
    await page.keyboard.press("Enter");
  };
  await press("开启语音指引");
  await expect(
    page.getByRole("button", { name: "关闭语音指引", exact: true }),
  ).toBeFocused();
  await press("关闭语音指引");
  await press("开启摄像头");
  await expect(
    page.getByRole("button", { name: "确认形状，拍画前照片" }),
  ).toBeEnabled();
  await press("确认形状，拍画前照片");
  await expect(page.getByRole("dialog").getByRole("checkbox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "确认形状，拍画前照片" }),
  ).toBeFocused();
  await press("确认形状，拍画前照片");
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "先画一小段眼尾" }),
  ).toBeFocused();
  await setCamera(page, { mark: "close" });
  for (const next of [
    "我已看过结果，继续下一步 →",
    "我已看过结果，完成练习 ✓",
  ]) {
    await press("检查这一步");
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "看看这次的结果" }),
    ).toBeFocused();
    await press(next);
  }
  await expect(
    page.getByRole("heading", { name: "这一侧，练习完成。" }),
  ).toBeFocused();
});
