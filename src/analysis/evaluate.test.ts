import { beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { baselineIssue, evaluateFrames } from "./evaluate";
import { syntheticFrame } from "./fixtures";
import { fromLocal, referencePath } from "../guidance/geometry";
import type { OpenCV } from "./opencv";
let cv: OpenCV;
beforeAll(async () => {
  const require = createRequire(import.meta.url),
    module = require("@techstark/opencv-js");
  const result = await new Promise<{ cv: OpenCV }>((resolve) => {
    if (module.Mat) resolve({ cv: module });
    else module.then((ready: OpenCV) => resolve({ cv: ready }));
  });
  cv = result.cv;
}, 30_000);
describe("real OpenCV on synthetic images (not real sample acceptance)", () => {
  it.each([false, true])(
    "fits close/high/low with the same sign for right=%s",
    (right) => {
      const before = syntheticFrame("none", right, 1);
      for (const [angle, verdict] of [
        [20, "close"],
        [40, "high"],
        [0, "low"],
      ] as const) {
        const result = evaluateFrames(cv, before, syntheticFrame(angle, right));
        expect(result, JSON.stringify(result)).toMatchObject({ verdict });
        expect(result.measuredAngle).toBeCloseTo(angle, 0);
        expect(result.evidence?.coordinateSystem).toBe("after-eye-local");
        expect(result.evidence?.start.x).toBeCloseTo(0, 1);
        expect(result.evidence?.end.x).toBeCloseTo(0.36, 1);
        expect(result.evidence?.end.y).toBeCloseTo(
          0.36 * Math.tan((angle * Math.PI) / 180),
          1,
        );
      }
    },
  );
  it.each(["none", "blur", "occlusion"] as const)(
    "rejects %s without a direction conclusion",
    (kind) => {
      const result = evaluateFrames(
        cv,
        syntheticFrame("none", false, 1),
        syntheticFrame(kind),
      );
      expect(result.verdict).toBe("unknown");
      expect(result.deviation).toBeUndefined();
      expect(result.evidence).toBeUndefined();
    },
  );
  it("rejects a blurry baseline", () => {
    expect(baselineIssue(cv, syntheticFrame("blur"))).toContain("不够清晰");
    expect(baselineIssue(cv, syntheticFrame("none"))).toBeNull();
  });
  it("rejects incompatible target, pose, old frame and eye closure", () => {
    const before = syntheticFrame("none", false, 1);
    for (const mutate of [
      (f: Frame) => {
        f.revision++;
      },
      (f: Frame) => {
        f.target.angle = 30;
      },
      (f: Frame) => {
        f.timestamp = 0;
      },
      (f: Frame) => {
        f.eye.openness = 0.05;
      },
      (f: Frame) => {
        f.eye.poseRatio = 0.5;
      },
    ]) {
      const after = syntheticFrame(20);
      mutate(after);
      expect(evaluateFrames(cv, before, after).verdict).toBe("unknown");
    }
  });
  it("remains usable across twenty repeated checks", () => {
    const before = syntheticFrame("none", false, 1),
      after = syntheticFrame(20);
    for (let i = 0; i < 20; i++)
      expect(evaluateFrames(cv, before, after).verdict).toBe("close");
  });
  it.each([false, true])(
    "keeps the new tapered template compatible with wing-direction checking, right=%s",
    (right) => {
      for (const [angle, length] of [
        [10, 0.18],
        [20, 0.3],
        [35, 0.45],
      ])
        for (const part of ["wingOutline", "outline"] as const) {
          const before = syntheticFrame("none", right, 1),
            after = syntheticFrame("none", right, 2);
          for (const frame of [before, after]) {
            frame.target.angle = angle;
            frame.target.length = length;
            frame.eye.upper = Array.from({ length: 9 }, (_, i) =>
              fromLocal(
                { x: -1 + i / 8, y: 0.12 * Math.sin((i / 8) * Math.PI) },
                frame.eye,
              ),
            );
          }
          const polygon = referencePath(after.eye, after.target)[part];
          const image = cv.matFromImageData(after.pixels);
          const points = cv.matFromArray(
            polygon.length,
            1,
            cv.CV_32SC2,
            polygon.flatMap((p) => [Math.round(p.x), Math.round(p.y)]),
          );
          const contours = new cv.MatVector();
          contours.push_back(points);
          try {
            cv.fillPoly(image, contours, new cv.Scalar(45, 45, 45, 255));
            after.pixels = {
              ...after.pixels,
              data: new Uint8ClampedArray(image.data),
            };
            const result = evaluateFrames(cv, before, after);
            expect(
              result,
              `${part} at ${angle}°/${length}: ${JSON.stringify(result)}`,
            ).toMatchObject({ verdict: "close" });
          } finally {
            image.delete();
            points.delete();
            contours.delete();
          }
        }
    },
  );
  it.each([false, true])(
    "aligns a shifted, scaled and rotated photograph for right=%s",
    (right) => {
      const before = syntheticFrame("none", right, 1),
        after = syntheticFrame(20, right);
      const c = Math.cos(0.08) * 1.04,
        s = Math.sin(0.08) * 1.04;
      const transform = cv.matFromArray(2, 3, cv.CV_64F, [
        c,
        -s,
        12,
        s,
        c,
        -10,
      ]);
      const source = cv.matFromImageData(after.pixels),
        warped = new cv.Mat();
      try {
        cv.warpAffine(source, warped, transform, new cv.Size(640, 480));
        after.pixels = {
          ...after.pixels,
          data: new Uint8ClampedArray(warped.data),
        };
        const point = (p: { x: number; y: number }) => ({
          x: c * p.x - s * p.y + 12,
          y: s * p.x + c * p.y - 10,
        });
        const axis = (p: { x: number; y: number }) => ({
          x: (c * p.x - s * p.y) / 1.04,
          y: (s * p.x + c * p.y) / 1.04,
        });
        after.eye = {
          ...after.eye,
          outer: point(after.eye.outer),
          inner: point(after.eye.inner),
          outward: axis(after.eye.outward),
          up: axis(after.eye.up),
          width: after.eye.width * 1.04,
        };
        const result = evaluateFrames(cv, before, after);
        expect(result, JSON.stringify(result)).toMatchObject({
          verdict: "close",
        });
        expect(result.evidence?.start.x).toBeCloseTo(0, 1);
        expect(result.evidence?.start.y).toBeCloseTo(0, 1);
        expect(result.evidence?.end.x).toBeCloseTo(0.36, 1);
        expect(result.evidence?.end.y).toBeCloseTo(0.131, 1);
      } finally {
        source.delete();
        warped.delete();
        transform.delete();
      }
    },
  );
});
import type { Frame } from "../types";
