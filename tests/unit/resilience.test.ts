import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, isRetryableHttp, RetryError, withRetry } from "@/lib/matching/retry";

const noSleep = () => Promise.resolve();

describe("bounded retries", () => {
  it("retries transient failures then succeeds", async () => {
    let n = 0;
    const out = await withRetry(async () => { if (n++ < 2) throw new HttpError(503, "busy"); return "ok"; }, { retries: 2, sleep: noSleep });
    expect(out).toBe("ok");
    expect(n).toBe(3);
  });
  it("gives up after the bound", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new HttpError(500, "down"); }, { retries: 2, sleep: noSleep })).rejects.toBeInstanceOf(RetryError);
    expect(n).toBe(3);
  });
  it("does not retry non-retryable client errors", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new HttpError(401, "bad key"); }, { retries: 3, shouldRetry: isRetryableHttp, sleep: noSleep })).rejects.toBeInstanceOf(RetryError);
    expect(n).toBe(1);
    expect(isRetryableHttp(new HttpError(429, "rate"))).toBe(true);
    expect(isRetryableHttp(new Error("network"))).toBe(true);
  });
});

describe("AI provider fallback", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.unstubAllGlobals(); });

  it("reports AI as unavailable without credentials (non-AI matching is used)", async () => {
    vi.stubEnv("AI_EMBEDDING_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "");
    const { aiConfig } = await import("@/lib/matching/ai");
    expect(aiConfig()).toEqual({ embeddings: false, vision: false });
  });

  it("surfaces provider failures as errors instead of fabricating embeddings", async () => {
    vi.stubEnv("AI_EMBEDDING_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response("nope", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { embedTexts } = await import("@/lib/matching/ai");
    await expect(embedTexts(["حقيبة"])).rejects.toThrow(/failed after retries/);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 bounded retries
  }, 20_000);

  it("returns embeddings in input order", async () => {
    vi.stubEnv("AI_EMBEDDING_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] })));
    const { embedTexts } = await import("@/lib/matching/ai");
    expect(await embedTexts(["a", "b"])).toEqual([[1], [2]]);
  });

  it("parses vision JSON defensively and drops unexpected fields", async () => {
    const { parseAnalysis } = await import("@/lib/matching/ai");
    const a = parseAnalysis('Here: {"description":"A black backpack","objects":["backpack",3],"colors":["black"],"contains_identity_document":false,"unsafe":"yes","name":"Ali"}');
    expect(a).toEqual({ description: "A black backpack", objects: ["backpack"], colors: ["black"], contains_identity_document: false, unsafe: false });
    expect(() => parseAnalysis("no json")).toThrow();
  });
});
