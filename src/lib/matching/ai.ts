import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/server-env";
import { HttpError, isRetryableHttp, withRetry } from "./retry";

/**
 * Configurable AI providers. Credentials stay on the server.
 *  - Text embeddings: any OpenAI-compatible /embeddings endpoint (multilingual
 *    models such as text-embedding-3-small handle Arabic and English).
 *  - Image analysis: OpenAI-compatible vision chat, or Anthropic Claude.
 * Every call uses bounded retries; callers fall back to non-AI matching when
 * a provider is unavailable and never fabricate results.
 */

export interface ImageAnalysis {
  description: string;
  objects: string[];
  colors: string[];
  contains_identity_document: boolean;
  unsafe: boolean;
}

export const aiConfig = () => ({
  embeddings: serverEnv.aiEmbeddingProvider === "openai" && Boolean(serverEnv.openaiApiKey),
  vision:
    (serverEnv.aiVisionProvider === "openai" && Boolean(serverEnv.openaiApiKey)) ||
    (serverEnv.aiVisionProvider === "anthropic" && Boolean(serverEnv.anthropicApiKey)),
});

const TIMEOUT_MS = 20_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new HttpError(res.status, `AI provider HTTP ${res.status}`);
  return res.json();
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!aiConfig().embeddings) throw new Error("embeddings not configured");
  const json = await withRetry(
    () => postJson(`${serverEnv.openaiBaseUrl}/embeddings`, { authorization: `Bearer ${serverEnv.openaiApiKey}` }, {
      model: serverEnv.aiEmbeddingModel,
      input: texts,
    }),
    { retries: 2, shouldRetry: isRetryableHttp },
  );
  const data = (json as { data?: Array<{ embedding: number[]; index: number }> }).data;
  if (!Array.isArray(data) || data.length !== texts.length) throw new Error("invalid embeddings response");
  return data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

const VISION_PROMPT = `You help a university lost-and-found service. Look at the photo of a lost or found item and answer with JSON only:
{"description": string (one neutral English sentence describing the item: type, brand if visible, material, notable marks),
 "objects": string[] (main item types, English, lowercase),
 "colors": string[] (main colors, English, lowercase),
 "contains_identity_document": boolean (true if the photo shows an ID card, passport, bank card or similar personal document),
 "unsafe": boolean (true only for clearly inappropriate content such as nudity, gore or hate symbols)}
Never transcribe names, numbers, addresses or other personal data visible in the photo.`;

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    objects: { type: "array", items: { type: "string" } },
    colors: { type: "array", items: { type: "string" } },
    contains_identity_document: { type: "boolean" },
    unsafe: { type: "boolean" },
  },
  required: ["description", "objects", "colors", "contains_identity_document", "unsafe"],
  additionalProperties: false,
};

export function parseAnalysis(raw: string): ImageAnalysis {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in vision response");
  const v = JSON.parse(raw.slice(start, end + 1)) as Partial<ImageAnalysis>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, 10) : []);
  if (typeof v.description !== "string") throw new Error("invalid vision response");
  return {
    description: v.description.slice(0, 400),
    objects: strings(v.objects),
    colors: strings(v.colors),
    contains_identity_document: v.contains_identity_document === true,
    unsafe: v.unsafe === true,
  };
}

type ImageMime = "image/jpeg" | "image/png" | "image/webp";

let anthropic: Anthropic | undefined;

async function analyzeWithAnthropic(base64: string, mime: ImageMime) {
  anthropic ??= new Anthropic({ apiKey: serverEnv.anthropicApiKey, timeout: 60_000, maxRetries: 2 });
  const response = await anthropic.beta.messages.create({
    model: serverEnv.aiVisionModel || "claude-opus-5-5",
    max_tokens: 4000,
    // On a safety decline the API re-runs the request on a fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: ANALYSIS_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
          { type: "text", text: VISION_PROMPT },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("vision request declined");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return parseAnalysis(text);
}

async function analyzeWithOpenAi(base64: string, mime: ImageMime) {
  const json = await withRetry(
    () => postJson(`${serverEnv.openaiBaseUrl}/chat/completions`, { authorization: `Bearer ${serverEnv.openaiApiKey}` }, {
      model: serverEnv.aiVisionModel || "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: VISION_PROMPT },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
    }),
    { retries: 2, shouldRetry: isRetryableHttp },
  );
  const text = (json as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? "";
  return parseAnalysis(text);
}

export async function analyzeImage(bytes: Uint8Array, mime: string): Promise<ImageAnalysis> {
  const safeMime: ImageMime = mime === "image/png" || mime === "image/webp" ? mime : "image/jpeg";
  const base64 = Buffer.from(bytes).toString("base64");
  if (serverEnv.aiVisionProvider === "anthropic") return analyzeWithAnthropic(base64, safeMime);
  if (serverEnv.aiVisionProvider === "openai") return analyzeWithOpenAi(base64, safeMime);
  throw new Error("vision not configured");
}
