import type { Session } from "../session";
import type { Target } from "../types";
import { EyeIcon } from "./EyeIcon";

export function PreparationView({
  session,
  canCapture,
  visible,
  changeTarget,
  requestBaseline,
  startGuidanceOnly,
}: {
  session: Session;
  canCapture: boolean;
  visible: boolean;
  changeTarget: (target: Target) => void;
  requestBaseline: () => void;
  startGuidanceOnly: () => void;
}) {
  return (
    <>
      <div className="card-title">
        <span className="eyebrow">YOUR LOOK</span>
        <span className="small-pill">初次练习</span>
      </div>
      <h2>选择你的自然眼线</h2>
      <p className="subtext">轻微延长、自然上扬，从简单的样式开始。</p>
      <div className="look-selected">
        <EyeIcon />
        <div>
          <strong>自然 · 轻上扬</strong>
          <span>贴合外眼睑 · 眼尾自然收尖</span>
        </div>
        <span className="checkmark">✓</span>
      </div>
      <fieldset className="side-picker">
        <legend>
          这次练习哪一侧？<small>按你自己的左右区分</small>
        </legend>
        {(["right", "left"] as const).map((side) => (
          <button
            key={side}
            aria-pressed={session.target.side === side}
            onClick={() => changeTarget({ ...session.target, side })}
          >
            {side === "right" ? "右眼" : "左眼"}
          </button>
        ))}
      </fieldset>
      <details className="target-details">
        <summary>微调长度与上扬程度</summary>
        <label className="slider-label" htmlFor="length">
          眼尾长度<span>{Math.round(session.target.length * 100)}% 眼宽</span>
        </label>
        <input
          id="length"
          type="range"
          min="0.18"
          max="0.45"
          step="0.01"
          value={session.target.length}
          onChange={(e) =>
            changeTarget({ ...session.target, length: Number(e.target.value) })
          }
        />
        <div className="range-hints">
          <span>短一点</span>
          <span>长一点</span>
        </div>
        <label className="slider-label" htmlFor="angle">
          上扬程度<span>{session.target.angle}°</span>
        </label>
        <input
          id="angle"
          type="range"
          min="10"
          max="35"
          step="1"
          value={session.target.angle}
          onChange={(e) =>
            changeTarget({ ...session.target, angle: Number(e.target.value) })
          }
        />
        <div className="range-hints">
          <span>柔和</span>
          <span>上扬</span>
        </div>
      </details>
      <div className="why">
        <span>✧</span>
        <p>
          以外眼角为起点，按眼宽适配长度。
          <br />
          这是可调整的练习参考，没有唯一标准。
        </p>
      </div>
      <button
        className="primary full"
        disabled={!canCapture}
        onClick={requestBaseline}
      >
        确认形状，拍画前照片 <span aria-hidden="true">→</span>
      </button>
      <p className="button-note">请在画眼线前采集；已画过时需先卸除。</p>
      <button
        className="secondary guidance-only-entry"
        disabled={!visible || session.pending !== null}
        onClick={startGuidanceOnly}
      >
        仅跟随指引练习
      </button>
      <p className="button-note">
        不拍照、不自动检查；完成每一步后由你自行确认。
      </p>
    </>
  );
}
