// Synthetic fixtures for algorithm tests only. Not a real makeup dataset.
import type { Frame } from "../types";
export function syntheticFrame(
  angle: number | "none" | "blur" | "occlusion",
  right = false,
  timestamp = 2,
): Frame {
  const width = 640,
    height = 480,
    data = new Uint8ClampedArray(width * height * 4);
  const eye = {
    inner: { x: right ? 320 : 200, y: 220 },
    outer: { x: right ? 200 : 320, y: 220 },
    width: 120,
    outward: { x: right ? -1 : 1, y: 0 },
    up: { x: 0, y: -1 },
    upper: [],
    openness: 0.25,
    poseRatio: 1,
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const lx = ((x - eye.outer.x) / 120) * (right ? -1 : 1),
        ly = (220 - y) / 120;
      let value = 195 + ((x * 7 + y * 13) % 13) - 6;
      if (
        lx >= -1 &&
        lx <= 0 &&
        Math.abs(ly - 0.12 * Math.sin(-lx * Math.PI)) < 0.022
      )
        value = 65;
      if (
        typeof angle === "number" &&
        lx >= 0 &&
        lx <= 0.36 &&
        Math.abs(ly - lx * Math.tan((angle * Math.PI) / 180)) < 0.02
      )
        value = 45;
      if (
        angle === "occlusion" &&
        lx > -0.4 &&
        lx < 0.6 &&
        ly > -0.2 &&
        ly < 0.5
      )
        value = 105;
      if (angle === "blur") value = 195;
      const index = (y * width + x) * 4;
      data[index] = data[index + 1] = data[index + 2] = value;
      data[index + 3] = 255;
    }
  return {
    pixels: { data, width, height, colorSpace: "srgb" } as ImageData,
    eye,
    timestamp,
    target: { side: right ? "right" : "left", angle: 20, length: 0.3 },
    revision: 0,
  };
}
