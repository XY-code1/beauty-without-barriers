import { useEffect, useRef, type RefObject } from "react";
import {
  eyeCrop,
  fromLocal,
  projectToDisplay,
  referencePath,
} from "./geometry";
import { drawGuide, type GuideMode } from "./render";
import type { Eye, Point, Step, Target, VisionOutput } from "../types";

// This labelled diagram is only an illustration, never a detection or check input.
function illustrationEye(side: Target["side"]): Eye {
  const eye: Eye = {
    inner: { x: 120, y: 100 },
    outer: { x: 240, y: 100 },
    outward: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    width: 120,
    upper: [],
    openness: 0.25,
    poseRatio: 1,
  };
  if (side === "right") {
    eye.inner.x = 240;
    eye.outer.x = 120;
    eye.outward.x = -1;
  }
  eye.upper = Array.from({ length: 9 }, (_, i) =>
    fromLocal({ x: -1 + i / 8, y: 0.2 * Math.sin((i / 8) * Math.PI) }, eye),
  );
  return eye;
}

export default function GuideCanvas({
  video,
  vision,
  target,
  step,
  mode,
  mirror,
  showGuide,
  detail = false,
  illustrate = false,
}: {
  video: RefObject<HTMLVideoElement | null>;
  vision: VisionOutput | null;
  target: Target;
  step: Step;
  mode: GuideMode;
  mirror: boolean;
  showGuide: boolean;
  detail?: boolean;
  illustrate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const clear = () =>
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(devicePixelRatio || 1, 3);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      const eye = illustrate ? illustrationEye(target.side) : vision?.eye;
      if (!eye) return;
      const frame = illustrate
        ? { x: 360, y: 220 }
        : { x: vision!.width, y: vision!.height };
      const crop = detail
        ? eyeCrop(eye, frame)
        : { x: 0, y: 0, width: frame.x, height: frame.y };
      const project = (point: Point) =>
        projectToDisplay(
          { x: point.x - crop.x, y: point.y - crop.y },
          { x: crop.width, y: crop.height },
          { x: width, y: height },
          mirror,
        );
      if (detail && !illustrate) {
        if (!video.current || video.current.readyState < 2) return;
        const scale = Math.min(width / crop.width, height / crop.height);
        ctx.save();
        if (mirror) {
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(
          video.current,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          (width - crop.width * scale) / 2,
          (height - crop.height * scale) / 2,
          crop.width * scale,
          crop.height * scale,
        );
        ctx.restore();
      }
      if (illustrate) {
        ctx.fillStyle = "#ded5c5";
        ctx.fillRect(0, 0, width, height);
        ctx.beginPath();
        eye.upper.forEach((p, i) => {
          const q = project(p);
          if (!i) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        });
        for (let i = 8; i >= 0; i--) {
          const p = project(
            fromLocal(
              { x: -1 + i / 8, y: -0.15 * Math.sin((i / 8) * Math.PI) },
              eye,
            ),
          );
          ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fillStyle = "#f7f3eb";
        ctx.fill();
        ctx.strokeStyle = "#817260";
        ctx.lineWidth = 1.3;
        ctx.stroke();
        const iris = project(fromLocal({ x: -0.5, y: 0.015 }, eye));
        const radius =
          Math.hypot(
            project(eye.inner).x - project(eye.outer).x,
            project(eye.inner).y - project(eye.outer).y,
          ) * 0.15;
        ctx.beginPath();
        ctx.arc(iris.x, iris.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#8c8775";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(iris.x, iris.y, radius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = "#484d40";
        ctx.fill();
      }
      if (showGuide)
        drawGuide(ctx, referencePath(eye, target), project, step, mode, detail);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    const timer =
      !illustrate && vision?.eye ? setTimeout(clear, 700) : undefined;
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      clear();
    };
  }, [
    video,
    vision,
    target,
    step,
    mode,
    mirror,
    showGuide,
    detail,
    illustrate,
  ]);
  return (
    <canvas
      ref={ref}
      className={detail ? "detail-canvas" : "guide-overlay"}
      aria-label={detail ? "眼部放大画面" : "眼线参考路径"}
      data-visible={(vision?.eye || illustrate) && showGuide ? "true" : "false"}
      data-mode={mode}
      data-step={step}
      data-source={illustrate ? "illustration" : vision?.eye ? "live" : "none"}
    />
  );
}
