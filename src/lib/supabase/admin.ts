import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";

/**
 * Service-role client. Bypasses RLS — use only in trusted server code for
 * system tasks (AI matching, email outbox, cron, account deletion) and always
 * scope queries explicitly by university.
 */
export function getServiceSupabase() {
  if (!serverEnv.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient(publicEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const hasServiceRole = () => Boolean(serverEnv.supabaseServiceRoleKey && publicEnv.supabaseUrl);
