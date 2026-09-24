import { createDetector, type FaceDetector } from "./detector";
import {
  eyeFromLandmarks,
  fromLocal,
  geometryIssue,
} from "../guidance/geometry";
import type { Frame, Side, Target, VisionOutput } from "../types";

export function captureRaw(video: HTMLVideoElement): ImageData {
  if (video.readyState < 2 || !video.videoWidth)
    throw new Error("还没有可采集的画面，请稍后重试。");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("当前浏览器无法采集图像。");
  // Always read the video element. The displayed guide is a separate canvas.
  context.drawImage(video, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export class Camera {
  private detector: FaceDetector | null = null;
  private stream: MediaStream | null = null;
  private closed = false;
  private raf = 0;
  private lastTime = -1;
  private lastInference = 0;
  private timestamp = 0;
  private stale = false;
  private startPromise: Promise<void> | null = null;
  paused = false;
  side: Side = "right";
  constructor(
    private video: HTMLVideoElement,
    private onFrame: (frame: VisionOutput) => void,
    private onError: (message: string) => void,
    private onStage: (stage: CameraStartupStage) => void = () => undefined,
  ) {}
  start(): Promise<void> {
    if (!this.startPromise) this.startPromise = this.startInternal();
    return this.startPromise;
  }
  private async startInternal() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "摄像头需要 HTTPS 或本机 localhost，请使用安全地址打开。",
      );
    }
    try {
      this.onStage("requesting-permission");
      const stream = await this.openStream();
      if (this.closed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.onStage("opening-camera");
      stream.getVideoTracks().forEach((track) =>
        track.addEventListener("ended", () => {
          if (!this.closed) {
            this.stop();
            this.onError("摄像头连接已中断，请重新开启。");
          }
        }),
      );
      this.video.srcObject = stream;
      this.video.autoplay = true;
      this.video.muted = true;
      this.video.playsInline = true;
      if (this.video.paused) {
        try {
          await this.video.play();
        } catch {
          throw new Error(
            "摄像头已打开，但浏览器无法播放画面。请重新打开页面，或改用 Safari/Chrome 后重试。",
          );
        }
      }
      this.onStage("loading-model");
      let detector: FaceDetector;
      try {
        detector = await withTimeout(
          createDetector(),
          20_000,
          "眼部模型加载超时，请检查网络后重新加载模型。",
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes("超时"))
          throw error;
        throw new Error(
          "眼部模型加载失败，请检查网络或本地模型文件，然后重试。",
        );
      }
      if (this.closed) {
        return;
      }
      this.detector = detector;
      this.onStage("ready");
      this.loop();
    } catch (error) {
      this.stop();
      if (error instanceof DOMException && error.name === "NotAllowedError")
        throw new Error(
          "摄像头权限被拒绝。请在浏览器设置中允许摄像头，再重试。",
        );
      if (error instanceof DOMException && error.name === "NotFoundError")
        throw new Error("没有找到摄像头，请连接摄像头后重试。");
      if (error instanceof DOMException && error.name === "NotReadableError")
        throw new Error("摄像头被占用，请关闭其他正在使用它的应用后重试。");
      if (
        error instanceof DOMException &&
        error.name === "OverconstrainedError"
      )
        throw new Error(
          "当前设备不支持可用的摄像头画面设置，请更换浏览器后重试。",
        );
      if (error instanceof DOMException && error.name === "AbortError")
        throw new Error(
          "摄像头启动中断，请重新打开页面，或改用 Safari/Chrome 后重试。",
        );
      if (error instanceof DOMException && error.name === "NotSupportedError")
        throw new Error(
          "当前浏览器无法播放摄像头画面，请改用 Safari/Chrome 后重试。",
        );
      throw error;
    }
  }
  private async openStream(): Promise<MediaStream> {
    const choices: MediaTrackConstraints[] = [
      {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      {
        facingMode: { ideal: "user" },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      { facingMode: { ideal: "user" } },
    ];
    let lastError: unknown;
    for (const video of choices) {
      try {
        const pending = navigator.mediaDevices.getUserMedia({
          audio: false,
          video,
        });
        return await withTimeout(
          pending,
          10_000,
          "摄像头启动超时，请重新开启摄像头。",
          (late) => late.getTracks().forEach((track) => track.stop()),
        );
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof DOMException) ||
          error.name !== "OverconstrainedError"
        )
          throw error;
      }
    }
    throw lastError;
  }
  private now() {
    this.timestamp = Math.max(performance.now(), this.timestamp + 1);
    return this.timestamp;
  }
  private loop = () => {
    if (this.closed) return;
    try {
      if (
        !this.paused &&
        this.video.readyState >= 2 &&
        this.detector &&
        this.video.currentTime !== this.lastTime &&
        performance.now() - this.lastInference >= 65
      ) {
        this.lastTime = this.video.currentTime;
        this.lastInference = performance.now();
        this.stale = false;
        const timestamp = this.now();
        const face = this.detector.detectForVideo(this.video, timestamp)
          .faceLandmarks[0];
        const width = this.video.videoWidth,
          height = this.video.videoHeight;
        const eye = face
          ? eyeFromLandmarks(face, this.side, width, height)
          : null;
        this.onFrame({
          status: eye ? "detected" : "lost",
          eye,
          width,
          height,
          timestamp,
        });
      }
      if (
        !this.paused &&
        !this.stale &&
        this.lastTime >= 0 &&
        performance.now() - this.lastInference > 700
      ) {
        this.stale = true;
        this.onFrame({
          status: "lost",
          eye: null,
          width: this.video.videoWidth,
          height: this.video.videoHeight,
          timestamp: this.now(),
        });
      }
    } catch {
      this.stop();
      this.onError("眼部定位中断，请重新开启摄像头。");
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
  };
  capture(target: Target, revision: number): Frame {
    if (this.closed || !this.detector || this.paused)
      throw new Error("请先开启摄像头并恢复练习。");
    if (performance.now() - this.lastInference > 900)
      throw new Error("摄像头画面已停滞，请重新开启摄像头后重拍。");
    const pixels = captureRaw(this.video);
    const canvas = document.createElement("canvas");
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas.getContext("2d")!.putImageData(pixels, 0, 0);
    const timestamp = this.now();
    // Locate landmarks on this frozen raw frame, not the previous preview frame.
    const face = this.detector.detectForVideo(canvas, timestamp)
      .faceLandmarks[0];
    const eye = face
      ? eyeFromLandmarks(face, target.side, pixels.width, pixels.height)
      : null;
    if (!eye)
      throw new Error("没有找到可用眼部画面。请移开手、正视镜头后重拍。");
    const issue = geometryIssue(eye, pixels.width, pixels.height);
    if (issue) throw new Error(issue);
    // A cheap independent sharpness check also works when OpenCV cannot load.
    let sum = 0,
      square = 0,
      count = 0;
    const luminance = (x: number, y: number) => {
      const i = (y * pixels.width + x) * 4;
      return (
        0.299 * pixels.data[i] +
        0.587 * pixels.data[i + 1] +
        0.114 * pixels.data[i + 2]
      );
    };
    for (let u = -0.9; u < -0.05; u += 0.025)
      for (let v = -0.2; v < 0.25; v += 0.025) {
        const point = fromLocal({ x: u, y: v }, eye),
          x = Math.round(point.x),
          y = Math.round(point.y);
        const value =
          luminance(x - 1, y) +
          luminance(x + 1, y) +
          luminance(x, y - 1) +
          luminance(x, y + 1) -
          4 * luminance(x, y);
        sum += value;
        square += value * value;
        count++;
      }
    const sharpness = square / count - (sum / count) ** 2;
    if (!Number.isFinite(sharpness) || sharpness < 20)
      throw new Error("画面模糊，请保持稳定后重拍。");
    return {
      pixels,
      eye,
      timestamp,
      target: { ...target },
      revision,
      sharpness,
    };
  }
  async captureBest(
    target: Target,
    revision: number,
    signal: AbortSignal,
  ): Promise<Frame> {
    const deadline = performance.now() + 1000;
    let sampled = 0,
      lastDecodedFrame = -1;
    let best: Frame | null = null;
    let reason = "没有新的可用画面，请保持稳定后重拍。";
    while (sampled < 5 && performance.now() < deadline) {
      signal.throwIfAborted();
      if (this.closed || this.paused)
        throw new Error("拍摄已停止，请重新开启摄像头。");
      // Playback time may advance while the same decoded image is displayed.
      // Without a decoded-frame counter, conservatively attempt only one image.
      const decodedFrame =
        this.video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
      if (decodedFrame !== lastDecodedFrame) {
        lastDecodedFrame = decodedFrame;
        sampled++;
        try {
          const frame = this.capture(target, revision);
          if (!best || frame.sharpness! > best.sharpness!) best = frame;
        } catch (error) {
          reason = error instanceof Error ? error.message : reason;
        }
      }
      if (sampled < 5)
        await waitForCapture(
          Math.min(30, Math.max(0, deadline - performance.now())),
          signal,
        );
    }
    signal.throwIfAborted();
    if (!best) throw new Error(reason);
    return best;
  }
  stop() {
    this.closed = true;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.detector = null;
    this.video.srcObject = null;
  }
}

export type CameraStartupStage =
  "requesting-permission" | "opening-camera" | "loading-model" | "ready";

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  onLate?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(message));
    }, ms);
    promise.then(
      (value) => {
        if (settled) return onLate?.(value);
        clearTimeout(timer);
        settled = true;
        resolve(value);
      },
      (error) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        reject(error);
      },
    );
  });
}

// Abort settles the promise as well as clearing the timer; cancelled captures retain no pending task.
export function waitForCapture(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
