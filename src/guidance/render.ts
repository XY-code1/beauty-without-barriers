import type { Point, Step } from "../types";
import type { referencePath } from "./geometry";

export type GuideMode = "guide" | "preview";
type Path = ReturnType<typeof referencePath>;

export function drawGuide(
  ctx: CanvasRenderingContext2D,
  path: Path,
  project: (p: Point) => Point,
  step: Step,
  mode: GuideMode,
  labels: boolean,
) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  function trace(points: Point[], close = false) {
    ctx.beginPath();
    points.forEach((point, i) => {
      const p = project(point);
      if (!i) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    if (close) ctx.closePath();
  }
  if (mode === "preview") {
    trace(path.outline, true);
    ctx.fillStyle = "rgba(46, 31, 26, .62)";
    ctx.fill();
    ctx.restore();
    return;
  }
  const full = step === "setup" || step === "done";
  for (const [outline, active] of [
    [path.lidOutline, full || step === "connect"],
    [path.wingOutline, full || step === "wing"],
  ] as const) {
    trace(outline, true);
    ctx.fillStyle = active
      ? "rgba(198, 246, 149, .32)"
      : "rgba(246, 245, 232, .12)";
    ctx.fill();
    ctx.strokeStyle = active ? "#d5ffa8" : "rgba(255, 255, 240, .55)";
    ctx.lineWidth = active ? 1.5 : 1;
    ctx.setLineDash(active ? [] : [3, 4]);
    ctx.shadowColor = "#21341c";
    ctx.shadowBlur = 2;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  if (step === "done") {
    ctx.restore();
    return;
  }
  const stroke = step === "connect" ? path.lid : path.wing;
  const start = project(stroke[0]),
    end = project(stroke.at(-1)!);
  for (const [point, text] of [
    [start, "起"],
    [end, "收"],
  ] as const) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, labels ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "#efffda";
    ctx.fill();
    ctx.strokeStyle = "#405e32";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (labels) {
      ctx.font = "600 11px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#34482b";
      ctx.fillRect(point.x - 10, point.y + 11, 20, 20);
      ctx.fillStyle = "#f1ffdf";
      ctx.fillText(text, point.x, point.y + 21);
    }
  }
  // A short arrow follows the middle of the active stroke, offset off the makeup.
  const i = Math.max(1, Math.floor(stroke.length * 0.65));
  const a = project(stroke[i - 1]),
    b = project(stroke[Math.min(i, stroke.length - 1)]);
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy);
  if (length > 0) {
    const ux = dx / length,
      uy = dy / length;
    const middle = project(stroke[Math.floor((stroke.length - 1) / 2)]);
    if (stroke.length === 2) {
      middle.x = (start.x + end.x) / 2;
      middle.y = (start.y + end.y) / 2;
    }
    const offset = labels ? 19 : 12,
      size = labels ? 12 : 7;
    const tip = {
      x: middle.x + (ux * size) / 2,
      y: middle.y - offset + (uy * size) / 2,
    };
    ctx.strokeStyle = "#efffda";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#243e1b";
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(tip.x - ux * size, tip.y - uy * size);
    ctx.lineTo(tip.x, tip.y);
    ctx.moveTo(tip.x - ux * 5 - uy * 3, tip.y - uy * 5 + ux * 3);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(tip.x - ux * 5 + uy * 3, tip.y - uy * 5 - ux * 3);
    ctx.stroke();
  }
  ctx.restore();
}
