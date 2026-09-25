import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ensureModel, replaceModel } from "./prepare-assets.mjs";

const directories = [];
const execFileAsync = promisify(execFile);
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

  test("keeps the previous model when replacement fails", async () => {
    const paths = await files();
    await writeFile(paths.target, "previous model");
    await writeFile(paths.temporary, "new model");
    let call = 0;
    const renameFile = async (source, destination) => {
      call += 1;
      if (call === 1)
        throw Object.assign(new Error("destination exists"), {
          code: "EEXIST",
        });
      if (call === 3)
        throw Object.assign(new Error("disk failure"), { code: "EIO" });
      return rename(source, destination);
    };

    await expect(
      replaceModel(
        paths.temporary,
        paths.target,
        digest("new model"),
        renameFile,
      ),
    ).rejects.toThrow("disk failure");
    await expect(readFile(paths.target, "utf8")).resolves.toBe(
      "previous model",
    );
  });

  test("concurrent preparations use independent temporary files", async () => {
    const paths = await files();
    const model = Buffer.from("replacement model");
    await writeFile(paths.target, "damaged");
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => new Response(model));

    await Promise.all([
      ensureModel({
        target: paths.target,
        fetchImpl,
        expectedSha256: digest(model),
      }),
      ensureModel({
        target: paths.target,
        fetchImpl,
        expectedSha256: digest(model),
      }),
    ]);

    await expect(readFile(paths.target)).resolves.toEqual(model);
    expect(await readdir(new URL("./", paths.target))).toEqual([
      "face_landmarker.task",
    ]);
  });

  test("does not restore a backup over a concurrent valid install", async () => {
    const paths = await files();
    const replacement = Buffer.from("valid concurrent model");
    await writeFile(paths.target, "previous model");
    await writeFile(paths.temporary, "new model");
    let call = 0;
    const renameFile = async (source, destination) => {
      call += 1;
      if (call === 1)
        throw Object.assign(new Error("destination exists"), {
          code: "EEXIST",
        });
      if (call === 3)
        throw Object.assign(new Error("disk failure"), { code: "EIO" });
      return rename(source, destination);
    };
    const linkFile = async (source, destination) => {
      await writeFile(paths.target, replacement);
      throw Object.assign(new Error("peer installed target"), {
        code: "EEXIST",
      });
    };

    await expect(
      replaceModel(
        paths.temporary,
        paths.target,
        digest(replacement),
        renameFile,
        linkFile,
      ),
    ).resolves.toBeUndefined();
    await expect(readFile(paths.target)).resolves.toEqual(replacement);
    expect(await readdir(new URL("./", paths.target))).toEqual([
      "face_landmarker.task",
      "face_landmarker.task.tmp",
    ]);
  });

  test("can be imported without process.argv[1]", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          "delete process.argv[1]; await import('./scripts/prepare-assets.mjs')",
        ],
        { cwd: new URL("../", import.meta.url) },
      ),
    ).resolves.toMatchObject({ stderr: "" });
  });
});
