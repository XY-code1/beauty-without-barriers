import type { Mat } from "@techstark/opencv-js";
import type { Evaluation, Frame } from "../types";
import { angleVerdict, geometryIssue } from "../guidance/geometry";
import type { OpenCV } from "./opencv";

// Experimental, versioned together with the test fixtures. These are not beauty standards.
export const ALGORITHM_VERSION = "wing-difference-v1";
export const ROI = {
  scale: 120,
  xMin: -1.05,
  yMax: 0.75,
  width: 228,
  height: 156,
};
const unknown = (reason: string, started: number): Evaluation => ({
  verdict: "unknown",
  message: "这次无法判断",
  reason,
  durationMs: performance.now() - started,
});

function canonical(cv: OpenCV, frame: Frame, own: (mat: Mat) => Mat): Mat {
  const e = frame.eye,
    k = ROI.scale / e.width;
  const m = own(
    cv.matFromArray(2, 3, cv.CV_64F, [
      k * e.outward.x,
      k * e.outward.y,
      -k * (e.outer.x * e.outward.x + e.outer.y * e.outward.y) -
        ROI.xMin * ROI.scale,
      -k * e.up.x,
      -k * e.up.y,
      k * (e.outer.x * e.up.x + e.outer.y * e.up.y) + ROI.yMax * ROI.scale,
    ]),
  );
  const source = own(cv.matFromImageData(frame.pixels)),
    aligned = own(new cv.Mat()),
    gray = own(new cv.Mat());
  cv.warpAffine(
    source,
    aligned,
    m,
    new cv.Size(ROI.width, ROI.height),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
  );
  cv.cvtColor(aligned, gray, cv.COLOR_RGBA2GRAY);
  return gray;
}

function focus(cv: OpenCV, gray: Mat, own: (mat: Mat) => Mat) {
  const lap = own(new cv.Mat());
  cv.Laplacian(gray, lap, cv.CV_64F);
  let sum = 0,
    sq = 0,
    n = 0;
  // Exclude the crop border and wing; use eyelid texture, not the virtual overlay.
  for (let y = 66; y < 114; y++)
    for (let x = 24; x < 126; x++) {
      const value = lap.data64F[y * ROI.width + x];
      sum += value;
      sq += value * value;
      n++;
    }
  return sq / n - (sum / n) ** 2;
}

export function baselineIssue(cv: OpenCV, frame: Frame): string | null {
  const issue = geometryIssue(
    frame.eye,
    frame.pixels.width,
    frame.pixels.height,
  );
  if (issue) return issue;
  const owned: Mat[] = [];
  const own = (m: Mat) => {
    owned.push(m);
    return m;
  };
  try {
    const gray = canonical(cv, frame, own);
    return focus(cv, gray, own) < 28
      ? "当前照片未通过眼部清晰度检查，暂不能用于自动对照。可尝试靠近镜头、增加正面光线后重拍，或选择“仅跟随指引练习”。"
      : null;
  } finally {
    owned.reverse().forEach((m) => m.delete());
  }
}

export function evaluateFrames(
  cv: OpenCV,
  before: Frame,
  after: Frame,
): Evaluation {
  const started = performance.now();
  if (
    before.revision !== after.revision ||
    JSON.stringify(before.target) !== JSON.stringify(after.target)
  ) {
    return unknown("目标已变化，请重新采集基准图。", started);
  }
  if (after.timestamp <= before.timestamp)
    return unknown("检查画面早于基准图，请重新采集。", started);
  for (const frame of [before, after]) {
    const issue = geometryIssue(
      frame.eye,
      frame.pixels.width,
      frame.pixels.height,
    );
    if (issue) return unknown(issue, started);
  }
  if (
    Math.abs(before.eye.openness - after.eye.openness) > 0.09 ||
    Math.abs(Math.log(before.eye.poseRatio / after.eye.poseRatio)) > 0.18 ||
    Math.abs(Math.log(before.eye.width / after.eye.width)) > 0.3
  ) {
    return unknown(
      "两次拍摄的眼睛开合或角度差异较大，请恢复采集基准图时的姿势。",
      started,
    );
  }
  const owned: Mat[] = [];
  const own = (m: Mat) => {
    owned.push(m);
    return m;
  };
  try {
    const base = canonical(cv, before, own),
      current = canonical(cv, after, own);
    if (focus(cv, base, own) < 28 || focus(cv, current, own) < 28) {
      return unknown("画面模糊，请移开手并保持稳定后重拍。", started);
    }
    // Landmark alignment plus a small translation search on untouched skin/inner lid.
    // A large residual rejects the image rather than mislabelling shadows as eyeliner.
    const controls: number[] = [];
    for (let y = 18; y < ROI.height - 12; y += 2)
      for (let x = 15; x < ROI.width - 12; x += 2) {
        const lx = x / ROI.scale + ROI.xMin,
          ly = ROI.yMax - y / ROI.scale;
        if (lx < -0.28 || ly < -0.25 || ly > 0.52)
          controls.push(y * ROI.width + x);
      }
    let best = { loss: Infinity, dx: 0, dy: 0, offset: 0 };
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const differences = controls.map(
          (i) => current.data[i + dy * ROI.width + dx] - base.data[i],
        );
        const sorted = [...differences].sort((a, b) => a - b),
          offset = sorted[Math.floor(sorted.length / 2)];
        const loss =
          differences.reduce(
            (n, d) => n + Math.min(Math.abs(d - offset), 60),
            0,
          ) / differences.length;
        if (loss < best.loss) best = { loss, dx, dy, offset };
      }
    if (best.loss > 11 || Math.abs(best.offset) > 30)
      return unknown(
        "光线、遮挡或位置变化过大，无法可靠对齐。请移开手并恢复原来的光线。",
        started,
      );
    const mask = own(cv.Mat.zeros(ROI.height, ROI.width, cv.CV_8UC1));
    let broadChanges = 0,
      controlChanges = 0;
    for (const i of controls)
      if (
        Math.abs(
          current.data[i + best.dy * ROI.width + best.dx] -
            best.offset -
            base.data[i],
        ) > 30
      )
        controlChanges++;
    if (controlChanges / controls.length > 0.09)
      return unknown("眼部附近变化过多，可能有遮挡或未对齐，请重拍。", started);
    for (let y = 5; y < ROI.height - 5; y++)
      for (let x = 5; x < ROI.width - 5; x++) {
        const i = y * ROI.width + x,
          now = current.data[i + best.dy * ROI.width + best.dx] - best.offset;
        if (base.data[i] - now > 28 && now < 150) {
          broadChanges++;
          const lx = x / ROI.scale + ROI.xMin,
            ly = ROI.yMax - y / ROI.scale;
          if (lx > -0.06 && lx < 0.76 && ly > -0.34 && ly < 0.62)
            mask.data[i] = 255;
        }
      }
    if (broadChanges > ROI.width * ROI.height * 0.07)
      return unknown("新增深色区域过大，无法区分眼线、阴影与遮挡。", started);
    const closed = own(new cv.Mat()),
      kernel = own(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.morphologyEx(mask, closed, cv.MORPH_CLOSE, kernel);
    const labels = own(new cv.Mat()),
      stats = own(new cv.Mat()),
      centers = own(new cv.Mat());
    const count = cv.connectedComponentsWithStats(
      closed,
      labels,
      stats,
      centers,
      8,
      cv.CV_32S,
    );
    const candidates: { points: number[]; area: number }[] = [];
    for (let label = 1; label < count; label++) {
      const area = stats.intAt(label, cv.CC_STAT_AREA);
      if (area < 18) continue;
      const points: number[] = [];
      let nearest = Infinity,
        furthest = 0;
      for (let i = 0; i < labels.data32S.length; i++)
        if (labels.data32S[i] === label) {
          const x = (i % ROI.width) / ROI.scale + ROI.xMin,
            y = ROI.yMax - Math.floor(i / ROI.width) / ROI.scale;
          nearest = Math.min(nearest, Math.hypot(x, y));
          furthest = Math.max(furthest, x);
          points.push(x, y);
        }
      if (nearest < 0.11 && furthest > 0.14) candidates.push({ points, area });
    }
    if (candidates.length !== 1)
      return unknown(
        candidates.length
          ? "出现多个可能的眼线区域，暂时无法确定方向。"
          : "没有找到可靠的新增眼尾。可能尚未画出，或颜色、长度不足以识别。",
        started,
      );
    const candidate = candidates[0],
      points = candidate.points;
    const mat = own(cv.matFromArray(points.length / 2, 1, cv.CV_32FC2, points)),
      line = own(new cv.Mat());
    cv.fitLine(mat, line, cv.DIST_L2, 0, 0.01, 0.01);
    let [vx, vy, cx, cy] = line.data32F;
    if (vx < 0) {
      vx = -vx;
      vy = -vy;
    }
    let perp = 0,
      along = 0;
    for (let i = 0; i < points.length; i += 2) {
      const dx = points[i] - cx,
        dy = points[i + 1] - cy;
      perp += (-vy * dx + vx * dy) ** 2;
      along += (vx * dx + vy * dy) ** 2;
    }
    if (
      along / Math.max(perp, 1e-9) < 8 ||
      Math.sqrt(perp / (points.length / 2)) > 0.045 ||
      Math.abs(-vy * cx + vx * cy) > 0.08
    ) {
      return unknown("候选区域不像一条清晰的眼尾，无法可靠判断方向。", started);
    }
    const measuredAngle = (Math.atan2(vy, vx) * 180) / Math.PI;
    if (measuredAngle < -35 || measuredAngle > 65)
      return unknown("候选方向超出当前实验支持范围，请重新拍摄。", started);
    const { verdict, deviation } = angleVerdict(
      measuredAngle,
      after.target.angle,
    );
    const message =
      verdict === "close"
        ? "眼尾方向接近参考"
        : verdict === "high"
          ? "眼尾明显偏高"
          : "眼尾明显偏低";
    // Points were selected in baseline-aligned coordinates. Undo the residual
    // translation so endpoints belong to the actual current photograph's eye.
    const projections: number[] = [];
    for (let i = 0; i < points.length; i += 2)
      projections.push((points[i] - cx) * vx + (points[i + 1] - cy) * vy);
    const endpoint = (t: number) => ({
      x: cx + t * vx + best.dx / ROI.scale,
      y: cy + t * vy - best.dy / ROI.scale,
    });
    return {
      evidence: {
        coordinateSystem: "after-eye-local",
        start: endpoint(Math.min(...projections)),
        end: endpoint(Math.max(...projections)),
      },
      verdict,
      message,
      deviation,
      measuredAngle,
      durationMs: performance.now() - started,
    };
  } catch {
    return unknown("分析暂不可用，请重试；本次不会给出方向结论。", started);
  } finally {
    owned.reverse().forEach((m) => m.delete());
  }
}
