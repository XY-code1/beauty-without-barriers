export function CompletionView({
  guidanceOnly,
  restart,
}: {
  guidanceOnly: boolean;
  restart: () => void;
}) {
  return (
    <div className="completion">
      <div className="completion-mark">✓</div>
      <p className="eyebrow">ONE SMALL STEP</p>
      <h2 tabIndex={-1}>这一侧，练习完成。</h2>
      <p>
        留意刚刚最顺手的那一步，
        <br />
        下一次从那里找回感觉。
      </p>
      <div className="why">
        <p>
          完成表示你走完了指导流程。
          <br />
          {guidanceOnly
            ? "本次仅完成指引，未进行自动方向检查。"
            : "本次检查仅关注眼尾方向，不评价完整妆效。"}
        </p>
      </div>
      <button className="primary full" onClick={restart}>
        再练一次 <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
