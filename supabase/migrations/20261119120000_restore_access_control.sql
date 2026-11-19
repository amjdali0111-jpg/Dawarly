-- =============================================================================
-- Restore the access model defined in 20261029000002_access_control.sql.
--
-- Policies and grants were added outside the migrations (via the dashboard).
-- Permissive policies are OR'ed together, so these override the migration RLS:
--   * any signed-in user can read every profile, report, conversation and
--     message of every university (messages are also streamed via Realtime);
--   * any signed-in user can insert a message into any conversation with any
--     sender_id (bypassing the block list and attachment-path checks);
--   * any signed-in user can edit the name/avatar/faculty of any profile;
--   * security/admin staff of one university can read every university's chats;
--   * public.categories carries full table privileges (incl. TRUNCATE) for anon
--     and authenticated, and lost its insert/update policies, which breaks
--     category management in /admin/categories.
--
-- Every dropped policy is either USING/WITH CHECK (true) or broader than the
-- migration policy that already covers the same operation. The replacement for
-- each one is the migration policy named in the comment above it; those
-- policies already exist live and are not modified here (except categories,
-- whose three migration policies are re-created verbatim from 0002).
--
-- No table, column, row or function is created, altered or deleted.
-- Requires 20261030000008 (applied earlier in the same push).
-- =============================================================================

-- Guard: the universities/categories SELECT policies call is_global_admin() /
-- my_university_id(). Without anon EXECUTE (migration 0008) the registration
-- page could no longer list universities once the USING (true) policy is gone.
do $$
begin
  if not has_function_privilege('anon', 'public.is_global_admin()', 'EXECUTE')
     or not has_function_privilege('anon', 'public.my_university_id()', 'EXECUTE') then
    raise exception 'Migration 20261030000008_allow_anon_university_listing must be applied first';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- profiles
--   read   -> profiles_select      (self, same university, or global admin)
--   update -> profiles_update_self (own, not deleted; column grants limit the
--                                   editable fields to full_name, avatar_path,
--                                   member_type, faculty, academic_year)
--   insert -> none needed: rows are created by handle_new_user() (security definer)
-- -----------------------------------------------------------------------------
drop policy if exists "Allow public read access on profiles" on public.profiles;
drop policy if exists "Allow public read on profiles"        on public.profiles;
drop policy if exists "Profiles are viewable by everyone"    on public.profiles;
drop policy if exists "Allow user to insert own profile"     on public.profiles;
drop policy if exists "Allow user to update own profile"     on public.profiles;
drop policy if exists "Users can insert/update own profile"  on public.profiles;

-- -----------------------------------------------------------------------------
-- reports
--   read   -> reports_select (owner; global admin; own university's published
--                             reports; security staff see all of their university)
--   writes -> security-definer RPCs only (create_report, update_report,
--             close_report, renew_report, hold_report, admin_review_report, ...).
--             authenticated has no INSERT/UPDATE/DELETE privilege on reports.
-- -----------------------------------------------------------------------------
drop policy if exists "Allow public read access on reports"          on public.reports;
drop policy if exists "Allow public read on reports"                 on public.reports;
drop policy if exists "Reports select policy"                        on public.reports;
drop policy if exists "Allow authenticated users to insert reports"  on public.reports;
drop policy if exists "Reports insert policy"                        on public.reports;
drop policy if exists "Allow update on reports"                      on public.reports;
drop policy if exists "Reports update policy"                        on public.reports;
drop policy if exists "Users manage own reports"                     on public.reports;
drop policy if exists "Allow delete on reports"                      on public.reports;

-- -----------------------------------------------------------------------------
-- conversations
--   read   -> conversations_select (participant, or a university admin handling
--                                   an open abuse report on it)
--   create -> start_conversation() / get_or_create_conversation() /
--             security_join_conversation() (security definer)
-- -----------------------------------------------------------------------------
drop policy if exists "Allow public read on conversations"  on public.conversations;
drop policy if exists "Allow auth insert on conversations"  on public.conversations;
drop policy if exists "Conversations access policy"         on public.conversations;
drop policy if exists "Users view their conversations"      on public.conversations;

-- -----------------------------------------------------------------------------
-- conversation_participants
--   read   -> participants_select
--   update -> participants_update_self (column grant: last_read_at only)
-- "Users view their participants" queries its own table (recursive policy).
-- -----------------------------------------------------------------------------
drop policy if exists "Participants access policy"     on public.conversation_participants;
drop policy if exists "Users view their participants"  on public.conversation_participants;

-- -----------------------------------------------------------------------------
-- messages
--   read   -> messages_select (participant, or moderating admin)
--   insert -> messages_insert (sender = self, participant, attachment under
--                              <conversation>/<self>/, not blocked)
-- -----------------------------------------------------------------------------
drop policy if exists "Allow public read on messages"               on public.messages;
drop policy if exists "Allow auth insert on messages"               on public.messages;
drop policy if exists "Messages access policy"                      on public.messages;
drop policy if exists "Users insert messages as themselves"         on public.messages;
drop policy if exists "Users view messages in their conversations"  on public.messages;

-- -----------------------------------------------------------------------------
-- universities
--   read -> universities_select (active universities for everyone; all for global admin)
-- -----------------------------------------------------------------------------
drop policy if exists "Allow public read access for universities" on public.universities;

-- -----------------------------------------------------------------------------
-- categories: restore policies and privileges exactly as in 0002
-- -----------------------------------------------------------------------------
drop policy if exists categories_select_all on public.categories;
drop policy if exists categories_select     on public.categories;
drop policy if exists categories_insert     on public.categories;
drop policy if exists categories_update     on public.categories;

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

revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
grant insert (university_id, slug, name_en, name_ar, icon, is_sensitive, is_active, sort_order),
  update (name_en, name_ar, icon, is_sensitive, is_active, sort_order) on public.categories to authenticated;
