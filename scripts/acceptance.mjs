// Keep the acceptance gate independent from the vision algorithm and its tuning.
export function acceptanceSummary(results) {
  const accepted = results.filter((r) => r.split === "acceptance");
  const decided = accepted.filter((r) =>
    ["close", "high", "low"].includes(r.verdict),
  );
  const invalid = results.filter((r) => r.split === "unusable");
  const counts = {
    tune: results.filter((r) => r.split === "tune").length,
    acceptance: accepted.length,
    decided: decided.length,
    correct: decided.filter((r) => r.verdict === r.label).length,
    unusable: invalid.length,
    falseConclusions: invalid.filter((r) => r.verdict !== "unknown").length,
  };
  const decisionRate = accepted.length ? decided.length / accepted.length : 0;
  const conditionalAccuracy = decided.length
    ? counts.correct / decided.length
    : 0;
  const coveredLabels = new Set(accepted.map((r) => r.label));
  return {
    counts,
    decisionRate,
    rejectionRate: 1 - decisionRate,
    conditionalAccuracy,
    passed:
      counts.tune >= 10 &&
      counts.acceptance >= 20 &&
      decisionRate >= 0.8 &&
      conditionalAccuracy >= 0.9 &&
      counts.unusable >= 10 &&
      counts.falseConclusions === 0 &&
      ["close", "high", "low"].every((label) => coveredLabels.has(label)),
  };
}
