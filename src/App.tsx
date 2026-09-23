import { useEffect, useReducer, useRef, useState } from "react";
import { Camera } from "./vision/camera";
import GuideCanvas from "./guidance/GuideCanvas";
import type { GuideMode } from "./guidance/render";
import { initialSession, sessionReducer } from "./session";
import { loadOpenCV } from "./analysis/opencv";
import { baselineIssue, evaluateFrames } from "./analysis/evaluate";
import type { Evaluation, Target, VisionOutput } from "./types";

const steps = ["确认路径", "画眼尾", "连接外段", "完成练习"];
const stepIndex = { setup: 0, wing: 1, connect: 2, done: 3 };
function EyeIcon({ large = false }: { large?: boolean }) {
  return (
    <svg
      width={large ? 110 : 32}
      height={large ? 65 : 22}
      viewBox="0 0 110 65"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 35C25 7 66 5 91 32M7 35C32 58 70 56 91 32M91 32L105 13"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M48 19C30 37 57 56 67 36"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M76 20L99 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function App() {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const latest = useRef(session);
  latest.current = session;
  const videoRef = useRef<HTMLVideoElement>(null);
  const guidanceRef = useRef<HTMLElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [cameraStatus, setCameraStatus] = useState<
    "off" | "loading" | "on" | "error"
  >("off");
  const [vision, setVision] = useState<VisionOutput | null>(null);
  const [error, setError] = useState("");
  const [showGuide, setShowGuide] = useState(true),
    [mirror, setMirror] = useState(true);
  const [guideMode, setGuideMode] = useState<GuideMode>("guide");
  const [intent, setIntent] = useState<"baseline" | "check" | null>(null);
  const [uncovered, setUncovered] = useState(false),
    [progress, setProgress] = useState("");
  const [review, setReview] = useState(false);
  const serial = useRef(0),
    busy = useRef(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const returnFocus = useRef<HTMLElement | null>(null);

  function cancelRequest() {
    serial.current++;
    busy.current = false;
    setIntent(null);
    setProgress("");
    setUncovered(false);
    dispatch({ type: "cancel" });
  }
  function stopCamera() {
    cancelRequest();
    cameraRef.current?.stop();
    cameraRef.current = null;
    setCameraStatus("off");
    setVision(null);
    dispatch({ type: "reset" });
  }
  async function startCamera() {
    if (!videoRef.current || cameraStatus === "loading") return;
    stopCamera();
    setError("");
    setCameraStatus("loading");
    const camera = new Camera(videoRef.current, setVision, (message) => {
      if (cameraRef.current !== camera) return;
      cancelRequest();
      setVision(null);
      setError(message);
      setCameraStatus("error");
      dispatch({ type: "reset" });
    });
    camera.side = latest.current.target.side;
    cameraRef.current = camera;
    try {
      await camera.start();
      if (cameraRef.current === camera) setCameraStatus("on");
    } catch (e) {
      if (cameraRef.current === camera) {
        setError(e instanceof Error ? e.message : "摄像头启动失败，请重试。");
        setCameraStatus("error");
      }
    }
  }
  function changeTarget(target: Target) {
    cancelRequest();
    setError("");
    setVision(null);
    dispatch({ type: "target", target });
    if (cameraRef.current) cameraRef.current.side = target.side;
  }
  function togglePause() {
    cancelRequest();
    setVision(null);
    if (cameraRef.current) cameraRef.current.paused = !session.paused;
    dispatch({ type: "pause" });
  }
  function requestCapture(kind: "baseline" | "check") {
    if (busy.current) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError("");
    setUncovered(false);
    setProgress("");
    setIntent(kind);
  }
  async function capture() {
    if (busy.current || !intent || !uncovered || !cameraRef.current) return;
    busy.current = true;
    const id = ++serial.current,
      revision = session.revision,
      target = { ...session.target };
    const kind = intent,
      baseline = session.baseline;
    dispatch({ type: "begin", id });
    try {
      // Let the user return their gaze after tapping; cancel on any session change.
      for (const label of ["保持正视 · 2", "保持正视 · 1"]) {
        setProgress(label);
        await new Promise<void>((resolve) => {
          pendingTimer.current = setTimeout(resolve, 650);
        });
        if (serial.current !== id) return;
      }
      const frame = cameraRef.current.capture(target, revision);
      setProgress(kind === "baseline" ? "检查基准画面…" : "正在分析眼尾…");
      let cv;
      try {
        cv = await loadOpenCV();
      } catch {
        if (serial.current !== id) return;
        if (kind === "baseline") {
          dispatch({ type: "baseline", id, revision, frame });
          setError(
            "已采集基准图；分析暂不可用。仍可跟随参考线练习，在检查时重试加载。",
          );
        } else {
          dispatch({
            type: "result",
            id,
            revision,
            result: {
              verdict: "unknown",
              message: "分析暂不可用",
              reason: "分析组件加载失败，可重试；本次没有方向结论。",
              durationMs: 0,
            },
          });
        }
        return;
      }
      if (serial.current !== id) return;
      if (kind === "baseline") {
        const issue = baselineIssue(cv, frame);
        if (issue) throw new Error(issue);
        dispatch({ type: "baseline", id, revision, frame });
      } else if (baseline) {
        const result = evaluateFrames(cv, baseline, frame);
        dispatch({ type: "result", id, revision, result });
      } else throw new Error("缺少基准图，请重新开始练习。");
    } catch (e) {
      if (serial.current !== id) return;
      const reason =
        e instanceof Error ? e.message : "没有可用关键帧，请重拍。";
      if (kind === "check")
        dispatch({
          type: "result",
          id,
          revision,
          result: {
            verdict: "unknown",
            message: "这次无法判断",
            reason,
            durationMs: 0,
          },
        });
      else {
        setError(reason);
        dispatch({ type: "cancel" });
      }
    } finally {
      if (serial.current === id) {
        busy.current = false;
        setIntent(null);
        setProgress("");
        setUncovered(false);
      }
    }
  }

  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        serial.current++;
        busy.current = false;
        setIntent(null);
        setVision(null);
        dispatch({ type: "cancel" });
        if (cameraRef.current) cameraRef.current.paused = true;
      } else if (cameraRef.current)
        cameraRef.current.paused = latest.current.paused;
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      serial.current++;
      cameraRef.current?.stop();
      clearTimeout(pendingTimer.current);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(() => {
    if (intent)
      document
        .querySelector<HTMLInputElement>(".capture-dialog input")
        ?.focus();
    else returnFocus.current?.focus();
  }, [intent]);
  useEffect(() => {
    if (session.step !== "setup" && matchMedia("(max-width: 680px)").matches) {
      guidanceRef.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    }
    if (session.step === "wing" || session.step === "connect")
      setGuideMode("guide");
  }, [session.step]);

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
    <div className="app-shell">
      <header className="header" inert={!!intent}>
        <a className="brand" href="./" aria-label="无界美妆首页">
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
            <h1>
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
          <section className="mirror-card" aria-label="摄像头与参考路径">
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
                    <span>↗</span>
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
            <div className="detail-heading">
              <span>看懂形状，再落笔</span>
              <small>{active ? "眼部放大" : "形状示意 · 非实时"}</small>
            </div>
            <div className="guide-modes" role="group" aria-label="参考显示方式">
              <button
                aria-pressed={guideMode === "guide"}
                onClick={() => {
                  setGuideMode("guide");
                  setShowGuide(true);
                }}
              >
                分步轮廓
              </button>
              <button
                aria-pressed={guideMode === "preview"}
                onClick={() => {
                  setGuideMode("preview");
                  setShowGuide(true);
                }}
              >
                妆效预览
              </button>
            </div>
            <div className="detail-view">
              <GuideCanvas
                video={videoRef}
                vision={visible ? vision : null}
                target={session.target}
                step={session.step}
                mode={guideMode}
                mirror={mirror}
                showGuide={showGuide}
                detail
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
            <p className="detail-legend" aria-live="polite">
              {!showGuide
                ? "参考轮廓已隐藏，可观察原始画面。"
                : guideMode === "preview"
                  ? "半透明轮廓仅示意形状，实际妆效取决于产品与操作。"
                  : session.step === "done"
                    ? "练习结束，可切换妆效预览回看目标形状。"
                    : session.step === "connect"
                      ? "起：眼睑外段 → 收：外眼角；浅绿是这一笔。"
                      : "起：外眼角 → 收：眼尾尖；浅绿轮廓是参考填充区域。"}
            </p>
            {session.step === "setup" ? (
              <>
                <div className="card-title">
                  <span className="eyebrow">YOUR LOOK</span>
                  <span className="small-pill">初次练习</span>
                </div>
                <h2>选择你的自然眼线</h2>
                <p className="subtext">
                  轻微延长、自然上扬，从简单的样式开始。
                </p>
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
                <label className="slider-label" htmlFor="length">
                  眼尾长度
                  <span>{Math.round(session.target.length * 100)}% 眼宽</span>
                </label>
                <input
                  id="length"
                  type="range"
                  min="0.18"
                  max="0.45"
                  step="0.01"
                  value={session.target.length}
                  onChange={(e) =>
                    changeTarget({
                      ...session.target,
                      length: Number(e.target.value),
                    })
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
                    changeTarget({
                      ...session.target,
                      angle: Number(e.target.value),
                    })
                  }
                />
                <div className="range-hints">
                  <span>柔和</span>
                  <span>上扬</span>
                </div>
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
                  onClick={() => requestCapture("baseline")}
                >
                  确认路径，采集基准图 <span>→</span>
                </button>
                <p className="button-note">
                  请在画眼线前采集；已画过时需先卸除。
                </p>
              </>
            ) : session.step === "done" ? (
              <div className="completion">
                <div className="completion-mark">✓</div>
                <p className="eyebrow">ONE SMALL STEP</p>
                <h2>这一侧，练习完成。</h2>
                <p>
                  留意刚刚最顺手的那一步，
                  <br />
                  下一次从那里找回感觉。
                </p>
                <div className="why">
                  <p>
                    完成表示你走完了指导流程。
                    <br />
                    本次检查仅关注眼尾方向，不评价完整妆效。
                  </p>
                </div>
                <button
                  className="primary full"
                  onClick={() => {
                    cancelRequest();
                    dispatch({ type: "reset" });
                  }}
                >
                  再练一次 <span>↗</span>
                </button>
              </div>
            ) : (
              <>
                <div className="card-title">
                  <span className="eyebrow">STEP 0{currentStep}</span>
                  <span className="small-pill">
                    {session.target.side === "right" ? "右眼" : "左眼"} ·
                    自然眼线
                  </span>
                </div>
                <h2>
                  {session.step === "wing"
                    ? "先画一小段眼尾"
                    : "轻轻连接眼睑外段"}
                </h2>
                <ol className="instructions">
                  <li>
                    {session.step === "wing"
                      ? "从“起”向“收”轻画短线，沿参考轮廓逐渐收尖。"
                      : "从眼睑外段的“起”点，用短笔触连接到外眼角。"}
                  </li>
                  <li>按自己的节奏操作，可以随时暂停。</li>
                  <li>移开手，正视镜头，再点击检查。</li>
                </ol>
                <button
                  className="text-button"
                  onClick={() => setReview(!review)}
                >
                  {review ? "收起提示 ↑" : "重看这一步的提示 ↗"}
                </button>
                {review && (
                  <p className="review-note">
                    {session.step === "wing"
                      ? "放大画面中的“起”是外眼角，“收”是眼尾尖。沿箭头方向先轻画短线，再少量填充轮廓；靠近尖端时逐渐收细。"
                      : "本步只突出眼睑外段，浅色眼尾作为已画部分的参照。把两段轻轻连起来；本次检查仍只看眼尾方向，不检查粗细或连接是否连续。"}
                  </p>
                )}
                {session.result && <Feedback result={session.result} />}
                <div className="practice-actions">
                  <button className="secondary" onClick={togglePause}>
                    {session.paused ? "继续练习" : "暂停"}
                  </button>
                  <button
                    className="primary"
                    disabled={!canCapture || session.pending !== null}
                    onClick={() => requestCapture("check")}
                  >
                    {session.result ? "重新检查" : "检查这一步"} <span>↗</span>
                  </button>
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
                  每次只检查眼尾方向，结果不会自动推进步骤。
                </p>
                <button
                  className="text-button reset"
                  onClick={() => {
                    cancelRequest();
                    dispatch({ type: "reset" });
                    if (cameraRef.current) cameraRef.current.paused = false;
                    setVision(null);
                  }}
                >
                  重新选择侧别或调整路径
                </button>
              </>
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
                  ? "采集基准图"
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
