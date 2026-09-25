import { expect, it, vi } from "vitest";

const { initialize } = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
  FaceLandmarker: { createFromOptions: initialize },
}));

import { createDetector, discardDetector } from "./detector";

it("retries after a timed-out detector attempt and closes its late result", async () => {
  let resolveFirst!: (value: unknown) => void;
  let resolveSecond!: (value: unknown) => void;
  initialize
    .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (resolveSecond = resolve)));

  const first = createDetector();
  discardDetector(first);
  const second = createDetector();
  expect(second).not.toBe(first);
  expect(createDetector()).toBe(second);

  const late = { detectForVideo: vi.fn(), close: vi.fn() };
  resolveFirst(late);
  await first;
  expect(late.close).toHaveBeenCalledOnce();

  const current = { detectForVideo: vi.fn(), close: vi.fn() };
  resolveSecond(current);
  await expect(second).resolves.toBe(current);
  expect(createDetector()).toBe(second);
});
