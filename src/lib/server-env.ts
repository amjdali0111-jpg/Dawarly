import "server-only";

// Server-only secrets. Never import this module from a client component.
export const serverEnv = {
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  // AI (all optional; without them the app uses non-AI matching)
  aiEmbeddingProvider: (process.env.AI_EMBEDDING_PROVIDER ?? "none") as "openai" | "none",
  aiEmbeddingModel: process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  aiVisionProvider: (process.env.AI_VISION_PROVIDER ?? "none") as "openai" | "anthropic" | "none",
  aiVisionModel: process.env.AI_VISION_MODEL ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiBaseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Email
  emailProvider: (process.env.EMAIL_PROVIDER ?? "console") as "resend" | "console" | "none",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "Dawarly <no-reply@example.com>",
};
