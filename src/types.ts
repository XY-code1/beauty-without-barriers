export type Side = "left" | "right";
export type Point = { x: number; y: number };
export type Target = { side: Side; length: number; angle: number };
export type Eye = {
  inner: Point;
  outer: Point;
  upper: Point[];
  outward: Point;
  up: Point;
  width: number;
  openness: number;
  poseRatio: number;
};
export type VisionOutput = {
  status: "detected" | "lost";
  eye: Eye | null;
  width: number;
  height: number;
  timestamp: number;
};
export type Frame = {
  sharpness?: number;
  pixels: ImageData;
  eye: Eye;
  timestamp: number;
  target: Target;
  revision: number;
};
export type Verdict = "close" | "high" | "low" | "unknown";
export type Evaluation = {
  evidence?: {
    coordinateSystem: "after-eye-local";
    start: Point;
    end: Point;
  };
  verdict: Verdict;
  message: string;
  reason?: string;
  deviation?: number;
  measuredAngle?: number;
  durationMs: number;
};
export type Step = "setup" | "wing" | "connect" | "done";
