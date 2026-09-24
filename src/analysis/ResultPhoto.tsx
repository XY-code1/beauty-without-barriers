import { useEffect, useRef, useState } from "react";
import type { Evaluation, Frame, Point } from "../types";
import { ROI } from "./evaluate";

export default function ResultPhoto({
  before,
  after,
  result,
  mirror,
}: {
  before: Frame | null;
  after: Frame | null;
  result: Evaluation;
  mirror: boolean;
}) {
  const [showBefore, setShowBefore] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => setShowBefore(false), [after, result]);
  const frame = showBefore ? before : after;
  const evidence =
    !showBefore && result.verdict !== "unknown" ? result.evidence : undefined;
  useEffect(() => {
    const el = canvas.current;
    if (!el || !frame) return;
    const ctx = el.getContext("2d")!;
    el.width = ROI.width * 3;
    el.height = ROI.height * 3;
    ctx.scale(3, 3);
    const flip = (frame.target.side === "right") !== mirror;
    if (flip) {
      ctx.translate(ROI.width, 0);
      ctx.scale(-1, 1);
    }
    const raw = document.createElement("canvas");
    raw.width = frame.pixels.width;
    raw.height = frame.pixels.height;
    raw.getContext("2d")!.putImageData(frame.pixels, 0, 0);
    const e = frame.eye,
      k = ROI.scale / e.width;
    ctx.save();
    ctx.transform(
      k * e.outward.x,
      -k * e.up.x,
      k * e.outward.y,
      -k * e.up.y,
      -k * (e.outer.x * e.outward.x + e.outer.y * e.outward.y) -
        ROI.xMin * ROI.scale,
      k * (e.outer.x * e.up.x + e.outer.y * e.up.y) + ROI.yMax * ROI.scale,
    );
    ctx.drawImage(raw, 0, 0);
    ctx.restore();
    const line = (a: Point, b: Point, dashed: boolean) => {
      ctx.beginPath();
      ctx.moveTo((a.x - ROI.xMin) * ROI.scale, (ROI.yMax - a.y) * ROI.scale);
      ctx.lineTo((b.x - ROI.xMin) * ROI.scale, (ROI.yMax - b.y) * ROI.scale);
      ctx.setLineDash(dashed ? [4, 3] : []);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#142b29";
      ctx.stroke();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = dashed ? "#ffffff" : "#ffdb66";
      ctx.stroke();
    };
    if (!showBefore) {
      const radians = (frame.target.angle * Math.PI) / 180;
      line(
        { x: 0, y: 0 },
        {
          x: frame.target.length * Math.cos(radians),
          y: frame.target.length * Math.sin(radians),
        },
        true,
      );
      if (evidence) line(evidence.start, evidence.end, false);
    }
    return () => {
      el.width = 0;
      el.height = 0;
    };
  }, [frame, mirror, showBefore, evidence]);
  if (!after)
    return <p className="photo-missing">这次未取得可用照片，请重拍。</p>;
  return (
    <div className="photo-comparison">
      <div className="guide-modes" role="group" aria-label="照片对照">
        <button aria-pressed={!showBefore} onClick={() => setShowBefore(false)}>
          本次照片
        </button>
        <button
          aria-pressed={showBefore}
          onClick={() => setShowBefore(true)}
          disabled={!before}
        >
          画前照片
        </button>
      </div>
      <canvas
        ref={canvas}
        aria-label={showBefore ? "画前照片对照" : "本次检查照片"}
      />
      {!showBefore && (
        <p className="photo-legend">
          <span>虚线：参考方向</span>
          {evidence && <span>实线：检测候选</span>}
        </p>
      )}
      <p className="button-note">
        仅比较眼尾方向；候选线是实验检测结果，不代表整条眼线评价。
      </p>
    </div>
  );
}
