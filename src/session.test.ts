import { describe, expect, it } from "vitest";
import { initialSession, sessionReducer } from "./session";
import type { Evaluation, Frame } from "./types";
const result: Evaluation = {
  verdict: "close",
  message: "接近参考",
  durationMs: 12,
};
describe("session lifecycle", () => {
  it("never applies an old result after changing the target", () => {
    const pending = sessionReducer(initialSession, { type: "begin", id: 1 });
    const changed = sessionReducer(pending, {
      type: "target",
      target: { ...pending.target, side: "left" },
    });
    const finished = sessionReducer(changed, {
      type: "result",
      id: 1,
      revision: 0,
      result,
    });
    expect(finished.result).toBeNull();
    expect(finished.baseline).toBeNull();
    expect(finished.step).toBe("setup");
  });
  it("clears baseline and feedback after a parameter change", () => {
    const current = {
      ...initialSession,
      baseline: { revision: 0 } as Frame,
      result,
      step: "wing" as const,
    };
    const changed = sessionReducer(current, {
      type: "target",
      target: { ...current.target, angle: 25 },
    });
    expect(changed.baseline).toBeNull();
    expect(changed.result).toBeNull();
    expect(changed.revision).toBe(1);
  });
  it("does not overwrite the active request on duplicate submission", () => {
    const pending = sessionReducer(initialSession, { type: "begin", id: 1 });
    expect(sessionReducer(pending, { type: "begin", id: 2 }).pending).toBe(1);
  });
  it("ignores completion after cancellation or pause", () => {
    const pending = sessionReducer(initialSession, { type: "begin", id: 1 });
    for (const type of ["cancel", "pause"] as const) {
      const changed = sessionReducer(pending, { type });
      expect(
        sessionReducer(changed, { type: "result", id: 1, revision: 0, result })
          .result,
      ).toBeNull();
    }
  });
  it("requires explicit confirmation after both checks, including a refusal", () => {
    let s = { ...initialSession, step: "wing" as const, pending: 1 };
    const checked = sessionReducer(s, {
      type: "result",
      id: 1,
      revision: 0,
      result,
    });
    expect(checked.step).toBe("wing");
    const next = sessionReducer(checked, { type: "next" });
    expect(next.step).toBe("connect");
    expect(next.result).toBeNull();
    expect(sessionReducer(next, { type: "next" }).step).toBe("connect");
    const refused = {
      ...next,
      result: { ...result, verdict: "unknown" as const },
    };
    expect(sessionReducer(refused, { type: "next" }).step).toBe("done");
  });
});

it("guidance-only progresses without fabricated results and resets to checking mode", () => {
  let s = sessionReducer(initialSession, { type: "guidance-only" });
  expect(s.step).toBe("wing");
  expect(s.baseline).toBeNull();
  expect(s.result).toBeNull();
  expect(sessionReducer(s, { type: "begin", id: 99 }).pending).toBeNull();
  s = sessionReducer(s, { type: "next" });
  expect(s.step).toBe("connect");
  s = sessionReducer(s, { type: "next" });
  expect(s.step).toBe("done");
  expect(s.result).toBeNull();
  expect(sessionReducer(s, { type: "reset" }).guidanceOnly).toBe(false);
});
