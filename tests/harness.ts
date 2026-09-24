import { expect, type Page } from "@playwright/test";
export async function installCamera(
  page: Page,
  options: {
    realModel?: boolean;
    denied?: boolean;
    modelFailure?: boolean;
  } = {},
) {
  await page.addInitScript(
    ({ denied }) => {
      const state = {
        face: true,
        mark: "none",
        draws: 0,
        captures: 0,
        streams: [] as MediaStream[],
      };
      Object.assign(window, { __cameraTest: state });
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => {
          if (denied)
            throw new DOMException("Denied by test", "NotAllowedError");
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext("2d")!;
          const draw = () => {
            const mark =
              state.mark === "mixed"
                ? state.draws % 2
                  ? "high"
                  : "blur"
                : state.mark;
            const data = ctx.createImageData(640, 480);
            for (let y = 0; y < 480; y++)
              for (let x = 0; x < 640; x++) {
                let value = 195 + ((x * 7 + y * 13) % 13) - 6;
                for (const [outer, sign] of [
                  [160, -1],
                  [480, 1],
                ]) {
                  const lx = ((x - outer) / 120) * sign,
                    ly = (220 - y) / 120;
                  if (
                    lx >= -1 &&
                    lx <= 0 &&
                    Math.abs(ly - 0.12 * Math.sin(-lx * Math.PI)) < 0.022
                  )
                    value = 65;
                  const angle = mark === "high" ? 40 : mark === "low" ? 0 : 20;
                  if (
                    ["close", "high", "low"].includes(mark) &&
                    lx >= 0 &&
                    lx <= 0.36 &&
                    Math.abs(ly - lx * Math.tan((angle * Math.PI) / 180)) < 0.02
                  )
                    value = 45;
                  if (
                    mark === "occlusion" &&
                    lx > -0.4 &&
                    lx < 0.6 &&
                    ly > -0.2 &&
                    ly < 0.5
                  )
                    value = 105;
                }
                if (mark === "blur") value = 195;
                const i = (y * 640 + x) * 4;
                data.data[i] = data.data[i + 1] = data.data[i + 2] = value;
                data.data[i + 3] = 255;
              }
            ctx.putImageData(data, 0, 0);
            state.draws++;
          };
          draw();
          const timer = setInterval(draw, 70);
          const stream = canvas.captureStream(15);
          state.streams.push(stream);
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => {
              clearInterval(timer);
              stop();
            };
          }
          return stream;
        },
      });
    },
    { denied: options.denied ?? false },
  );
  if (!options.realModel)
    await page.route("**/src/vision/detector.ts*", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
    export function preloadDetector() { void createDetector().catch(() => {}); }
    export async function createDetector() {
      ${options.modelFailure ? "throw new Error('test model failure');" : ""}
      return { close() {}, detectForVideo(source) {
        if (source instanceof HTMLCanvasElement) window.__cameraTest.captures++;
        if (!window.__cameraTest.face) return { faceLandmarks: [] };
        const p = Array.from({length:478}, () => ({x:.5,y:.5,z:0}));
        const set = (id,x,y) => p[id] = {x:x/640,y:y/480,z:0};
        [133,173,157,158,159,160,161,246,33].forEach((id,i)=>set(id,280-i*15,220-Math.sin(i/8*Math.PI)*15));
        [362,398,384,385,386,387,388,466,263].forEach((id,i)=>set(id,360+i*15,220-Math.sin(i/8*Math.PI)*15));
        set(145,220,235);set(374,420,235);
        return { faceLandmarks:[p] };
      }};
    }
  `,
      }),
    );
}
export async function setCamera(
  page: Page,
  update: { face?: boolean; mark?: string },
) {
  await page.evaluate(
    (update) =>
      Object.assign(
        (window as unknown as { __cameraTest: object }).__cameraTest,
        update,
      ),
    update,
  );
  // Wait for a new source frame, rather than assuming the DOM update refreshed video.
  const before = await page.evaluate(
    () =>
      (window as unknown as { __cameraTest: { draws: number } }).__cameraTest
        .draws,
  );
  await page.waitForFunction(
    (n) =>
      (window as unknown as { __cameraTest: { draws: number } }).__cameraTest
        .draws >
      n + 2,
    before,
  );
}
export async function begin(
  page: Page,
  { waitForPractice = true }: { waitForPractice?: boolean } = {},
) {
  await page.goto("/#/eyeliner");
  await page.getByRole("button", { name: "开启摄像头" }).click();
  await waitForCameraReady(page);
  await page.getByRole("button", { name: "确认形状，拍画前照片" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "拍画前照片", exact: true }).click();
  if (waitForPractice)
    await page.getByRole("heading", { name: "先画一小段眼尾" }).waitFor();
}
export async function waitForCameraReady(page: Page) {
  await expect(page.getByText("眼部已定位", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认形状，拍画前照片" }),
  ).toBeEnabled();
}
export async function check(page: Page) {
  await page.getByRole("button", { name: /^(检查这一步|重新检查)/ }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "拍摄并检查" }).click();
}
