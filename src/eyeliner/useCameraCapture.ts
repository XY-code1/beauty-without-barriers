import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
} from "react";
import { baselineIssue, evaluateFrames } from "../analysis/evaluate";
import { loadOpenCV } from "../analysis/opencv";
import type { Action, Session } from "../session";
import type { Target, VisionOutput } from "../types";
import { Camera, waitForCapture } from "../vision/camera";

export type CaptureIntent = "baseline" | "check";

export function useCameraCapture(
  session: Session,
  dispatch: Dispatch<Action>,
  onEngagementChange: (active: boolean) => void,
) {
  const latest = useRef(session);
  latest.current = session;
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [cameraStatus, setCameraStatus] = useState<
    "off" | "loading" | "on" | "error"
  >("off");
  const [vision, setVision] = useState<VisionOutput | null>(null);
  const [error, setError] = useState("");
  const [intent, setIntent] = useState<CaptureIntent | null>(null);
  const [uncovered, setUncovered] = useState(false);
  const [progress, setProgress] = useState("");
  const serial = useRef(0);
  const busy = useRef(false);
  const requestAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    onEngagementChange(
      cameraStatus === "loading" ||
        cameraStatus === "on" ||
        session.baseline !== null,
    );
    return () => onEngagementChange(false);
  }, [cameraStatus, session.baseline, onEngagementChange]);

  function cancelRequest() {
    requestAbort.current?.abort();
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

  function resumeCamera() {
    if (cameraRef.current) cameraRef.current.paused = false;
    setVision(null);
  }

  function requestCapture(kind: CaptureIntent) {
    if (busy.current || latest.current.guidanceOnly) return;
    setError("");
    setUncovered(false);
    setProgress("");
    setIntent(kind);
  }

  async function capture() {
    if (busy.current || !intent || !uncovered || !cameraRef.current) return;
    busy.current = true;
    const controller = new AbortController();
    requestAbort.current = controller;
    const id = ++serial.current;
    const revision = session.revision;
    const target = { ...session.target };
    const kind = intent;
    const baseline = session.baseline;
    dispatch({ type: "begin", id });
    try {
      for (const label of ["保持正视 · 3", "保持正视 · 2", "保持正视 · 1"]) {
        setProgress(label);
        await waitForCapture(1000, controller.signal);
        if (serial.current !== id) return;
      }
      setProgress("正在选择清晰画面…");
      const frame = await cameraRef.current.captureBest(
        target,
        revision,
        controller.signal,
      );
      if (serial.current !== id) return;
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
            frame,
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
        dispatch({ type: "result", id, revision, result, frame });
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
        requestAbort.current?.abort();
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
      requestAbort.current?.abort();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [dispatch]);

  useEffect(() => {
    if (session.step !== "done") return;
    cameraRef.current?.stop();
    cameraRef.current = null;
    setCameraStatus("off");
    setVision(null);
  }, [session.step]);

  return {
    videoRef: videoRef as RefObject<HTMLVideoElement>,
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
    requestCapture,
    capture,
  };
}
