import type { Eye, Point, Side, Target, Verdict } from "../types";

export function eyeFromLandmarks(
  points: readonly Point[],
  side: Side,
  width: number,
  height: number,
): Eye | null {
  if (points.length < 468 || !width || !height) return null;
  const p = (i: number): Point => ({
    x: points[i].x * width,
    y: points[i].y * height,
  });
  const ids =
    side === "right"
      ? {
          outer: 33,
          inner: 133,
          top: 159,
          bottom: 145,
          upper: [133, 173, 157, 158, 159, 160, 161, 246, 33],
        }
      : {
          outer: 263,
          inner: 362,
          top: 386,
          bottom: 374,
          upper: [362, 398, 384, 385, 386, 387, 388, 466, 263],
        };
  const inner = p(ids.inner),
    outer = p(ids.outer);
  const eyeWidth = distance(inner, outer);
  if (!Number.isFinite(eyeWidth) || eyeWidth < 8) return null;
  const outward = {
    x: (outer.x - inner.x) / eyeWidth,
    y: (outer.y - inner.y) / eyeWidth,
  };
  const sign = side === "left" ? 1 : -1;
  const up = { x: outward.y * sign, y: -outward.x * sign };
  const otherWidth =
    side === "left" ? distance(p(33), p(133)) : distance(p(263), p(362));
  return {
    inner,
    outer,
    upper: ids.upper.map(p),
    outward,
    up,
    width: eyeWidth,
    openness: distance(p(ids.top), p(ids.bottom)) / eyeWidth,
    poseRatio: eyeWidth / Math.max(otherWidth, 1),
  };
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
// Both anatomical eyes use the same local axes: x outward, y toward the brow.
export function toLocal(point: Point, eye: Eye): Point {
  const dx = point.x - eye.outer.x,
    dy = point.y - eye.outer.y;
  return {
    x: (dx * eye.outward.x + dy * eye.outward.y) / eye.width,
    y: (dx * eye.up.x + dy * eye.up.y) / eye.width,
  };
}
export function fromLocal(point: Point, eye: Eye): Point {
  return {
    x: eye.outer.x + eye.width * (eye.outward.x * point.x + eye.up.x * point.y),
    y: eye.outer.y + eye.width * (eye.outward.y * point.x + eye.up.y * point.y),
  };
}
export function referencePath(eye: Eye, target: Target) {
  const radians = (target.angle * Math.PI) / 180;
  const end = {
    x: target.length * Math.cos(radians),
    y: target.length * Math.sin(radians),
  };
  const anchors = eye.upper.slice(Math.floor(eye.upper.length / 2));
  const lid = [anchors[0]];
  // Sample the same quadratic eyelid curve for the outline and the active stroke.
  for (let i = 1; i < anchors.length - 1; i++) {
    const a = lid.at(-1)!,
      b = anchors[i];
    const c = {
      x: (b.x + anchors[i + 1].x) / 2,
      y: (b.y + anchors[i + 1].y) / 2,
    };
    for (let j = 1; j <= 8; j++) {
      const t = j / 8;
      lid.push({
        x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * b.x + t * t * c.x,
        y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * b.y + t * t * c.y,
      });
    }
  }
  lid.push(eye.outer);
  const halfWidth = 0.024;
  const normal = { x: -Math.sin(radians), y: Math.cos(radians) };
  const lidTop: Point[] = [],
    lidBottom: Point[] = [];
  lid.forEach((p, i) => {
    const t = i / (lid.length - 1),
      local = toLocal(p, eye);
    const width = halfWidth * Math.sin((t * Math.PI) / 2);
    // Match the wing's cross-section at the outer corner so the two parts meet.
    const n = { x: normal.x * t * t, y: 1 + (normal.y - 1) * t * t };
    lidTop.push(
      fromLocal({ x: local.x + n.x * width, y: local.y + n.y * width }, eye),
    );
    lidBottom.push(
      fromLocal({ x: local.x - n.x * width, y: local.y - n.y * width }, eye),
    );
  });
  const wingTop: Point[] = [],
    wingBottom: Point[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16,
      width = halfWidth * (1 - t) ** 0.8;
    wingTop.push(
      fromLocal(
        { x: end.x * t + normal.x * width, y: end.y * t + normal.y * width },
        eye,
      ),
    );
    wingBottom.push(
      fromLocal(
        { x: end.x * t - normal.x * width, y: end.y * t - normal.y * width },
        eye,
      ),
    );
  }
  return {
    lid,
    wing: [eye.outer, fromLocal(end, eye)],
    lidOutline: [...lidTop, ...lidBottom.slice().reverse()],
    wingOutline: [...wingTop, ...wingBottom.slice().reverse()],
    outline: [
      ...lidTop,
      ...wingTop.slice(1),
      ...wingBottom.slice().reverse().slice(1),
      ...lidBottom.slice().reverse().slice(1),
    ],
    angle: target.angle,
  };
}

export function eyeCrop(eye: Eye, frame: Point) {
  const corners = [-1.18, 0.72].flatMap((x) =>
    [-0.48, 0.65].map((y) => fromLocal({ x, y }, eye)),
  );
  const x = Math.max(0, Math.min(...corners.map((p) => p.x)));
  const y = Math.max(0, Math.min(...corners.map((p) => p.y)));
  const right = Math.min(frame.x, Math.max(...corners.map((p) => p.x)));
  const bottom = Math.min(frame.y, Math.max(...corners.map((p) => p.y)));
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}
export function projectToDisplay(
  p: Point,
  source: Point,
  viewport: Point,
  mirror: boolean,
): Point {
  const scale = Math.min(viewport.x / source.x, viewport.y / source.y);
  const x = mirror ? source.x - p.x : p.x;
  return {
    x: (viewport.x - source.x * scale) / 2 + x * scale,
    y: (viewport.y - source.y * scale) / 2 + p.y * scale,
  };
}
export function angleVerdict(
  measured: number,
  reference: number,
): { verdict: Verdict; deviation: number } {
  const deviation = measured - reference;
  return {
    verdict:
      Math.abs(deviation) <= 10 ? "close" : deviation > 0 ? "high" : "low",
    deviation,
  };
}
export function geometryIssue(
  eye: Eye,
  width: number,
  height: number,
): string | null {
  if (eye.width < 45) return "请稍微靠近镜头，让眼部更清楚。";
  if (eye.openness < 0.1 || eye.openness > 0.65) return "请自然睁眼后重拍。";
  if (eye.poseRatio < 0.67 || eye.poseRatio > 1.5)
    return "请正视镜头，再检查一次。";
  for (const x of [-1.05, 0.85])
    for (const y of [-0.55, 0.75]) {
      const p = fromLocal({ x, y }, eye);
      if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height)
        return "眼部靠近画面边缘，请移到画面中间。";
    }
  return null;
}
