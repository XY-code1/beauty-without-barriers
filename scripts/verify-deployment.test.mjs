import { describe, expect, it } from "vitest";
import { verifyAssetResponse } from "./verify-deployment.mjs";

describe("deployment asset response validation", () => {
  it("accepts a nonempty body without Content-Length", async () => {
    await expect(
      verifyAssetResponse(new Response("model"), "model"),
    ).resolves.toBeUndefined();
  });
  it("accepts a declared nonempty asset", async () => {
    await expect(
      verifyAssetResponse(
        new Response("model", { headers: { "Content-Length": "5" } }),
        "model",
      ),
    ).resolves.toBeUndefined();
  });
  it.each([
    new Response(null),
    new Response(null, { headers: { "Content-Length": "20" } }),
    new Response("", { headers: { "Content-Length": "20" } }),
    new Response(""),
    new Response("", { headers: { "Content-Length": "0" } }),
  ])("rejects empty assets", async (response) => {
    await expect(verifyAssetResponse(response, "model")).rejects.toThrow(
      "is empty",
    );
  });
  it("rejects a 404 even with a nonempty HTML body", async () => {
    await expect(
      verifyAssetResponse(new Response("not found", { status: 404 }), "model"),
    ).rejects.toThrow("returned 404");
  });
});
