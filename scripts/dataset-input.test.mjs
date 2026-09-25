import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { parseManifest, sampleImageDataUrl } from "./dataset-input.mjs";

const directories = [];

async function manifestPath() {
  const directory = await mkdtemp(join(tmpdir(), "dataset-input-"));
  directories.push(directory);
  return join(directory, "manifest.json");
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("dataset input errors", () => {
  test("identifies a malformed manifest", async () => {
    const path = await manifestPath();
    expect(() => parseManifest('{"samples": [', path)).toThrow(
      `Invalid manifest JSON "${path}"`,
    );
  });

  test("identifies the sample, field and missing image", async () => {
    const path = await manifestPath();
    await expect(
      sampleImageDataUrl(
        path,
        { id: "sample-17", before: "missing-before.png" },
        "before",
      ),
    ).rejects.toThrow(
      'Sample "sample-17" before image "missing-before.png": file not found',
    );
  });

  test("identifies the sample, field and unsupported image", async () => {
    const path = await manifestPath();
    await writeFile(join(path, "..", "before.gif"), "not an image");
    await expect(
      sampleImageDataUrl(
        path,
        { id: "sample-23", before: "before.gif" },
        "before",
      ),
    ).rejects.toThrow(
      'Sample "sample-23" before image "before.gif": unsupported format',
    );
  });
});
