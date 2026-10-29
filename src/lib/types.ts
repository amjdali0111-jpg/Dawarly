export type Role = "user" | "security" | "university_admin" | "global_admin";
export type MemberType = "student" | "employee" | "faculty";
export type ReportType = "lost" | "found";
export type ReportStatus = "active" | "under_review" | "expired" | "closed" | "recovered" | "removed";
export type RequestStatus =
  | "pending" | "security_review" | "accepted" | "rejected" | "withdrawn" | "completed" | "failed" | "disputed" | "cancelled";
export type HandoverMethod = "direct" | "security";
export type MatchDecision = "pending" | "confirmed" | "dismissed";

export interface University {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  center_lat: number | null;
  center_lng: number | null;
  is_active: boolean;
}

export interface Profile {
  id: string;
  university_id: string;
  full_name: string;
  avatar_path: string | null;
  member_type: MemberType;
  role: Role;
  faculty: string | null;
  academic_year: number | null;
  created_at: string;
  deleted_at?: string | null;
}

export interface Category {
  id: string;
  university_id: string | null;
  slug: string;
  name_en: string;
  name_ar: string;
  icon: string;
  is_sensitive: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface Report {
  id: string;
  university_id: string;
  owner_id: string;
  type: ReportType;
  item_name: string;
  description: string;
  category_id: string;
  color: string;
  distinguishing_features: string;
  location_text: string;
  approx_lat: number | null;
  approx_lng: number | null;
  event_date: string;
  event_time: string | null;
  status: ReportStatus;
  is_sensitive: boolean;
  expires_at: string;
  renewal_count: number;
  ai_status: "pending" | "done" | "failed" | "skipped";
  created_at: string;
  updated_at: string;
}

export const REPORT_COLUMNS =
  "id, university_id, owner_id, type, item_name, description, category_id, color, distinguishing_features, location_text, approx_lat, approx_lng, event_date, event_time, status, is_sensitive, expires_at, renewal_count, ai_status, created_at, updated_at";

export interface RecoveryRequest {
  id: string;
  university_id: string;
  report_id: string;
  requester_id: string;
  match_id: string | null;
  item_owner_id: string;
  finder_id: string;
  message: string | null;
  verification_answer: string | null;
  status: RequestStatus;
  is_sensitive: boolean;
  handover_method: HandoverMethod | null;
  handover_details: string | null;
  owner_confirmed_at: string | null;
  finder_confirmed_at: string | null;
  security_confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MatchSuggestion {
  id: string;
  university_id: string;
  lost_report_id: string;
  found_report_id: string;
  score: number;
  components: Record<string, number | null>;
  reasons: string[];
  method: "ai" | "heuristic";
  lost_decision: MatchDecision;
  found_decision: MatchDecision;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  kind: string;
  data: Record<string, string>;
  read_at: string | null;
  created_at: string;
}
