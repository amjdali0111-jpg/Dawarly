/** Where a notification should take the user (no private data is embedded). */
export function notificationHref(kind: string, data: Record<string, string>) {
  if (kind === "new_message" && data.conversation_id) return `/messages/${data.conversation_id}`;
  if (kind === "security_case") return "/requests?tab=security";
  if (kind === "request_received") return "/requests?tab=incoming";
  if (kind === "request_status" || kind === "handover_confirmation" || kind === "recovery_completed") return "/requests";
  if (kind === "dispute_opened") return "/admin/disputes";
  if (kind === "rating_received") return "/profile";
  if (data.report_id) return `/reports/${data.report_id}`;
  return "/notifications";
}
