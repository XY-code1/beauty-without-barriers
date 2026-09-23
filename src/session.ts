import type { Evaluation, Frame, Step, Target } from "./types";
export type Session = {
  target: Target;
  revision: number;
  step: Step;
  paused: boolean;
  baseline: Frame | null;
  result: Evaluation | null;
  pending: number | null;
};
export const initialSession: Session = {
  target: { side: "right", length: 0.3, angle: 20 },
  revision: 0,
  step: "setup",
  paused: false,
  baseline: null,
  result: null,
  pending: null,
};
export type Action =
  | { type: "target"; target: Target }
  | { type: "reset" }
  | { type: "pause" }
  | { type: "begin"; id: number }
  | { type: "baseline"; id: number; revision: number; frame: Frame }
  | { type: "result"; id: number; revision: number; result: Evaluation }
  | { type: "cancel" }
  | { type: "next" };
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
      return { ...s, paused: !s.paused, pending: null, result: null };
    case "begin":
      return s.pending !== null || s.paused || s.step === "done"
        ? s
        : { ...s, pending: action.id, result: null };
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
      };
    case "result":
      if (s.pending !== action.id || s.revision !== action.revision) return s;
      return { ...s, pending: null, result: action.result };
    case "cancel":
      return { ...s, pending: null };
    case "next":
      if (s.paused || s.pending !== null || !s.result) return s;
      return {
        ...s,
        step:
          s.step === "wing"
            ? "connect"
            : s.step === "connect"
              ? "done"
              : s.step,
        result: null,
      };
  }
}
