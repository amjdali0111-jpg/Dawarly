-- =============================================================================
-- Access control: identity helpers, RLS policies, and least-privilege grants.
--
-- Principles
--  * A user is "active" only after email confirmation (auth.users.email_confirmed_at).
--  * Regular users see only their own university's data.
--  * University admins administer only their own university.
--  * Global admins see everything.
--  * Clients get SELECT through RLS; almost every write goes through a
--    SECURITY DEFINER function in 0003 that re-checks authorization, so
--    calling PostgREST directly cannot bypass business rules.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER so they can read profiles/auth.users
-- without recursive RLS evaluation). All return NULL/false for anonymous or
-- unverified users.
-- ---------------------------------------------------------------------------
create or replace function public.my_university_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.university_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
    and p.deleted_at is null
    and u.email_confirmed_at is not null
$$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.id = auth.uid()
    and p.deleted_at is null
    and u.email_confirmed_at is not null
$$;

create or replace function public.is_global_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'global_admin', false)
$$;

create or replace function public.is_university_admin(uni uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_global_admin()
      or coalesce(public.my_role() = 'university_admin' and public.my_university_id() = uni, false)
$$;

-- Security staff of a university (university admins are implicitly included).
create or replace function public.is_security_staff(uni uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_university_admin(uni)
      or coalesce(public.my_role() = 'security' and public.my_university_id() = uni, false)
$$;

create or replace function public.is_restricted() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select pp.restricted_until > now() from public.profile_private pp where pp.id = auth.uid()), false)
$$;

-- Is either user blocking the other?
create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create or replace function public.is_conversation_participant(conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conv and cp.user_id = auth.uid()
  ) and public.my_university_id() is not null
$$;

-- Administrators may read a conversation only while handling an abuse report
-- that targets it (or one of its messages) within their university.
create or replace function public.can_moderate_conversation(conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.conversations c
    join public.abuse_reports a on a.university_id = c.university_id
    left join public.messages m on a.target_type = 'message' and m.id = a.target_id
    where c.id = conv
      and public.is_university_admin(c.university_id)
      and a.status = 'open'
      and ((a.target_type = 'conversation' and a.target_id = c.id) or m.conversation_id = c.id)
  )
$$;

-- Has the current user an accepted/completed recovery request on the report?
create or replace function public.has_active_request_on(rep uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.recovery_requests rr
    where rr.report_id = rep and rr.requester_id = auth.uid()
      and rr.status in ('accepted', 'completed', 'disputed')
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.universities enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.categories enable row level security;
alter table public.reports enable row level security;
alter table public.report_private enable row level security;
alter table public.report_images enable row level security;
alter table public.moderation_flags enable row level security;
alter table public.match_suggestions enable row level security;
alter table public.recovery_requests enable row level security;
alter table public.disputes enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.ratings enable row level security;
alter table public.abuse_reports enable row level security;
alter table public.user_sanctions enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

-- ---------------------------------------------------------------------------
-- Grants. Supabase grants ALL to anon/authenticated by default; reset to a
-- minimal surface. service_role bypasses RLS and keeps full access.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.universities to anon, authenticated;
grant select on public.categories to anon, authenticated;
grant select on public.profiles, public.profile_private, public.reports, public.report_private,
  public.report_images, public.moderation_flags, public.match_suggestions, public.recovery_requests,
  public.disputes, public.conversations, public.conversation_participants, public.messages,
  public.blocks, public.ratings, public.abuse_reports, public.user_sanctions, public.notifications,
  public.audit_events
  to authenticated;

-- Narrow, column-level write privileges (everything else is via functions).
grant update (full_name, avatar_path, member_type, faculty, academic_year) on public.profiles to authenticated;
grant update (locale, email_notifications) on public.profile_private to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant update (last_read_at) on public.conversation_participants to authenticated;
grant insert (conversation_id, sender_id, body, attachment_path) on public.messages to authenticated;
grant insert, delete on public.blocks to authenticated;
grant insert (university_id, slug, name_en, name_ar, icon, is_sensitive, is_active, sort_order),
  update (name_en, name_ar, icon, is_sensitive, is_active, sort_order) on public.categories to authenticated;
grant insert (slug, name_en, name_ar, center_lat, center_lng, is_active),
  update (name_en, name_ar, center_lat, center_lng, is_active) on public.universities to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- Universities: active ones are listed publicly (needed at registration).
create policy universities_select on public.universities for select
  using (is_active or (select public.is_global_admin()));
create policy universities_insert on public.universities for insert to authenticated
  with check ((select public.is_global_admin()));
create policy universities_update on public.universities for update to authenticated
  using ((select public.is_global_admin())) with check ((select public.is_global_admin()));

-- Profiles: visible within the same university.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid()
      or university_id = (select public.my_university_id())
      or (select public.is_global_admin()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and deleted_at is null) with check (id = auth.uid());

create policy profile_private_select on public.profile_private for select to authenticated
  using (id = auth.uid() or public.is_university_admin(university_id));
create policy profile_private_update_self on public.profile_private for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Categories: platform defaults + own university's.
create policy categories_select on public.categories for select
  using (university_id is null
      or university_id = (select public.my_university_id())
      or (select public.is_global_admin()));
create policy categories_insert on public.categories for insert to authenticated
  with check (case when university_id is null then (select public.is_global_admin())
                   else public.is_university_admin(university_id) end);
create policy categories_update on public.categories for update to authenticated
  using (case when university_id is null then (select public.is_global_admin())
              else public.is_university_admin(university_id) end)
  with check (case when university_id is null then (select public.is_global_admin())
                   else public.is_university_admin(university_id) end);

-- Reports: university members see published reports; owner and staff see all.
create policy reports_select on public.reports for select to authenticated
  using (
    owner_id = auth.uid()
    or (select public.is_global_admin())
    or (
      university_id = (select public.my_university_id())
      and (status in ('active', 'expired', 'recovered', 'closed')
           or public.is_security_staff(university_id))
    )
  );

-- Private report details: owner, security staff (sensitive items), university admins.
create policy report_private_select on public.report_private for select to authenticated
  using (exists (
    select 1 from public.reports r
    where r.id = report_private.report_id
      and (r.owner_id = auth.uid()
           or public.is_university_admin(r.university_id)
           or (r.is_sensitive and public.is_security_staff(r.university_id)))
  ));

-- Images: visible with the report; photos of sensitive items only to owner,
-- staff, and a requester whose request was accepted.
create policy report_images_select on public.report_images for select to authenticated
  using (exists (
    select 1 from public.reports r
    where r.id = report_images.report_id
      and (not r.is_sensitive
           or r.owner_id = auth.uid()
           or public.is_security_staff(r.university_id)
           or public.has_active_request_on(r.id))
  ));

create policy moderation_flags_select on public.moderation_flags for select to authenticated
  using (public.is_university_admin(university_id)
      or exists (select 1 from public.reports r where r.id = report_id and r.owner_id = auth.uid()));

-- Match suggestions: owners of either side, and staff.
create policy matches_select on public.match_suggestions for select to authenticated
  using (
    public.is_university_admin(university_id)
    or (university_id = (select public.my_university_id()) and exists (
      select 1 from public.reports r
      where r.id in (lost_report_id, found_report_id) and r.owner_id = auth.uid()))
  );

-- Recovery requests: requester, report owner, security staff (sensitive or
-- security-assisted handovers), university admins.
create policy requests_select on public.recovery_requests for select to authenticated
  using (
    requester_id = auth.uid()
    or exists (select 1 from public.reports r where r.id = report_id and r.owner_id = auth.uid())
    or public.is_university_admin(university_id)
    or ((is_sensitive or handover_method = 'security') and public.is_security_staff(university_id))
  );

create policy disputes_select on public.disputes for select to authenticated
  using (
    public.is_university_admin(university_id)
    or exists (select 1 from public.recovery_requests rr
               where rr.id = recovery_request_id and auth.uid() in (rr.item_owner_id, rr.finder_id))
  );

-- Conversations: participants, or admins handling an abuse report about it.
create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_participant(id) or public.can_moderate_conversation(id));
create policy participants_select on public.conversation_participants for select to authenticated
  using (public.is_conversation_participant(conversation_id) or public.can_moderate_conversation(conversation_id));
create policy participants_update_self on public.conversation_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_participant(conversation_id) or public.can_moderate_conversation(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and (attachment_path is null or attachment_path like conversation_id::text || '/' || auth.uid()::text || '/%')
    and not exists (
      select 1 from public.conversation_participants other
      where other.conversation_id = messages.conversation_id
        and other.user_id <> auth.uid()
        and other.kind = 'party'
        and public.is_blocked_between(auth.uid(), other.user_id))
  );

create policy blocks_select on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = blocked_id and p.university_id = (select public.my_university_id())));
create policy blocks_delete on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- Ratings: visible only to authenticated members of the same university.
create policy ratings_select on public.ratings for select to authenticated
  using ((university_id = (select public.my_university_id()) and (hidden_at is null or rater_id = auth.uid()))
      or public.is_university_admin(university_id));

create policy abuse_select on public.abuse_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_university_admin(university_id));

create policy sanctions_select on public.user_sanctions for select to authenticated
  using (user_id = auth.uid() or public.is_university_admin(university_id));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_select on public.audit_events for select to authenticated
  using ((select public.is_global_admin()) or (university_id is not null and public.is_university_admin(university_id)));
