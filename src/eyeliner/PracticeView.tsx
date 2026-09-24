import type { Dispatch } from "react";
import type { Action, Session } from "../session";
import { ResultView } from "./ResultView";

export function PracticeView({
  session,
  mirror,
  canCapture,
  review,
  setReview,
  togglePause,
  requestCheck,
  reset,
  dispatch,
}: {
  session: Session;
  mirror: boolean;
  canCapture: boolean;
  review: boolean;
  setReview: (review: boolean) => void;
  togglePause: () => void;
  requestCheck: () => void;
  reset: () => void;
  dispatch: Dispatch<Action>;
}) {
  return (
    <>
      <ol className="instructions" hidden={!!session.result}>
        <li>
          {session.step === "wing"
            ? "从“起”向“收”轻画短线，沿参考轮廓逐渐收尖。"
            : "从眼睑外段的“起”点，用短笔触连接到外眼角。"}
        </li>
      </ol>
      <button className="text-button" onClick={() => setReview(!review)}>
        {review ? "收起提示 ↑" : "重看这一步的提示 ↗"}
      </button>
      {review && (
        <p className="review-note">
          {session.step === "wing"
            ? "放大画面中的“起”是外眼角，“收”是眼尾尖。沿箭头方向先轻画短线，再少量填充轮廓；靠近尖端时逐渐收细。"
            : "本步只突出眼睑外段。把两段轻轻连起来；自动检查模式也只看眼尾方向，不检查粗细或连接是否连续。"}
        </p>
      )}
      <ResultView
        session={session}
        mirror={mirror}
        close={() => dispatch({ type: "reviewed" })}
      />
      <div className="practice-actions">
        <button className="secondary" onClick={togglePause}>
          {session.paused ? "继续练习" : "暂停"}
        </button>
        {session.guidanceOnly ? (
          <button
            className="primary"
            disabled={session.paused}
            onClick={() => dispatch({ type: "next" })}
          >
            {session.step === "wing"
              ? "我已练习，继续下一步"
              : "我已练习，完成指引"}
          </button>
        ) : (
          <button
            className="primary"
            disabled={!canCapture || session.pending !== null}
            onClick={requestCheck}
          >
            {session.result ? "重新检查" : "检查这一步"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
      {session.result && (
        <button
          className="next-button"
          disabled={session.paused}
          onClick={() => dispatch({ type: "next" })}
        >
          {session.result.verdict === "unknown"
            ? "我已自行确认，"
            : "我已看过结果，"}
          {session.step === "wing" ? "继续下一步 →" : "完成练习 ✓"}
        </button>
      )}
      <p className="button-note">
        {session.guidanceOnly
          ? "仅指引模式 · 不拍照、不自动判断画得是否正确"
          : "每次只检查眼尾方向，结果不会自动推进步骤。"}
      </p>
      <button className="text-button reset" onClick={reset}>
        重新选择侧别或调整路径
      </button>
    </>
  );
}
