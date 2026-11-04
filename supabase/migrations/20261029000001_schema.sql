-- =============================================================================
-- Dawarly (FindIt) — core schema
-- Multi-university lost & found. Every university-scoped row carries
-- university_id; access is enforced by RLS (see 0002) and SECURITY DEFINER
-- workflow functions (see 0003). Clients never write privileged columns.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('user', 'security', 'university_admin', 'global_admin');
create type public.member_type as enum ('student', 'employee', 'faculty');
create type public.report_type as enum ('lost', 'found');
create type public.report_status as enum ('active', 'under_review', 'expired', 'closed', 'recovered', 'removed');
create type public.request_status as enum (
  'pending',          -- waiting for the report owner
  'security_review',  -- sensitive item: waiting for university security
  'accepted',         -- handover arranged, waiting for confirmations
  'rejected',
  'withdrawn',
  'completed',        -- both relevant parties confirmed the handover
  'failed',           -- a party reported that the handover did not happen
  'disputed',
  'cancelled'         -- closed because another request completed / report closed
);
create type public.handover_method as enum ('direct', 'security');
create type public.match_decision as enum ('pending', 'confirmed', 'dismissed');
create type public.match_method as enum ('ai', 'heuristic');
create type public.ai_status as enum ('pending', 'done', 'failed', 'skipped');
create type public.abuse_target as enum ('report', 'user', 'message', 'conversation', 'rating');
create type public.case_status as enum ('open', 'actioned', 'dismissed');
create type public.sanction_kind as enum ('warning', 'temporary_restriction', 'escalation', 'lifted');
create type public.email_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped');

-- ---------------------------------------------------------------------------
-- Universities
-- ---------------------------------------------------------------------------
create table public.universities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name_en text not null check (char_length(name_en) between 2 and 160),
  name_ar text not null check (char_length(name_ar) between 2 and 160),
  -- Optional campus centre used to centre maps.
  center_lat double precision check (center_lat between -90 and 90),
  center_lng double precision check (center_lng between -180 and 180),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user). Intentionally no FK to auth.users: when an
-- account is deleted the profile row is anonymised and kept so that retained
-- records (closed reports, completed recoveries, other people's chat history)
-- stay consistent. See handle_deleted_user().
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key,
  university_id uuid not null references public.universities(id),
  full_name text not null check (char_length(full_name) between 2 and 120),
  avatar_path text,
  member_type public.member_type not null default 'student',
  role public.app_role not null default 'user',
  faculty text check (faculty is null or char_length(faculty) <= 120),
  academic_year smallint check (academic_year is null or academic_year between 1 and 10),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_university_idx on public.profiles (university_id);
create index profiles_role_idx on public.profiles (university_id, role);

-- Private per-user state: only the user and their university admins can read.
create table public.profile_private (
  id uuid primary key references public.profiles(id) on delete cascade,
  university_id uuid not null references public.universities(id),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  email_notifications boolean not null default true,
  restricted_until timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Categories. university_id null = platform default category.
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  name_en text not null check (char_length(name_en) between 2 and 80),
  name_ar text not null check (char_length(name_ar) between 2 and 80),
  icon text not null default 'package',
  is_sensitive boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  unique nulls not distinct (university_id, slug)
);

-- Reference data (not demo data): platform default categories.
insert into public.categories (slug, name_en, name_ar, icon, is_sensitive, sort_order) values
  ('electronics', 'Electronics', 'إلكترونيات', 'smartphone', true, 10),
  ('ids-cards', 'IDs & cards', 'هويات وبطاقات', 'id-card', true, 20),
  ('wallets', 'Wallets & money', 'محافظ ونقود', 'wallet', true, 30),
  ('keys', 'Keys', 'مفاتيح', 'key', false, 40),
  ('bags', 'Bags', 'حقائب', 'backpack', false, 50),
  ('clothing', 'Clothing', 'ملابس', 'shirt', false, 60),
  ('books', 'Books & stationery', 'كتب وقرطاسية', 'book', false, 70),
  ('jewelry', 'Jewelry & watches', 'مجوهرات وساعات', 'gem', true, 80),
  ('accessories', 'Accessories', 'إكسسوارات', 'glasses', false, 90),
  ('other', 'Other', 'أخرى', 'package', false, 1000);

-- ---------------------------------------------------------------------------
-- Reports (lost and found share one table and one workflow)
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  owner_id uuid not null references public.profiles(id),
  type public.report_type not null,
  item_name text not null check (char_length(item_name) between 2 and 120),
  description text not null check (char_length(description) between 10 and 2000),
  category_id uuid not null references public.categories(id),
  color text not null check (char_length(color) between 2 and 60),
  distinguishing_features text not null check (char_length(distinguishing_features) between 3 and 1000),
  location_text text not null check (char_length(location_text) between 2 and 200),
  -- Approximate (rounded ~100 m) coordinates, safe to show to university members.
  approx_lat double precision check (approx_lat between -90 and 90),
  approx_lng double precision check (approx_lng between -180 and 180),
  event_date date not null,
  event_time time,
  status public.report_status not null default 'active',
  is_sensitive boolean not null default false,
  sensitive_reason text,
  expires_at timestamptz not null default now() + interval '14 days',
  renewal_count int not null default 0,
  closed_at timestamptz,
  recovered_at timestamptz,
  -- AI processing state (written by the server with the service role only)
  ai_status public.ai_status not null default 'pending',
  ai_attempts smallint not null default 0,
  ai_processed_at timestamptz,
  embedding double precision[],
  embedding_model text,
  search tsvector generated always as (
    to_tsvector('simple',
      coalesce(item_name, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(color, '') || ' ' || coalesce(distinguishing_features, '') || ' ' ||
      coalesce(location_text, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_university_status_idx on public.reports (university_id, status, type, created_at desc);
create index reports_owner_idx on public.reports (owner_id, created_at desc);
create index reports_search_idx on public.reports using gin (search);
create index reports_item_trgm_idx on public.reports using gin (item_name extensions.gin_trgm_ops);
create index reports_expiry_idx on public.reports (expires_at) where status = 'active';
create index reports_ai_idx on public.reports (ai_status) where ai_status in ('pending', 'failed');

-- Private report details: exact location and owner-only verification clues.
create table public.report_private (
  report_id uuid primary key references public.reports(id) on delete cascade,
  university_id uuid not null references public.universities(id),
  exact_lat double precision check (exact_lat between -90 and 90),
  exact_lng double precision check (exact_lng between -180 and 180),
  verification_notes text check (verification_notes is null or char_length(verification_notes) <= 1000)
);

create table public.report_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  university_id uuid not null references public.universities(id),
  storage_path text not null unique,
  position smallint not null check (position between 0 and 4),
  ai_analysis jsonb,
  ai_embedding double precision[],
  created_at timestamptz not null default now(),
  unique (report_id, position) deferrable initially deferred
);
create index report_images_report_idx on public.report_images (report_id);

create table public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  university_id uuid not null references public.universities(id),
  source text not null check (source in ('auto', 'ai', 'user', 'admin')),
  reasons text[] not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution text check (resolution in ('approved', 'removed'))
);
create index moderation_flags_open_idx on public.moderation_flags (university_id) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Match suggestions (AI or heuristic). Suggestions only — never notifications.
-- ---------------------------------------------------------------------------
create table public.match_suggestions (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  lost_report_id uuid not null references public.reports(id) on delete cascade,
  found_report_id uuid not null references public.reports(id) on delete cascade,
  score real not null check (score between 0 and 1),
  components jsonb not null default '{}',
  reasons text[] not null default '{}',
  method public.match_method not null,
  lost_decision public.match_decision not null default 'pending',
  found_decision public.match_decision not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lost_report_id, found_report_id)
);
create index match_lost_idx on public.match_suggestions (lost_report_id, score desc);
create index match_found_idx on public.match_suggestions (found_report_id, score desc);

-- ---------------------------------------------------------------------------
-- Recovery requests and handover
-- ---------------------------------------------------------------------------
create table public.recovery_requests (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  report_id uuid not null references public.reports(id),
  requester_id uuid not null references public.profiles(id),
  match_id uuid references public.match_suggestions(id) on delete set null,
  -- The person the item belongs to, and the person who has/found it.
  item_owner_id uuid not null references public.profiles(id),
  finder_id uuid not null references public.profiles(id),
  message text check (message is null or char_length(message) <= 1000),
  -- Private answer to the owner's verification question; visible to parties/staff only.
  verification_answer text check (verification_answer is null or char_length(verification_answer) <= 1000),
  status public.request_status not null,
  is_sensitive boolean not null default false,
  handover_method public.handover_method,
  handover_details text check (handover_details is null or char_length(handover_details) <= 500),
  owner_confirmed_at timestamptz,
  finder_confirmed_at timestamptz,
  security_confirmed_at timestamptz,
  security_confirmed_by uuid references public.profiles(id),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  completed_at timestamptz,
  closing_note text check (closing_note is null or char_length(closing_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (item_owner_id <> finder_id)
);
-- One open request per user per report.
create unique index recovery_one_open_per_user on public.recovery_requests (report_id, requester_id)
  where status in ('pending', 'security_review', 'accepted', 'disputed');
-- At most one completed recovery per report.
create unique index recovery_one_completed on public.recovery_requests (report_id) where status = 'completed';
create index recovery_report_idx on public.recovery_requests (report_id, status);
create index recovery_requester_idx on public.recovery_requests (requester_id, created_at desc);
create index recovery_security_idx on public.recovery_requests (university_id, status) where is_sensitive;

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  recovery_request_id uuid not null references public.recovery_requests(id),
  opened_by uuid not null references public.profiles(id),
  reason text not null check (char_length(reason) between 5 and 1000),
  status public.case_status not null default 'open',
  resolution text check (resolution is null or char_length(resolution) <= 1000),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index disputes_one_open on public.disputes (recovery_request_id) where status = 'open';

-- ---------------------------------------------------------------------------
-- Conversations and messages (in-platform only; no contact details shared)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  report_id uuid not null references public.reports(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (report_id, created_by)
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  kind text not null default 'party' check (kind in ('party', 'security')),
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text check (body is null or char_length(body) <= 4000),
  attachment_path text,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  check (coalesce(char_length(body), 0) > 0 or attachment_path is not null)
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id),
  blocked_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------------
-- Ratings (only the item owner rates the finder after a completed handover)
-- ---------------------------------------------------------------------------
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  recovery_request_id uuid not null unique references public.recovery_requests(id),
  rater_id uuid not null references public.profiles(id),
  ratee_id uuid not null references public.profiles(id),
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 1000),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);
create index ratings_ratee_idx on public.ratings (ratee_id);

-- ---------------------------------------------------------------------------
-- Abuse reports, sanctions, audit
-- ---------------------------------------------------------------------------
create table public.abuse_reports (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  reporter_id uuid not null references public.profiles(id),
  target_type public.abuse_target not null,
  target_id uuid not null,
  -- The user responsible for the reported content (resolved server-side).
  target_user_id uuid references public.profiles(id),
  reason text not null check (reason in ('false_report', 'fraud', 'harassment', 'spam', 'inappropriate', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status public.case_status not null default 'open',
  outcome text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index abuse_one_open_per_reporter on public.abuse_reports (reporter_id, target_type, target_id) where status = 'open';
create index abuse_university_idx on public.abuse_reports (university_id, status);

create table public.user_sanctions (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id),
  user_id uuid not null references public.profiles(id),
  kind public.sanction_kind not null,
  reason text not null,
  abuse_report_id uuid references public.abuse_reports(id),
  expires_at timestamptz,
  issued_by uuid references public.profiles(id), -- null = automated policy
  created_at timestamptz not null default now()
);
create index sanctions_user_idx on public.user_sanctions (user_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  university_id uuid references public.universities(id),
  kind text not null,
  data jsonb not null default '{}',
  dedupe_key text not null unique,
  read_at timestamptz,
  email_status public.email_status not null default 'skipped',
  email_attempts smallint not null default 0,
  email_last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_email_idx on public.notifications (next_attempt_at) where email_status in ('pending', 'sending');

create table public.audit_events (
  id bigint generated always as identity primary key,
  university_id uuid references public.universities(id),
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_university_idx on public.audit_events (university_id, created_at desc);

-- updated_at maintenance
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger universities_touch before update on public.universities for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger profile_private_touch before update on public.profile_private for each row execute function public.touch_updated_at();
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();
create trigger matches_touch before update on public.match_suggestions for each row execute function public.touch_updated_at();
create trigger requests_touch before update on public.recovery_requests for each row execute function public.touch_updated_at();
