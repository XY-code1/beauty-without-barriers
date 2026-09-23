import { describe, expect, it } from "vitest";
import { acceptanceSummary } from "./acceptance.mjs";
function fixture(decisions, wrong = 0) {
  return [
    ...Array.from({ length: 10 }, () => ({
      split: "tune",
      label: "close",
      verdict: "close",
    })),
    ...Array.from({ length: 20 }, (_, i) => {
      const label = ["close", "high", "low"][i % 3];
      return {
        split: "acceptance",
        label,
        verdict:
          i >= decisions
            ? "unknown"
            : i < wrong
              ? label === "high"
                ? "low"
                : "high"
              : label,
      };
    }),
    ...Array.from({ length: 10 }, () => ({
      split: "unusable",
      label: "unknown",
      verdict: "unknown",
    })),
  ];
}
describe("real-sample acceptance math, using synthetic report records", () => {
  it("requires 16/20 decisions and at least 15 correct among those 16", () => {
    expect(acceptanceSummary(fixture(16, 1)).passed).toBe(true);
    expect(acceptanceSummary(fixture(16, 2)).passed).toBe(false);
    expect(acceptanceSummary(fixture(15)).passed).toBe(false);
  });
  it("never counts refusals as correct or uses tuning samples in accuracy", () => {
    expect(acceptanceSummary(fixture(0))).toMatchObject({
      passed: false,
      decisionRate: 0,
      rejectionRate: 1,
      conditionalAccuracy: 0,
    });
  });
  it("fails if even one unusable pair gets a definite conclusion", () => {
    const results = fixture(20);
    results.at(-1).verdict = "close";
    expect(acceptanceSummary(results)).toMatchObject({
      passed: false,
      counts: { falseConclusions: 1 },
    });
  });
  it("fails for missing samples or missing direction classes", () => {
    expect(acceptanceSummary([]).passed).toBe(false);
    const results = fixture(20).map((r) =>
      r.split === "acceptance" ? { ...r, label: "close", verdict: "close" } : r,
    );
    expect(acceptanceSummary(results).passed).toBe(false);
  });
});
