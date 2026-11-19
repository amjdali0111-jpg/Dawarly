-- =============================================================================
-- Restore objects that were changed outside the migrations (found by audit on
-- 2026-11-19). No table, column or row is created, altered or deleted.
--
-- 1. handle_new_user() was replaced with a version that inserts profiles
--    without university_id (NOT NULL), member_type/faculty/academic_year and
--    without the profile_private row. Every new signup fails with
--    "Database error saving new user" (seen in production logs). Restored
--    verbatim from 20261029000003_workflows.sql. The on_auth_user_created
--    trigger itself is unchanged and still points at this function.
-- 2. The categories_audit trigger (20261029000003) is missing because the
--    categories table was rebuilt outside the migrations. Re-created verbatim.
-- 3. public.get_or_create_conversation(uuid, uuid) is not part of the
--    migrations or the app. It is SECURITY DEFINER without a fixed
--    search_path and executable by anon/authenticated, with no authorization
--    checks (no university isolation, block list or sanctions). Execute is
--    revoked (not dropped, so it can be restored if ever needed).
--    Note: the comment in 20261119120000 naming it as a conversation-creation
--    path was incorrect; conversations are created by start_conversation() and
--    security_join_conversation().
-- =============================================================================

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  uni uuid;
  mtype public.member_type;
begin
  begin
    uni := (meta->>'university_id')::uuid;
  exception when others then
    raise exception 'signup:university';
  end;
  if uni is null or not exists (select 1 from public.universities u where u.id = uni and u.is_active) then
    raise exception 'signup:university';
  end if;
  mtype := case when meta->>'member_type' in ('student', 'employee', 'faculty')
                then (meta->>'member_type')::public.member_type else 'student' end;

  insert into public.profiles (id, university_id, full_name, member_type, faculty, academic_year)
  values (
    new.id, uni,
    left(coalesce(nullif(trim(meta->>'full_name'), ''), 'User'), 120),
    mtype,
    nullif(left(trim(coalesce(meta->>'faculty', '')), 120), ''),
    case when coalesce(meta->>'academic_year', '') ~ '^[0-9]{1,2}$'
              and (meta->>'academic_year')::int between 1 and 10
         then (meta->>'academic_year')::smallint end
  );
  insert into public.profile_private (id, university_id, locale)
  values (new.id, uni, case when meta->>'locale' = 'en' then 'en' else 'ar' end);
  return new;
end $$;

drop trigger if exists categories_audit on public.categories;
create trigger categories_audit after insert or update on public.categories
  for each row execute function public._audit_config_change();

do $$
begin
  if to_regprocedure('public.get_or_create_conversation(uuid, uuid)') is not null then
    revoke execute on function public.get_or_create_conversation(uuid, uuid) from public, anon, authenticated;
  end if;
end $$;