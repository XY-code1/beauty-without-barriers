import { useEffect, useReducer, useRef, useState } from "react";
import GuideCanvas from "./guidance/GuideCanvas";
import type { GuideMode } from "./guidance/render";
import { initialSession, sessionReducer } from "./session";
import { CompletionView } from "./eyeliner/CompletionView";
import { EyeIcon } from "./eyeliner/EyeIcon";
import { PracticeView } from "./eyeliner/PracticeView";
import { PreparationView } from "./eyeliner/PreparationView";
import { useCameraCapture } from "./eyeliner/useCameraCapture";
export { EyeIcon } from "./eyeliner/EyeIcon";
const steps = ["确认路径", "画眼尾", "连接外段", "完成练习"];
const stepIndex = { setup: 0, wing: 1, connect: 2, done: 3 };
export default function EyelinerPractice({
  onEngagementChange,
}: {
  onEngagementChange: (active: boolean) => void;
}) {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const guidanceRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [mirror, setMirror] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [opacity, setOpacity] = useState(0.85);
  const [guideMode, setGuideMode] = useState<GuideMode>("guide");
  const [review, setReview] = useState(false);
  const [showWhole, setShowWhole] = useState(false);
  const camera = useCameraCapture(session, dispatch, onEngagementChange);
  const {
    videoRef,
    cameraStatus,
    vision,
    error,
    setError,
    intent,
    uncovered,
    setUncovered,
    progress,
    busy,
    cancelRequest,
    stopCamera,
    startCamera,
    changeTarget,
    togglePause,
    resumeCamera,
    capture,
  } = camera;

  function requestCapture(kind: "baseline" | "check") {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    camera.requestCapture(kind);
  }
  useEffect(() => {
    if (intent)
      document
        .querySelector<HTMLInputElement>(".capture-dialog input")
        ?.focus();
    else returnFocus.current?.focus();
  }, [intent]);
  useEffect(() => {
    setShowWhole(false);
    setReview(false);
    window.scrollTo(0, 0);
    if (session.step === "wing" || session.step === "connect")
      setGuideMode("guide");
  }, [session.step]);

  useEffect(() => {
    if (session.result) {
      document.querySelector<HTMLElement>(".result-panel h3")?.focus();
    } else if (session.step !== "setup") {
      document
        .querySelector<HTMLElement>(".practice-heading h2, .completion h2")
        ?.focus({ preventScroll: true });
    }
  }, [session.result, session.step]);

  const inPractice = session.step === "wing" || session.step === "connect";
  const active = cameraStatus === "on",
    visible = active && !!vision?.eye && !session.paused;
  const canCapture = visible && !session.pending;
  const currentStep = stepIndex[session.step];
  const status = session.paused
    ? "练习已暂停"
    : cameraStatus === "loading"
      ? "正在准备摄像头与模型"
      : visible
        ? "眼部已定位"
        : active
          ? "请正视镜头，让脸进入画面"
          : "摄像头尚未开启";

  return (
    <div
      className={`app-shell eye-shell ${inPractice ? "focus-practice" : ""} ${session.step === "done" ? "finished-practice" : ""}`}
    >
      <header className="header" inert={!!intent}>
        <a className="brand" href="#/" aria-label="返回妆容工作台">
          <span className="brand-icon">
            <EyeIcon />
          </span>
          <span>
            无界美妆<small>BEAUTY WITHOUT BARRIERS</small>
          </span>
        </a>
        <span className="edition">
          <i /> 眼线练习室 <span> / 01</span>
        </span>
      </header>
      <main inert={!!intent}>
        <div className="intro">
          <div>
            <p className="eyebrow">一点指引，一点从容</p>
            <h1 tabIndex={-1}>
              从一条眼线，<em>开始。</em>
            </h1>
            <p className="intro-copy">
              找到适合练习的方向，按照自己的节奏，慢慢来。
            </p>
          </div>
          <div className="intro-note">
            <span>01 — NATURAL LINER</span>
            <p>
              单侧自然眼线
              <br />
              一次，只专注一小步。
            </p>
          </div>
        </div>
        <ol className="steps" aria-label="练习进度">
          {steps.map((label, i) => (
            <li
              key={label}
              aria-current={currentStep === i ? "step" : undefined}
              className={
                currentStep === i ? "current" : currentStep > i ? "passed" : ""
              }
            >
              <span>{currentStep > i ? "✓" : `0${i + 1}`}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="workspace">
          <section
            className="mirror-card"
            aria-label="摄像头与参考路径"
            hidden={inPractice || session.step === "done"}
          >
            <div className="mirror-heading">
              <span>
                <i className={visible ? "dot live" : "dot"} /> {status}
              </span>
              <span>你的{session.target.side === "right" ? "右" : "左"}眼</span>
            </div>
            <div className="camera-stage">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ transform: mirror ? "scaleX(-1)" : undefined }}
                aria-label="原始摄像头画面"
              />
              <GuideCanvas
                video={videoRef}
                vision={visible ? vision : null}
                target={session.target}
                step={session.step}
                mode={guideMode}
                highContrast={highContrast}
                opacity={opacity}
                mirror={mirror}
                showGuide={showGuide}
              />
              {!active && (
                <div className="camera-placeholder">
                  <div className="eye-art">
                    <EyeIcon large />
                    <span className="spark one">✧</span>
                    <span className="spark two">✦</span>
                  </div>
                  <h2>先，看见你的眼睛</h2>
                  <p>
                    正视镜头，在光线均匀的地方坐好。
                    <br />
                    参考线会随眼部位置移动。
                  </p>
                  <button
                    className="primary"
                    onClick={startCamera}
                    disabled={cameraStatus === "loading"}
                  >
                    {cameraStatus === "loading"
                      ? "正在准备…"
                      : cameraStatus === "error"
                        ? "重试开启摄像头"
                        : "开启摄像头"}{" "}
                    <span aria-hidden="true">↗</span>
                  </button>
                  <small>仅在本机处理 · 图片不会上传</small>
                </div>
              )}
              {active && !visible && (
                <div className="view-hint">
                  {session.paused
                    ? "休息一下，准备好再继续"
                    : "请把脸移到画面中间"}
                </div>
              )}
              {visible && showGuide && (
                <div className="guide-caption">
                  <span />{" "}
                  {guideMode === "preview"
                    ? "半透明妆效示意"
                    : "浅绿色为当前参考轮廓"}
                </div>
              )}
              <span className="corner tl" />
              <span className="corner tr" />
              <span className="corner bl" />
              <span className="corner br" />
            </div>
            <div className="camera-tools">
              <button
                aria-pressed={showGuide}
                onClick={() => setShowGuide(!showGuide)}
              >
                {showGuide ? "◉ 隐藏参考线" : "◎ 显示参考线"}
              </button>
              <button aria-pressed={mirror} onClick={() => setMirror(!mirror)}>
                ⇄ {mirror ? "镜像已开" : "镜像已关"}
              </button>
              {active && <button onClick={stopCamera}>关闭摄像头</button>}
            </div>
            <p className="camera-footnote">
              先看整体形状，再照着放大画面的起点与方向练习。虚拟轮廓不会进入检查图像。
            </p>
          </section>
          <section
            ref={guidanceRef}
            className="guidance-card"
            aria-label="练习设置与指导"
          >
            {inPractice && (
              <div className="practice-heading">
                <span className="eyebrow">
                  你的{session.target.side === "right" ? "右" : "左"}眼 · 第{" "}
                  {currentStep} / 2 步
                </span>
                <h2 tabIndex={-1}>
                  {session.step === "wing"
                    ? "先画一小段眼尾"
                    : "轻轻连接眼睑外段"}
                </h2>
              </div>
            )}
            <div className="detail-heading">
              <span>看懂形状，再落笔</span>
              <small>{active ? "眼部放大" : "形状示意 · 非实时"}</small>
            </div>
            <div
              hidden={!!session.result}
              className="guide-modes"
              role="group"
              aria-label="参考显示方式"
            >
              <button
                aria-pressed={guideMode === "guide"}
                onClick={() => {
                  setGuideMode("guide");
                  setShowGuide(true);
                }}
              >
                跟着画
              </button>
              <button
                aria-pressed={guideMode === "preview"}
                onClick={() => {
                  setGuideMode("preview");
                  setShowGuide(true);
                }}
              >
                看效果
              </button>
            </div>
            <div className="detail-view" hidden={!!session.result}>
              <GuideCanvas
                video={videoRef}
                vision={visible ? vision : null}
                target={session.target}
                step={session.step}
                mode={guideMode}
                highContrast={highContrast}
                opacity={opacity}
                mirror={mirror}
                showGuide={showGuide}
                detail
                overview={inPractice && showWhole}
                illustrate={!active}
              />
              {active && !visible && (
                <p className="detail-placeholder">
                  {session.paused
                    ? "已暂停，恢复后显示实时画面"
                    : "等待眼部定位，不显示旧画面"}
                </p>
              )}
              {active && visible && (
                <span className="detail-live">
                  <i /> 实时
                </span>
              )}
            </div>
            {inPractice && !session.result && (
              <button
                className="view-toggle"
                onClick={() => setShowWhole(!showWhole)}
              >
                {showWhole ? "回到眼部放大" : "查看整体画面"}
              </button>
            )}
            <p className="detail-legend" aria-live="polite">
              {!showGuide
                ? "参考轮廓已隐藏，可观察原始画面。"
                : guideMode === "preview"
                  ? "半透明轮廓仅示意形状，实际妆效取决于产品与操作。"
                  : session.step === "done"
                    ? "练习结束，可切换看效果回看目标形状。"
                    : session.step === "connect"
                      ? "起：眼睑外段 → 收：外眼角；浅绿是这一笔。"
                      : "起：外眼角 → 收：眼尾尖；浅绿轮廓是参考填充区域。"}
            </p>
            {session.step === "setup" ? (
              <PreparationView
                session={session}
                canCapture={canCapture}
                visible={visible}
                changeTarget={changeTarget}
                requestBaseline={() => requestCapture("baseline")}
                startGuidanceOnly={() => {
                  cancelRequest();
                  setError("");
                  dispatch({ type: "guidance-only" });
                }}
              />
            ) : session.step === "done" ? (
              <CompletionView
                guidanceOnly={session.guidanceOnly}
                restart={() => {
                  cancelRequest();
                  dispatch({ type: "reset" });
                }}
              />
            ) : (
              <PracticeView
                session={session}
                mirror={mirror}
                canCapture={canCapture}
                review={review}
                setReview={setReview}
                togglePause={togglePause}
                requestCheck={() => requestCapture("check")}
                dispatch={dispatch}
                reset={() => {
                  cancelRequest();
                  dispatch({ type: "reset" });
                  resumeCamera();
                }}
              />
            )}
            {session.step !== "done" && (
              <details className="display-settings">
                <summary>参考线显示设置</summary>
                <label>
                  <input
                    type="checkbox"
                    checked={highContrast}
                    onChange={(e) => setHighContrast(e.target.checked)}
                  />
                  高对比度参考线
                </label>
                <label>
                  参考线不透明度
                  <input
                    type="range"
                    min="0.3"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                  />
                </label>
              </details>
            )}
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}
          </section>
        </div>
        <div className="notes-row">
          <div>
            <span>01</span>
            <p>
              <strong>跟着你的位置</strong>参考路径随眼部移动
            </p>
          </div>
          <div>
            <span>02</span>
            <p>
              <strong>跟着你的节奏</strong>由你决定何时检查
            </p>
          </div>
          <div>
            <span>03</span>
            <p>
              <strong>留在你的设备</strong>关闭或重置即清除图片
            </p>
          </div>
        </div>
        <footer>
          <span>BEAUTY, AT YOUR OWN PACE.</span>
          <p>
            实验版 · 方向检查尚未完成真实样本验收
            <br />
            10° 为实验阈值；检测不到可靠眼线时不会给出纠偏结论。
          </p>
        </footer>
      </main>
      {intent && (
        <div className="modal-backdrop">
          <section
            className="capture-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capture-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") cancelRequest();
              if (event.key === "Tab") {
                const buttons =
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), input:not(:disabled)",
                  );
                const first = buttons[0],
                  last = buttons[buttons.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                }
                if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <span className="eyebrow">
              {intent === "baseline" ? "BEFORE YOU BEGIN" : "A MOMENT TO CHECK"}
            </span>
            <h2 id="capture-title">移开手，保持正视</h2>
            <p>
              {intent === "baseline"
                ? "先记录还没画眼线的样子，后面用来对照。"
                : "尽量保持与基准图相同的光线、距离和眼睛开合。"}
            </p>
            <p className="subtext">找到关键点不代表没有遮挡，请先自己确认。</p>
            <label className="confirm-visible">
              <input
                type="checkbox"
                checked={uncovered}
                disabled={busy.current}
                onChange={(e) => setUncovered(e.target.checked)}
              />
              我已移开手和工具，眼部没有遮挡
            </label>
            <div role="status" className="capture-progress">
              {progress || "点击后留出片刻，让你重新看向镜头。"}
            </div>
            <button
              className="primary full"
              disabled={!uncovered || busy.current}
              onClick={capture}
            >
              {busy.current
                ? "正在处理…"
                : intent === "baseline"
                  ? "拍画前照片"
                  : "拍摄并检查"}
            </button>
            <button className="text-button" onClick={cancelRequest}>
              取消，返回练习
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
