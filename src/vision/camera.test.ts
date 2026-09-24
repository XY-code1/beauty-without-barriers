import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createDetector } = vi.hoisted(() => ({ createDetector: vi.fn() }));
vi.mock("./detector", () => ({ createDetector }));

import { Camera, withTimeout } from "./camera";

function stream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return {
    value: {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream,
    track,
  };
}

function video() {
  return {
    paused: true,
    play: vi.fn().mockResolvedValue(undefined),
    srcObject: null,
    readyState: 0,
  } as unknown as HTMLVideoElement;
}

describe("camera startup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createDetector.mockReset();
    createDetector.mockResolvedValue({
      detectForVideo: vi.fn(),
      close: vi.fn(),
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { isSecureContext: true },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      value: vi.fn(() => 1),
    });
    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      configurable: true,
      value: vi.fn(),
    });
  });
  afterEach(() => vi.useRealTimers());

  function setGetUserMedia(mock: ReturnType<typeof vi.fn>) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { mediaDevices: { getUserMedia: mock } },
    });
  }

  it("stops a stream when permission arrives after the UI timeout", async () => {
    let resolve!: (value: MediaStream) => void;
    setGetUserMedia(vi.fn(() => new Promise((done) => (resolve = done))));
    const late = stream();
    const start = new Camera(video(), vi.fn(), vi.fn()).start();
    const rejected = expect(start).rejects.toThrow("摄像头启动超时");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    resolve(late.value);
    await Promise.resolve();
    expect(late.track.stop).toHaveBeenCalledOnce();
  });

  for (const [name, message] of [
    ["NotAllowedError", "权限被拒绝"],
    ["NotFoundError", "没有找到摄像头"],
    ["NotReadableError", "摄像头被占用"],
  ]) {
    it(`classifies ${name}`, async () => {
      setGetUserMedia(vi.fn().mockRejectedValue(new DOMException("", name)));
      await expect(
        new Camera(video(), vi.fn(), vi.fn()).start(),
      ).rejects.toThrow(message);
    });
  }

  it("retries lower constraints only for OverconstrainedError", async () => {
    const fallback = stream();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("", "OverconstrainedError"))
      .mockResolvedValueOnce(fallback.value);
    setGetUserMedia(getUserMedia);
    const camera = new Camera(video(), vi.fn(), vi.fn());
    await camera.start();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0].video.width).toEqual({ ideal: 640 });
    camera.stop();
  });

  it("stops tracks when model initialization fails", async () => {
    const active = stream();
    setGetUserMedia(vi.fn().mockResolvedValue(active.value));
    createDetector.mockRejectedValueOnce(new Error("wasm 404"));
    await expect(new Camera(video(), vi.fn(), vi.fn()).start()).rejects.toThrow(
      "模型加载失败",
    );
    expect(active.track.stop).toHaveBeenCalledOnce();
  });

  it("deduplicates concurrent starts and releases tracks on stop", async () => {
    const active = stream();
    const getUserMedia = vi.fn().mockResolvedValue(active.value);
    setGetUserMedia(getUserMedia);
    const camera = new Camera(video(), vi.fn(), vi.fn());
    await Promise.all([camera.start(), camera.start()]);
    expect(getUserMedia).toHaveBeenCalledOnce();
    camera.stop();
    expect(active.track.stop).toHaveBeenCalledOnce();
  });
});

it("withTimeout ignores a late model result without replacing the caller", async () => {
  vi.useFakeTimers();
  let resolve!: (value: string) => void;
  const late = vi.fn();
  const result = withTimeout(
    new Promise<string>((done) => (resolve = done)),
    20_000,
    "timeout",
    late,
  );
  const rejected = expect(result).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(20_000);
  await rejected;
  resolve("detector");
  await Promise.resolve();
  expect(late).toHaveBeenCalledWith("detector");
  vi.useRealTimers();
});
