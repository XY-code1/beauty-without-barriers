import { readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";

export function parseManifest(text, manifestPath) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Invalid manifest JSON "${manifestPath}": ${error.message}`,
      {
        cause: error,
      },
    );
  }
}

export async function sampleImageDataUrl(manifestPath, sample, field) {
  const relative = sample[field];
  const path = resolve(dirname(manifestPath), relative);
  const extension = extname(path).toLowerCase();
  const context = `Sample "${sample.id}" ${field} image "${relative}"`;
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension))
    throw new Error(`${context}: unsupported format; use PNG/JPG/WebP`);

  let bytes;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(`${context}: file not found at "${path}"`, {
        cause: error,
      });
    throw new Error(`${context}: could not read "${path}": ${error.message}`, {
      cause: error,
    });
  }
  const type =
    extension === ".jpg" || extension === ".jpeg" ? "jpeg" : extension.slice(1);
  return `data:image/${type};base64,${bytes.toString("base64")}`;
}
