import type { Evaluation, Frame, Step, Target } from "./types";
export type Session = {
  target: Target;
  revision: number;
  step: Step;
  paused: boolean;
  baseline: Frame | null;
  result: Evaluation | null;
  currentFrame: Frame | null;
  pending: number | null;
};
export const initialSession: Session = {
  target: { side: "right", length: 0.3, angle: 20 },
  revision: 0,
  step: "setup",
  paused: false,
  baseline: null,
  result: null,
  currentFrame: null,
  pending: null,
};
export type Action =
  | { type: "target"; target: Target }
  | { type: "reset" }
  | { type: "pause" }
  | { type: "begin"; id: number }
  | { type: "baseline"; id: number; revision: number; frame: Frame }
  | {
      type: "result";
      id: number;
      revision: number;
      result: Evaluation;
      frame?: Frame;
    }
  | { type: "cancel" }
  | { type: "next" }
  | { type: "reviewed" };
export function sessionReducer(s: Session, action: Action): Session {
  switch (action.type) {
    case "target":
      return {
        ...initialSession,
        target: action.target,
        revision: s.revision + 1,
      };
    case "reset":
      return { ...initialSession, target: s.target, revision: s.revision + 1 };
    case "pause":
      return {
        ...s,
        paused: !s.paused,
        pending: null,
        result: null,
        currentFrame: null,
      };
    case "begin":
      return s.pending !== null || s.paused || s.step === "done"
        ? s
        : { ...s, pending: action.id, result: null, currentFrame: null };
    case "baseline":
      if (
        s.pending !== action.id ||
        s.revision !== action.revision ||
        action.frame.revision !== s.revision
      )
        return s;
      return {
        ...s,
        baseline: action.frame,
        step: "wing",
        pending: null,
        result: null,
        currentFrame: null,
      };
    case "result":
      if (s.pending !== action.id || s.revision !== action.revision) return s;
      if (action.frame && action.frame.revision !== s.revision) return s;
      return {
        ...s,
        pending: null,
        result: action.result,
        currentFrame: action.frame ?? null,
      };
    case "cancel":
      return { ...s, pending: null };
    case "reviewed":
      return { ...s, result: null, currentFrame: null };
    case "next":
      if (s.paused || s.pending !== null || !s.result) return s;
      return {
        ...s,
        baseline: s.step === "connect" ? null : s.baseline,
        step:
          s.step === "wing"
            ? "connect"
            : s.step === "connect"
              ? "done"
              : s.step,
        result: null,
        currentFrame: null,
      };
  }
}
