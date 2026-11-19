-- =============================================================================
-- Index foreign-key columns that had no leading index. Speeds up joins, RLS
-- helper lookups and ON DELETE checks on the referenced tables as data grows.
-- Additive only; the tables are small, so a plain CREATE INDEX is fine.
-- =============================================================================
create index if not exists abuse_reports_reviewed_by_idx            on public.abuse_reports (reviewed_by);
create index if not exists abuse_reports_target_user_id_idx         on public.abuse_reports (target_user_id);
create index if not exists blocks_blocked_id_idx                    on public.blocks (blocked_id);
create index if not exists conversations_created_by_idx             on public.conversations (created_by);
create index if not exists conversations_university_id_idx          on public.conversations (university_id);
create index if not exists disputes_opened_by_idx                   on public.disputes (opened_by);
create index if not exists disputes_resolved_by_idx                 on public.disputes (resolved_by);
create index if not exists disputes_university_id_idx               on public.disputes (university_id);
create index if not exists match_suggestions_university_id_idx      on public.match_suggestions (university_id);
create index if not exists messages_sender_id_idx                   on public.messages (sender_id);
create index if not exists moderation_flags_report_id_idx           on public.moderation_flags (report_id);
create index if not exists moderation_flags_resolved_by_idx         on public.moderation_flags (resolved_by);
create index if not exists notifications_university_id_idx          on public.notifications (university_id);
create index if not exists profile_private_university_id_idx        on public.profile_private (university_id);
create index if not exists ratings_rater_id_idx                     on public.ratings (rater_id);
create index if not exists ratings_university_id_idx                on public.ratings (university_id);
create index if not exists recovery_requests_decided_by_idx         on public.recovery_requests (decided_by);
create index if not exists recovery_requests_finder_id_idx          on public.recovery_requests (finder_id);
create index if not exists recovery_requests_item_owner_id_idx      on public.recovery_requests (item_owner_id);
create index if not exists recovery_requests_match_id_idx           on public.recovery_requests (match_id);
create index if not exists recovery_requests_security_confirmed_by_idx on public.recovery_requests (security_confirmed_by);
create index if not exists report_images_university_id_idx          on public.report_images (university_id);
create index if not exists report_private_university_id_idx         on public.report_private (university_id);
create index if not exists user_sanctions_abuse_report_id_idx       on public.user_sanctions (abuse_report_id);
create index if not exists user_sanctions_issued_by_idx             on public.user_sanctions (issued_by);
create index if not exists user_sanctions_university_id_idx         on public.user_sanctions (university_id);
