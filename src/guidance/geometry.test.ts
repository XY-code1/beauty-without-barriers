import { describe, expect, it } from "vitest";
import {
  angleVerdict,
  eyeCrop,
  eyeFromLandmarks,
  fromLocal,
  projectToDisplay,
  referencePath,
  toLocal,
} from "./geometry";
import type { Eye } from "../types";
export const leftEye: Eye = {
  inner: { x: 200, y: 220 },
  outer: { x: 320, y: 220 },
  width: 120,
  outward: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  upper: [
    { x: 260, y: 202 },
    { x: 290, y: 207 },
    { x: 320, y: 220 },
  ],
  openness: 0.25,
  poseRatio: 1,
};
describe("anatomical eye coordinates", () => {
  it("uses outward and upward axes on both sides", () => {
    expect(fromLocal({ x: 0.3, y: 0.1 }, leftEye)).toEqual({ x: 356, y: 208 });
    const right = {
      ...leftEye,
      inner: { x: 320, y: 220 },
      outer: { x: 200, y: 220 },
      outward: { x: -1, y: 0 },
    };
    expect(fromLocal({ x: 0.3, y: 0.1 }, right)).toEqual({ x: 164, y: 208 });
    expect(toLocal({ x: 164, y: 208 }, right)).toEqual({ x: 0.3, y: 0.1 });
  });
  it("keeps the same local position after translation, scaling and rotation", () => {
    const rotated = {
      ...leftEye,
      outer: { x: 100, y: 100 },
      width: 240,
      outward: { x: 0, y: 1 },
      up: { x: 1, y: 0 },
    };
    expect(fromLocal({ x: 0.3, y: 0.1 }, rotated)).toEqual({ x: 124, y: 172 });
    expect(toLocal({ x: 124, y: 172 }, rotated)).toEqual({ x: 0.3, y: 0.1 });
  });
  it("accounts for contain letterboxing, mirror and resize exactly once", () => {
    const p = { x: 100, y: 100 },
      source = { x: 640, y: 480 },
      viewport = { x: 320, y: 320 };
    expect(projectToDisplay(p, source, viewport, false)).toEqual({
      x: 50,
      y: 90,
    });
    expect(projectToDisplay(p, source, viewport, true)).toEqual({
      x: 270,
      y: 90,
    });
  });
  it("extracts the correct anatomical outer corner from MediaPipe indices", () => {
    const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    points[33] = { x: 0.2, y: 0.5 };
    points[133] = { x: 0.4, y: 0.5 };
    points[263] = { x: 0.8, y: 0.5 };
    points[362] = { x: 0.6, y: 0.5 };
    const right = eyeFromLandmarks(points, "right", 1000, 500)!;
    const left = eyeFromLandmarks(points, "left", 1000, 500)!;
    expect(right.outer.x).toBe(200);
    expect(left.outer.x).toBe(800);
    expect(right.up.y).toBe(-1);
    expect(left.up.y).toBe(-1);
  });
  it("generates the requested reference direction independent of face size", () => {
    const path = referencePath(leftEye, {
      side: "left",
      length: 0.3,
      angle: 20,
    });
    const endpoint = toLocal(path.wing[1], leftEye);
    expect((Math.atan2(endpoint.y, endpoint.x) * 180) / Math.PI).toBeCloseTo(
      20,
    );
    expect(Math.hypot(endpoint.x, endpoint.y)).toBeCloseTo(0.3);
  });
  it.each([
    [20, "close"],
    [30, "close"],
    [10, "close"],
    [31, "high"],
    [9, "low"],
  ])("classifies %s degrees without flipping up/down", (angle, verdict) => {
    expect(angleVerdict(Number(angle), 20).verdict).toBe(verdict);
  });
});

describe("tapered eyeliner outlines", () => {
  const target = { side: "left" as const, length: 0.3, angle: 20 };
  it("keeps the wing centered on the existing evaluation axis and tapers to one tip", () => {
    const path = referencePath(leftEye, target);
    let lastWidth = Infinity;
    for (let i = 0; i <= 16; i++) {
      const a = toLocal(path.wingOutline[i], leftEye);
      const b = toLocal(
        path.wingOutline[path.wingOutline.length - 1 - i],
        leftEye,
      );
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const width = Math.hypot(a.x - b.x, a.y - b.y);
      expect(width).toBeLessThanOrEqual(lastWidth + 1e-9);
      lastWidth = width;
      if (i > 0)
        expect((Math.atan2(mid.y, mid.x) * 180) / Math.PI).toBeCloseTo(20);
    }
    expect(lastWidth).toBeCloseTo(0);
    expect(path.wingOutline[16]).toEqual(path.wing[1]);
    expect(path.lidOutline[path.lid.length - 1]).toEqual(path.wingOutline[0]);
  });
  it("mirrors the complete silhouette without changing local shape or direction", () => {
    const reflect = (p: { x: number; y: number }) => ({ x: 520 - p.x, y: p.y });
    const right = {
      ...leftEye,
      inner: reflect(leftEye.inner),
      outer: reflect(leftEye.outer),
      upper: leftEye.upper.map(reflect),
      outward: { x: -1, y: 0 },
    };
    const leftPath = referencePath(leftEye, target);
    const rightPath = referencePath(right, { ...target, side: "right" });
    expect(rightPath.outline.length).toBe(leftPath.outline.length);
    leftPath.outline.forEach((p, i) => {
      expect(rightPath.outline[i].x).toBeCloseTo(520 - p.x);
      expect(rightPath.outline[i].y).toBeCloseTo(p.y);
    });
  });
  it("preserves the complete outline after head rotation and scaling", () => {
    const rotate = (p: { x: number; y: number }) => ({
      x: 700 - p.y * 1.5,
      y: p.x * 1.5,
    });
    const eye = {
      ...leftEye,
      inner: rotate(leftEye.inner),
      outer: rotate(leftEye.outer),
      upper: leftEye.upper.map(rotate),
      width: 180,
      outward: { x: 0, y: 1 },
      up: { x: 1, y: 0 },
    };
    const original = referencePath(leftEye, target).outline;
    const actual = referencePath(eye, target).outline;
    original.forEach((p, i) => {
      const expected = rotate(p);
      expect(actual[i].x).toBeCloseTo(expected.x);
      expect(actual[i].y).toBeCloseTo(expected.y);
    });
  });
  it("keeps the eye and longest supported wing inside the zoom crop", () => {
    const crop = eyeCrop(leftEye, { x: 640, y: 480 });
    const path = referencePath(leftEye, { ...target, angle: 35, length: 0.45 });
    for (const p of [leftEye.inner, leftEye.outer, ...path.outline]) {
      expect(p.x).toBeGreaterThanOrEqual(crop.x);
      expect(p.x).toBeLessThanOrEqual(crop.x + crop.width);
      expect(p.y).toBeGreaterThanOrEqual(crop.y);
      expect(p.y).toBeLessThanOrEqual(crop.y + crop.height);
    }
    const edge = { ...leftEye, outer: { x: 10, y: 20 } };
    const clipped = eyeCrop(edge, { x: 320, y: 240 });
    expect(clipped.x).toBe(0);
    expect(clipped.y).toBe(0);
    expect(clipped.width).toBeGreaterThan(0);
    expect(clipped.height).toBeGreaterThan(0);
  });
});
