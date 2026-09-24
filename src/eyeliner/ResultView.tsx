import ResultPhoto from "../analysis/ResultPhoto";
import type { Session } from "../session";
import type { Evaluation } from "../types";

export function ResultView({
  session,
  mirror,
  close,
}: {
  session: Session;
  mirror: boolean;
  close: () => void;
}) {
  if (!session.result) return null;
  return (
    <section className="result-panel" aria-label="本次检查结果">
      <h3 tabIndex={-1}>看看这次的结果</h3>
      <ResultPhoto
        before={session.baseline}
        after={session.currentFrame}
        result={session.result}
        mirror={mirror}
      />
      <Feedback result={session.result} />
      <button className="text-button" onClick={close}>
        返回练习，保留画前照片
      </button>
    </section>
  );
}

function Feedback({ result }: { result: Evaluation }) {
  const advice =
    result.verdict === "high"
      ? "与参考相比更上扬。可先局部擦除，再沿更平缓的方向重画。"
      : result.verdict === "low"
        ? "与参考相比偏平或向下。可先局部擦除，再沿更上扬的方向重画。"
        : "在本次 10° 实验范围内；不代表粗细、连续性或整体妆效合格。";
  return (
    <div className={`feedback ${result.verdict}`} role="status">
      <span className="feedback-label">本次方向检查</span>
      <strong>{result.message}</strong>
      <p>{result.verdict === "unknown" ? result.reason : advice}</p>
      {result.deviation !== undefined && (
        <small>
          相对参考{result.deviation >= 0 ? "高" : "低"}约{" "}
          {Math.abs(result.deviation).toFixed(1)}° · 实验估计
        </small>
      )}
    </div>
  );
}
