import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { acceptanceSummary } from "./acceptance.mjs";
import { parseManifest, sampleImageDataUrl } from "./dataset-input.mjs";

const file = process.argv[2];
if (!file) {
  console.error(
    "NOT RUN: 尚未提供真实样本。用法：npm run test:vision -- samples/private/manifest.json。格式见 docs/testing.md。",
  );
  process.exit(2);
}
const manifestPath = resolve(file),
  data = parseManifest(await readFile(manifestPath, "utf8"), manifestPath);
const samples = data.samples;
if (!Array.isArray(samples) || !samples.length)
  throw new Error("manifest.samples must be a non-empty array");
const ids = new Set(),
  participants = { tune: new Set(), acceptance: new Set() };
for (const sample of samples) {
  if (
    !sample.id ||
    ids.has(sample.id) ||
    !sample.participant ||
    !["tune", "acceptance", "unusable"].includes(sample.split) ||
    !["close", "high", "low", "unknown"].includes(sample.label) ||
    !sample.before ||
    !sample.after ||
    !["left", "right"].includes(sample.side) ||
    !Number.isFinite(sample.angle) ||
    !Number.isFinite(sample.length)
  )
    throw new Error(`Invalid sample: ${sample.id}`);
  if ((sample.split === "unusable") !== (sample.label === "unknown"))
    throw new Error(
      "Unusable samples require unknown labels; clear samples require direction labels.",
    );
  ids.add(sample.id);
  participants[sample.split]?.add(sample.participant);
}
for (const person of participants.tune)
  if (participants.acceptance.has(person))
    throw new Error(
      `Participant leakage between tune and acceptance: ${person}`,
    );
const server = await createServer({
  server: { host: "127.0.0.1", port: 5181, strictPort: true },
  logLevel: "error",
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    channel: process.env.PW_CHANNEL || undefined,
  });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5181");
  const results = [];
  for (const sample of samples) {
    const urls = await Promise.all(
      ["before", "after"].map((field) =>
        sampleImageDataUrl(manifestPath, sample, field),
      ),
    );
    const started = performance.now();
    const output = await page.evaluate(
      async ({ urls, sample }) => {
        const { evaluatePair } = await import("/src/analysis/batch.ts");
        return evaluatePair(urls[0], urls[1], {
          side: sample.side,
          angle: sample.angle,
          length: sample.length,
        });
      },
      { urls, sample },
    );
    results.push({
      id: sample.id,
      participant: sample.participant,
      split: sample.split,
      label: sample.label,
      ...output,
      pipelineMs: performance.now() - started,
    });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    algorithm: "wing-difference-v1",
    scope:
      "Operator-supplied dataset; origin and labels require human verification; controlled demo only",
    ...acceptanceSummary(results),
    results,
  };
  const outputPath = resolve(dirname(manifestPath), "report.json");
  await writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        report: outputPath,
        counts: report.counts,
        passed: report.passed,
        conditionalAccuracy: report.conditionalAccuracy,
      },
      null,
      2,
    ),
  );
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
