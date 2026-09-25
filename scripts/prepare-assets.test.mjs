import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ensureModel } from "./prepare-assets.mjs";

const directories = [];
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function files() {
  const directory = await mkdtemp(join(tmpdir(), "prepare-assets-"));
  directories.push(directory);
  return {
    target: pathToFileURL(join(directory, "face_landmarker.task")),
    temporary: pathToFileURL(join(directory, "face_landmarker.task.tmp")),
  };
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("ensureModel", () => {
  test("keeps a model with the expected digest", async () => {
    const paths = await files();
    const model = Buffer.from("valid model");
    await writeFile(paths.target, model);
    const fetchImpl = vi.fn();

    await expect(
      ensureModel({
        ...paths,
        fetchImpl,
        expectedSha256: digest(model),
      }),
    ).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("replaces a damaged model after verifying the download", async () => {
    const paths = await files();
    const model = Buffer.from("valid replacement");
    await writeFile(paths.target, "damaged");

    await expect(
      ensureModel({
        ...paths,
        fetchImpl: vi.fn().mockResolvedValue(new Response(model)),
        expectedSha256: digest(model),
      }),
    ).resolves.toBe(true);
    await expect(readFile(paths.target)).resolves.toEqual(model);
  });

  test("reports download failure and removes a stale temporary file", async () => {
    const paths = await files();
    await writeFile(paths.temporary, "partial download");

    await expect(
      ensureModel({
        ...paths,
        fetchImpl: vi
          .fn()
          .mockResolvedValue(new Response(null, { status: 503 })),
      }),
    ).rejects.toThrow("Model download failed: 503");
    await expect(readFile(paths.temporary)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
