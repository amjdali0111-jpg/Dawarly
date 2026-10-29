-- =============================================================================
-- Workflow functions. Each one is SECURITY DEFINER and performs its own
-- authorization, so it is safe for a client to call it directly through
-- PostgREST. Error messages use stable codes ("code:detail") that the app
-- translates; they never echo private data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Internal helpers (not executable by clients)
-- ---------------------------------------------------------------------------
create or replace function public._report_validity() returns interval
language sql immutable as $$ select interval '14 days' $$;

create or replace function public._audit(p_university uuid, p_action text, p_target_type text, p_target_id text, p_metadata jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events (university_id, actor_id, action, target_type, target_id, metadata)
  values (p_university, auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'));
$$;

-- In-app notification (+ queued email if the user opted in). Idempotent per dedupe key.
create or replace function public._notify(p_user uuid, p_kind text, p_data jsonb, p_dedupe text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, university_id, kind, data, dedupe_key, email_status)
  select p.id, p.university_id, p_kind, coalesce(p_data, '{}'), p_dedupe,
         case when coalesce(pp.email_notifications, false) and p.deleted_at is null
              then 'pending'::public.email_status else 'skipped'::public.email_status end
  from public.profiles p
  left join public.profile_private pp on pp.id = p.id
  where p.id = p_user and p.deleted_at is null
  on conflict (dedupe_key) do nothing;
$$;

create or replace function public._require_active_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uni uuid;
begin
  uni := public.my_university_id();
  if uni is null then
    raise exception 'auth:not_active' using errcode = '42501';
  end if;
  return uni;
end $$;

create or replace function public._require_unrestricted() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.is_restricted() then
    raise exception 'auth:restricted' using errcode = '42501';
  end if;
end $$;

-- Sensitive / high-value detection (category flag or keywords, AR + EN).
create or replace function public._detect_sensitive(p_category uuid, p_text text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  cat_sensitive boolean;
  t text := lower(coalesce(p_text, ''));
begin
  select is_sensitive into cat_sensitive from public.categories where id = p_category;
  if coalesce(cat_sensitive, false) then
    return 'category';
  end if;
  if t ~ '(passport|national id|id card|student card|credit card|debit card|bank card|laptop|macbook|iphone|ipad|phone|mobile|wallet|cash|money|gold|jewel|necklace|ring|watch|car key|جواز|هوية|بطاقة|بطاقه|فيزا|لابتوب|حاسوب|جوال|هاتف|ايفون|آيفون|محفظة|محفظه|نقود|فلوس|ذهب|خاتم|عقد|ساعة|ساعه|مفتاح سيارة)' then
    return 'keywords';
  end if;
  return null;
end $$;

-- Heuristic risk assessment for new/edited reports. Returns reason codes;
-- any reason holds the report for university-admin review.
create or replace function public._assess_report_risk(p_owner uuid, p_text text, p_is_new boolean) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  reasons text[] := '{}';
  t text := lower(coalesce(p_text, ''));
begin
  if p_is_new and (select count(*) from public.reports r
                   where r.owner_id = p_owner and r.created_at > now() - interval '1 hour') >= 5 then
    reasons := array_append(reasons, 'rate_limit');
  end if;
  if t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' or t ~ '(https?://|www\.)' or t ~ '(\+?[0-9٠-٩][0-9٠-٩ \-]{7,}[0-9٠-٩])' then
    reasons := array_append(reasons, 'contact_info');
  end if;
  if t ~ '(western union|moneygram|bitcoin|crypto|gift card|send money|transfer fee|reward first|حوالة|تحويل مبلغ|ارسل مبلغ|أرسل مبلغ|عملة رقمية)' then
    reasons := array_append(reasons, 'scam_terms');
  end if;
  if exists (select 1 from public.user_sanctions s
             where s.user_id = p_owner and s.kind in ('warning', 'temporary_restriction', 'escalation')
               and s.created_at > now() - interval '90 days') then
    reasons := array_append(reasons, 'recent_sanction');
  end if;
  return reasons;
end $$;

create or replace function public._validate_report_payload(p jsonb) returns void
language plpgsql stable as $$
begin
  if p->>'type' is not null and p->>'type' not in ('lost', 'found') then raise exception 'validation:type'; end if;
  if char_length(trim(coalesce(p->>'item_name', ''))) not between 2 and 120 then raise exception 'validation:item_name'; end if;
  if char_length(trim(coalesce(p->>'description', ''))) not between 10 and 2000 then raise exception 'validation:description'; end if;
  if coalesce(p->>'category_id', '') = '' then raise exception 'validation:category'; end if;
  if char_length(trim(coalesce(p->>'color', ''))) not between 2 and 60 then raise exception 'validation:color'; end if;
  if char_length(trim(coalesce(p->>'distinguishing_features', ''))) not between 3 and 1000 then raise exception 'validation:distinguishing_features'; end if;
  if char_length(trim(coalesce(p->>'location_text', ''))) not between 2 and 200 then raise exception 'validation:location'; end if;
  if coalesce(p->>'event_date', '') = '' then raise exception 'validation:event_date'; end if;
  if (p->>'event_date')::date > current_date + 1 then raise exception 'validation:event_date_future'; end if;
  if (p->>'event_date')::date < current_date - 365 then raise exception 'validation:event_date_old'; end if;
  if (p->'lat' is not null and jsonb_typeof(p->'lat') <> 'null') <> (p->'lng' is not null and jsonb_typeof(p->'lng') <> 'null') then
    raise exception 'validation:coordinates';
  end if;
  if jsonb_typeof(p->'image_paths') is distinct from 'array'
     or jsonb_array_length(p->'image_paths') not between 1 and 5 then
    raise exception 'validation:images_count';
  end if;
end $$;

-- Validates that each image path was uploaded by the caller into their own
-- university folder and exists in storage.
create or replace function public._check_image_paths(p_paths text[], p_uni uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare path text;
begin
  if (select count(distinct x) from unnest(p_paths) x) <> cardinality(p_paths) then
    raise exception 'validation:images_duplicate';
  end if;
  foreach path in array p_paths loop
    if path not like p_uni::text || '/' || auth.uid()::text || '/%' or path like '%..%' then
      raise exception 'validation:image_path';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'report-images' and o.name = path) then
      raise exception 'validation:image_missing';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles: created from auth sign-up metadata; role is always 'user'.
-- ---------------------------------------------------------------------------
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

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- On account deletion: anonymise the profile, drop personal settings and
-- notifications, keep records needed for other users' history.
create or replace function public.handle_deleted_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles
     set full_name = 'Deleted user', avatar_path = null, faculty = null, academic_year = null,
         deleted_at = now()
   where id = old.id;
  delete from public.notifications where user_id = old.id;
  delete from public.blocks where blocker_id = old.id or blocked_id = old.id;
  update public.profile_private set email_notifications = false where id = old.id;
  insert into public.audit_events (university_id, actor_id, action, target_type, target_id)
  select university_id, null, 'account.deleted', 'profile', old.id::text from public.profiles where id = old.id;
  return old;
end $$;

create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- Blockers that prevent self-service deletion until the product decision on
-- open reports / outstanding requests / ratings is made (see README).
create or replace function public.account_deletion_blockers() returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_out text[] := '{}';
begin
  if me is null then raise exception 'auth:not_active' using errcode = '42501'; end if;
  if exists (select 1 from public.reports where owner_id = me and status in ('active', 'under_review', 'expired')) then
    v_out := array_append(v_out, 'open_reports');
  end if;
  if exists (select 1 from public.recovery_requests rr
             where (rr.requester_id = me or rr.item_owner_id = me or rr.finder_id = me)
               and rr.status in ('pending', 'security_review', 'accepted', 'disputed')) then
    v_out := array_append(v_out, 'outstanding_requests');
  end if;
  if exists (select 1 from public.ratings where rater_id = me or ratee_id = me) then
    v_out := array_append(v_out, 'ratings');
  end if;
  return v_out;
end $$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
create or replace function public.create_report(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uni uuid := public._require_active_user();
  me uuid := auth.uid();
  cat public.categories;
  paths text[];
  sens text;
  risks text[];
  new_id uuid;
  lat double precision := nullif(p->>'lat', '')::double precision;
  lng double precision := nullif(p->>'lng', '')::double precision;
  full_text text;
begin
  perform public._require_unrestricted();
  perform public._validate_report_payload(p);
  if p->>'type' is null then raise exception 'validation:type'; end if;

  select * into cat from public.categories c
   where c.id = (p->>'category_id')::uuid and c.is_active and (c.university_id is null or c.university_id = uni);
  if not found then raise exception 'validation:category'; end if;

  select array_agg(x) into paths from jsonb_array_elements_text(p->'image_paths') x;
  perform public._check_image_paths(paths, uni);

  full_text := concat_ws(' ', p->>'item_name', p->>'description', p->>'distinguishing_features', p->>'location_text');
  sens := public._detect_sensitive(cat.id, full_text);
  risks := public._assess_report_risk(me, full_text, true);

  insert into public.reports (university_id, owner_id, type, item_name, description, category_id, color,
    distinguishing_features, location_text, approx_lat, approx_lng, event_date, event_time,
    status, is_sensitive, sensitive_reason, expires_at)
  values (uni, me, (p->>'type')::public.report_type, trim(p->>'item_name'), trim(p->>'description'), cat.id,
    trim(p->>'color'), trim(p->>'distinguishing_features'), trim(p->>'location_text'),
    round(lat::numeric, 3)::double precision, round(lng::numeric, 3)::double precision,
    (p->>'event_date')::date, nullif(p->>'event_time', '')::time,
    case when cardinality(risks) > 0 then 'under_review'::public.report_status else 'active'::public.report_status end,
    sens is not null, sens, now() + public._report_validity())
  returning id into new_id;

  insert into public.report_private (report_id, university_id, exact_lat, exact_lng, verification_notes)
  values (new_id, uni, lat, lng, nullif(trim(coalesce(p->>'verification_notes', '')), ''));

  insert into public.report_images (report_id, university_id, storage_path, position)
  select new_id, uni, x, (o - 1)::smallint from unnest(paths) with ordinality as t(x, o);

  if cardinality(risks) > 0 then
    insert into public.moderation_flags (report_id, university_id, source, reasons)
    values (new_id, uni, 'auto', risks);
    perform public._notify(me, 'report_held', jsonb_build_object('report_id', new_id), 'held:' || new_id);
    perform public._audit(uni, 'report.auto_held', 'report', new_id::text, jsonb_build_object('reasons', risks));
  end if;
  if sens is not null then
    perform public._audit(uni, 'report.routed_to_security', 'report', new_id::text, jsonb_build_object('reason', sens));
  end if;
  return new_id;
end $$;

-- Owner edits. Returns {material: bool, removed_paths: text[]}.
create or replace function public.update_report(p_report uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uni uuid := public._require_active_user();
  me uuid := auth.uid();
  r public.reports;
  cat public.categories;
  paths text[];
  old_paths text[];
  removed text[];
  added text[];
  material boolean;
  sens text;
  risks text[];
  lat double precision := nullif(p->>'lat', '')::double precision;
  lng double precision := nullif(p->>'lng', '')::double precision;
  full_text text;
  new_status public.report_status;
begin
  select * into r from public.reports where id = p_report for update;
  if not found or r.owner_id <> me then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if r.status not in ('active', 'under_review', 'expired') then raise exception 'state:not_editable'; end if;
  perform public._validate_report_payload(p || jsonb_build_object('type', r.type));

  select * into cat from public.categories c
   where c.id = (p->>'category_id')::uuid and c.is_active and (c.university_id is null or c.university_id = uni);
  if not found then raise exception 'validation:category'; end if;

  select array_agg(x) into paths from jsonb_array_elements_text(p->'image_paths') x;
  select coalesce(array_agg(storage_path order by position), '{}') into old_paths from public.report_images where report_id = r.id;
  select coalesce(array_agg(x), '{}') into added from unnest(paths) x where x <> all (old_paths);
  select coalesce(array_agg(x), '{}') into removed from unnest(old_paths) x where x <> all (paths);
  if cardinality(added) > 0 then
    perform public._check_image_paths(added, uni);
  end if;

  material := r.item_name is distinct from trim(p->>'item_name')
    or r.description is distinct from trim(p->>'description')
    or r.category_id is distinct from cat.id
    or r.color is distinct from trim(p->>'color')
    or r.distinguishing_features is distinct from trim(p->>'distinguishing_features')
    or r.location_text is distinct from trim(p->>'location_text')
    or r.approx_lat is distinct from round(lat::numeric, 3)::double precision
    or r.approx_lng is distinct from round(lng::numeric, 3)::double precision
    or r.event_date is distinct from (p->>'event_date')::date
    or cardinality(added) > 0 or cardinality(removed) > 0;

  full_text := concat_ws(' ', p->>'item_name', p->>'description', p->>'distinguishing_features', p->>'location_text');
  sens := public._detect_sensitive(cat.id, full_text);
  risks := public._assess_report_risk(me, full_text, false);
  -- recent_sanction alone does not re-hold an edit of an already-published report.
  if r.status = 'active' then risks := array_remove(risks, 'recent_sanction'); end if;
  new_status := case when cardinality(risks) > 0 then 'under_review'::public.report_status else r.status end;

  update public.reports set
    item_name = trim(p->>'item_name'), description = trim(p->>'description'), category_id = cat.id,
    color = trim(p->>'color'), distinguishing_features = trim(p->>'distinguishing_features'),
    location_text = trim(p->>'location_text'),
    approx_lat = round(lat::numeric, 3)::double precision, approx_lng = round(lng::numeric, 3)::double precision,
    event_date = (p->>'event_date')::date, event_time = nullif(p->>'event_time', '')::time,
    -- Once routed to security a report stays sensitive; it can only escalate.
    is_sensitive = r.is_sensitive or sens is not null,
    sensitive_reason = coalesce(r.sensitive_reason, sens),
    status = new_status,
    ai_status = case when material then 'pending'::public.ai_status else ai_status end,
    ai_attempts = case when material then 0 else ai_attempts end
  where id = r.id;

  update public.report_private set exact_lat = lat, exact_lng = lng,
    verification_notes = nullif(trim(coalesce(p->>'verification_notes', '')), '')
  where report_id = r.id;

  if cardinality(added) > 0 or cardinality(removed) > 0 then
    delete from public.report_images where report_id = r.id and storage_path = any (removed);
    insert into public.report_images (report_id, university_id, storage_path, position)
    select r.id, uni, x, 0 from unnest(added) x;
    update public.report_images ri set position = (t.o - 1)::smallint
      from unnest(paths) with ordinality as t(x, o)
     where ri.report_id = r.id and ri.storage_path = t.x;
  end if;

  if material then
    -- Stale suggestions nobody acted on are re-evaluated by the matcher.
    delete from public.match_suggestions
     where (lost_report_id = r.id or found_report_id = r.id)
       and lost_decision = 'pending' and found_decision = 'pending';
  end if;

  if cardinality(risks) > 0 and r.status <> 'under_review' then
    insert into public.moderation_flags (report_id, university_id, source, reasons)
    values (r.id, uni, 'auto', risks);
    perform public._audit(uni, 'report.auto_held', 'report', r.id::text, jsonb_build_object('reasons', risks, 'on', 'edit'));
  end if;
  return jsonb_build_object('material', material, 'removed_paths', to_jsonb(removed));
end $$;

create or replace function public.close_report(p_report uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.reports;
  is_admin boolean;
begin
  perform public._require_active_user();
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  is_admin := public.is_university_admin(r.university_id);
  if r.owner_id <> me and not is_admin then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if r.status not in ('active', 'under_review', 'expired') then raise exception 'state:not_closable'; end if;

  update public.reports set status = 'closed', closed_at = now() where id = r.id;
  update public.recovery_requests set status = 'cancelled', closing_note = 'report_closed'
   where report_id = r.id and status in ('pending', 'security_review', 'accepted');
  if is_admin and r.owner_id <> me then
    perform public._audit(r.university_id, 'report.closed_by_admin', 'report', r.id::text, jsonb_build_object('note', left(p_note, 200)));
    perform public._notify(r.owner_id, 'report_closed', jsonb_build_object('report_id', r.id), 'closed:' || r.id);
  end if;
end $$;

-- Manual renewal of an expired report (owner or university admin): +14 days.
create or replace function public.renew_report(p_report uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.reports;
  is_admin boolean;
  new_expiry timestamptz := now() + public._report_validity();
begin
  perform public._require_active_user();
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  is_admin := public.is_university_admin(r.university_id);
  if r.owner_id <> me and not is_admin then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if r.status <> 'expired' then raise exception 'state:not_expired'; end if;
  if r.owner_id = me then perform public._require_unrestricted(); end if;

  update public.reports set status = 'active', expires_at = new_expiry, renewal_count = renewal_count + 1
   where id = r.id;
  if r.owner_id <> me then
    perform public._audit(r.university_id, 'report.renewed_by_admin', 'report', r.id::text,
      jsonb_build_object('new_expires_at', new_expiry));
    perform public._notify(r.owner_id, 'report_renewed', jsonb_build_object('report_id', r.id),
      'renewed:' || r.id || ':' || (r.renewal_count + 1));
  else
    perform public._audit(r.university_id, 'report.renewed', 'report', r.id::text,
      jsonb_build_object('new_expires_at', new_expiry));
  end if;
  return new_expiry;
end $$;

-- Idempotent expiry job (pg_cron or /api/cron/expire with the service role).
create or replace function public.expire_reports() returns int
language plpgsql security definer set search_path = '' as $$
declare
  rec record;
  n int := 0;
begin
  for rec in
    update public.reports set status = 'expired'
     where status = 'active' and expires_at <= now()
    returning id, owner_id, university_id, expires_at
  loop
    n := n + 1;
    perform public._notify(rec.owner_id, 'report_expired', jsonb_build_object('report_id', rec.id),
      'expired:' || rec.id || ':' || extract(epoch from rec.expires_at)::bigint);
    insert into public.audit_events (university_id, actor_id, action, target_type, target_id)
    values (rec.university_id, null, 'report.expired', 'report', rec.id::text);
  end loop;
  return n;
end $$;

-- University admin moderation decision on a held report.
create or replace function public.admin_review_report(p_report uuid, p_decision text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  perform public._require_active_user();
  select * into r from public.reports where id = p_report for update;
  if not found or not public.is_university_admin(r.university_id) then
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'remove') then raise exception 'validation:decision'; end if;
  if p_decision = 'approve' and r.status <> 'under_review' then raise exception 'state:not_under_review'; end if;
  if p_decision = 'remove' and r.status in ('removed', 'recovered') then raise exception 'state:invalid'; end if;

  update public.reports
     set status = case when p_decision = 'approve'
                       then case when r.expires_at <= now() then 'expired'::public.report_status else 'active'::public.report_status end
                       else 'removed'::public.report_status end
   where id = r.id;
  update public.moderation_flags
     set resolved_at = now(), resolved_by = auth.uid(),
         resolution = case when p_decision = 'approve' then 'approved' else 'removed' end
   where report_id = r.id and resolved_at is null;
  if p_decision = 'remove' then
    update public.recovery_requests set status = 'cancelled', closing_note = 'report_removed'
     where report_id = r.id and status in ('pending', 'security_review', 'accepted');
  end if;
  perform public._audit(r.university_id, 'report.moderated', 'report', r.id::text,
    jsonb_build_object('decision', p_decision, 'note', left(p_note, 300)));
  perform public._notify(r.owner_id, 'moderation_decision',
    jsonb_build_object('report_id', r.id, 'decision', p_decision),
    'moderation:' || r.id || ':' || extract(epoch from now())::bigint);
end $$;

-- Admin (or AI moderation via service role) can hold a published report.
create or replace function public.hold_report(p_report uuid, p_reasons text[], p_source text default 'admin') returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  select * into r from public.reports where id = p_report for update;
  if not found then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if auth.role() is distinct from 'service_role' and not public.is_university_admin(r.university_id) then
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
  if p_source not in ('admin', 'ai') then raise exception 'validation:source'; end if;
  if r.status not in ('active', 'expired') then return; end if;
  update public.reports set status = 'under_review' where id = r.id;
  insert into public.moderation_flags (report_id, university_id, source, reasons)
  values (r.id, r.university_id, p_source, coalesce(p_reasons, '{}'));
  perform public._audit(r.university_id, 'report.held', 'report', r.id::text, jsonb_build_object('reasons', p_reasons, 'source', p_source));
  perform public._notify(r.owner_id, 'report_held', jsonb_build_object('report_id', r.id), 'held:' || r.id || ':' || extract(epoch from now())::bigint);
end $$;

-- ---------------------------------------------------------------------------
-- Match suggestions
-- ---------------------------------------------------------------------------
-- Integrity: both sides in the suggestion's university, correct types.
create or replace function public._check_match_integrity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.reports where id = new.lost_report_id and type = 'lost' and university_id = new.university_id)
     or not exists (select 1 from public.reports where id = new.found_report_id and type = 'found' and university_id = new.university_id) then
    raise exception 'integrity:match_scope';
  end if;
  return new;
end $$;
create trigger match_integrity before insert or update of lost_report_id, found_report_id, university_id
  on public.match_suggestions for each row execute function public._check_match_integrity();

create or replace function public.decide_match(p_match uuid, p_decision public.match_decision) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.match_suggestions;
  me uuid := auth.uid();
  lost_owner uuid;
  found_owner uuid;
begin
  perform public._require_active_user();
  select * into m from public.match_suggestions where id = p_match for update;
  if not found then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  select owner_id into lost_owner from public.reports where id = m.lost_report_id;
  select owner_id into found_owner from public.reports where id = m.found_report_id;
  if me = lost_owner then
    update public.match_suggestions set lost_decision = p_decision where id = m.id;
  elsif me = found_owner then
    update public.match_suggestions set found_decision = p_decision where id = m.id;
  else
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Recovery requests
-- ---------------------------------------------------------------------------
create or replace function public.create_recovery_request(
  p_report uuid, p_message text default null, p_verification_answer text default null, p_match uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uni uuid := public._require_active_user();
  me uuid := auth.uid();
  r public.reports;
  m public.match_suggestions;
  new_id uuid;
  st public.request_status;
  staff record;
begin
  perform public._require_unrestricted();
  select * into r from public.reports where id = p_report;
  if not found or r.university_id <> uni then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if r.owner_id = me then raise exception 'state:own_report'; end if;
  if r.status <> 'active' then raise exception 'state:report_not_active'; end if;
  if public.is_blocked_between(me, r.owner_id) then raise exception 'state:blocked'; end if;

  if p_match is not null then
    select * into m from public.match_suggestions where id = p_match;
    if not found
       or not (r.id in (m.lost_report_id, m.found_report_id))
       or not exists (select 1 from public.reports x
                      where x.id in (m.lost_report_id, m.found_report_id) and x.id <> r.id and x.owner_id = me)
    then
      raise exception 'validation:match';
    end if;
    -- The requester must have reviewed and confirmed the suggestion first.
    if (r.type = 'found' and m.lost_decision <> 'confirmed') or (r.type = 'lost' and m.found_decision <> 'confirmed') then
      raise exception 'state:match_not_confirmed';
    end if;
  end if;

  st := case when r.is_sensitive then 'security_review'::public.request_status else 'pending'::public.request_status end;
  begin
    insert into public.recovery_requests (university_id, report_id, requester_id, match_id, item_owner_id, finder_id,
      message, verification_answer, status, is_sensitive, handover_method)
    values (uni, r.id, me, p_match,
      case when r.type = 'found' then me else r.owner_id end,
      case when r.type = 'found' then r.owner_id else me end,
      nullif(trim(coalesce(p_message, '')), ''), nullif(trim(coalesce(p_verification_answer, '')), ''),
      st, r.is_sensitive, case when r.is_sensitive then 'security'::public.handover_method end)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'state:duplicate_request';
  end;

  perform public._notify(r.owner_id, 'request_received',
    jsonb_build_object('request_id', new_id, 'report_id', r.id), 'req-new:' || new_id);
  if r.is_sensitive then
    for staff in select p.id from public.profiles p
                  where p.university_id = r.university_id and p.role = 'security' and p.deleted_at is null loop
      perform public._notify(staff.id, 'security_case',
        jsonb_build_object('request_id', new_id, 'report_id', r.id), 'sec-case:' || new_id || ':' || staff.id);
    end loop;
    perform public._audit(uni, 'request.routed_to_security', 'recovery_request', new_id::text);
  end if;
  return new_id;
end $$;

-- Report owner accepts/rejects a non-sensitive request.
create or replace function public.respond_recovery_request(p_request uuid, p_accept boolean, p_method public.handover_method default 'direct', p_details text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  rr public.recovery_requests;
  r public.reports;
begin
  perform public._require_active_user();
  select * into rr from public.recovery_requests where id = p_request for update;
  if not found then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  select * into r from public.reports where id = rr.report_id for update;
  if r.owner_id <> auth.uid() then raise exception 'auth:forbidden' using errcode = '42501'; end if;

  if not p_accept then
    if rr.status not in ('pending', 'security_review') then raise exception 'state:invalid'; end if;
    update public.recovery_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now() where id = rr.id;
    perform public._notify(rr.requester_id, 'request_status',
      jsonb_build_object('request_id', rr.id, 'report_id', r.id, 'status', 'rejected'), 'req-status:' || rr.id || ':rejected');
    return;
  end if;

  -- Sensitive items: only university security can approve.
  if rr.is_sensitive then raise exception 'state:security_required'; end if;
  if rr.status <> 'pending' then raise exception 'state:invalid'; end if;
  if r.status <> 'active' then raise exception 'state:report_not_active'; end if;
  if exists (select 1 from public.recovery_requests x where x.report_id = r.id and x.status in ('accepted', 'disputed') and x.id <> rr.id) then
    raise exception 'state:already_accepted';
  end if;

  update public.recovery_requests
     set status = 'accepted', handover_method = coalesce(p_method, 'direct'),
         handover_details = nullif(trim(coalesce(p_details, '')), ''),
         decided_by = auth.uid(), decided_at = now()
   where id = rr.id;
  perform public._notify(rr.requester_id, 'request_status',
    jsonb_build_object('request_id', rr.id, 'report_id', r.id, 'status', 'accepted'), 'req-status:' || rr.id || ':accepted');
  perform public._audit(r.university_id, 'request.accepted', 'recovery_request', rr.id::text,
    jsonb_build_object('method', coalesce(p_method, 'direct')));
end $$;

-- University security reviews sensitive-item requests.
create or replace function public.security_review_request(p_request uuid, p_approve boolean, p_details text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  rr public.recovery_requests;
  r public.reports;
  st public.request_status;
begin
  perform public._require_active_user();
  select * into rr from public.recovery_requests where id = p_request for update;
  if not found or not public.is_security_staff(rr.university_id) then
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
  if rr.status <> 'security_review' then raise exception 'state:invalid'; end if;
  select * into r from public.reports where id = rr.report_id for update;
  if p_approve and exists (select 1 from public.recovery_requests x where x.report_id = r.id and x.status in ('accepted', 'disputed')) then
    raise exception 'state:already_accepted';
  end if;
  st := case when p_approve then 'accepted'::public.request_status else 'rejected'::public.request_status end;
  update public.recovery_requests
     set status = st, handover_method = 'security',
         handover_details = nullif(trim(coalesce(p_details, '')), ''),
         decided_by = auth.uid(), decided_at = now()
   where id = rr.id;
  perform public._audit(rr.university_id, 'security.request_reviewed', 'recovery_request', rr.id::text,
    jsonb_build_object('approved', p_approve));
  perform public._notify(rr.requester_id, 'request_status',
    jsonb_build_object('request_id', rr.id, 'report_id', r.id, 'status', st), 'req-status:' || rr.id || ':' || st);
  perform public._notify(r.owner_id, 'request_status',
    jsonb_build_object('request_id', rr.id, 'report_id', r.id, 'status', st), 'req-status-owner:' || rr.id || ':' || st);
end $$;

create or replace function public.withdraw_recovery_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare rr public.recovery_requests;
begin
  perform public._require_active_user();
  select * into rr from public.recovery_requests where id = p_request for update;
  if not found or rr.requester_id <> auth.uid() then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if rr.status not in ('pending', 'security_review', 'accepted') then raise exception 'state:invalid'; end if;
  update public.recovery_requests set status = 'withdrawn' where id = rr.id;
end $$;

-- Two-party handover confirmation. Completion requires the item owner AND
-- (the finder, or university security when the handover is security-assisted).
-- A single confirmation leaves the request pending; nothing completes on a timer.
create or replace function public.confirm_handover(p_request uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  rr public.recovery_requests;
  me uuid := auth.uid();
  acted boolean := false;
  done boolean;
  counterpart uuid;
begin
  perform public._require_active_user();
  select * into rr from public.recovery_requests where id = p_request for update;
  if not found then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if rr.status <> 'accepted' then raise exception 'state:invalid'; end if;

  if me = rr.item_owner_id then
    rr.owner_confirmed_at := coalesce(rr.owner_confirmed_at, now()); acted := true;
  end if;
  if me = rr.finder_id then
    rr.finder_confirmed_at := coalesce(rr.finder_confirmed_at, now()); acted := true;
  end if;
  if not acted and rr.handover_method = 'security' and public.is_security_staff(rr.university_id) then
    rr.security_confirmed_at := coalesce(rr.security_confirmed_at, now());
    rr.security_confirmed_by := coalesce(rr.security_confirmed_by, me);
    acted := true;
    perform public._audit(rr.university_id, 'security.handover_confirmed', 'recovery_request', rr.id::text);
  end if;
  if not acted then raise exception 'auth:forbidden' using errcode = '42501'; end if;

  done := rr.owner_confirmed_at is not null
      and (rr.finder_confirmed_at is not null
           or (rr.handover_method = 'security' and rr.security_confirmed_at is not null));

  update public.recovery_requests
     set owner_confirmed_at = rr.owner_confirmed_at,
         finder_confirmed_at = rr.finder_confirmed_at,
         security_confirmed_at = rr.security_confirmed_at,
         security_confirmed_by = rr.security_confirmed_by,
         status = case when done then 'completed'::public.request_status else status end,
         completed_at = case when done then now() end
   where id = rr.id;

  if done then
    update public.reports set status = 'recovered', recovered_at = now()
     where id = rr.report_id and status in ('active', 'expired', 'under_review');
    if rr.match_id is not null then
      select case when m.lost_report_id = rr.report_id then m.found_report_id else m.lost_report_id end
        into counterpart from public.match_suggestions m where m.id = rr.match_id;
      update public.reports set status = 'recovered', recovered_at = now()
       where id = counterpart and status in ('active', 'expired') and university_id = rr.university_id;
    end if;
    update public.recovery_requests set status = 'cancelled', closing_note = 'item_recovered'
     where report_id = rr.report_id and id <> rr.id and status in ('pending', 'security_review');
    perform public._audit(rr.university_id, 'recovery.completed', 'recovery_request', rr.id::text,
      jsonb_build_object('method', rr.handover_method));
    perform public._notify(rr.item_owner_id, 'recovery_completed', jsonb_build_object('request_id', rr.id), 'done:' || rr.id || ':o');
    perform public._notify(rr.finder_id, 'recovery_completed', jsonb_build_object('request_id', rr.id), 'done:' || rr.id || ':f');
    return 'completed';
  end if;

  perform public._audit(rr.university_id, 'recovery.confirmed_one_side', 'recovery_request', rr.id::text);
  -- Let the other party know a confirmation is waiting for them.
  perform public._notify(case when me = rr.item_owner_id then rr.finder_id else rr.item_owner_id end,
    'handover_confirmation', jsonb_build_object('request_id', rr.id), 'confirm:' || rr.id || ':' || me);
  return 'pending';
end $$;

-- A party reports that the handover failed (item not as described, no-show...).
create or replace function public.report_handover_failed(p_request uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare rr public.recovery_requests;
begin
  perform public._require_active_user();
  select * into rr from public.recovery_requests where id = p_request for update;
  if not found or auth.uid() not in (rr.item_owner_id, rr.finder_id) then
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
  if rr.status <> 'accepted' then raise exception 'state:invalid'; end if;
  update public.recovery_requests set status = 'failed', closing_note = left(p_reason, 500) where id = rr.id;
  perform public._audit(rr.university_id, 'recovery.failed', 'recovery_request', rr.id::text);
  perform public._notify(case when auth.uid() = rr.item_owner_id then rr.finder_id else rr.item_owner_id end,
    'request_status', jsonb_build_object('request_id', rr.id, 'status', 'failed'), 'req-status:' || rr.id || ':failed');
end $$;

create or replace function public.open_dispute(p_request uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  rr public.recovery_requests;
  new_id uuid;
  admin record;
begin
  perform public._require_active_user();
  select * into rr from public.recovery_requests where id = p_request for update;
  if not found or auth.uid() not in (rr.item_owner_id, rr.finder_id) then
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
  if rr.status not in ('accepted', 'completed', 'failed') then raise exception 'state:invalid'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'validation:reason'; end if;
  begin
    insert into public.disputes (university_id, recovery_request_id, opened_by, reason)
    values (rr.university_id, rr.id, auth.uid(), trim(p_reason)) returning id into new_id;
  exception when unique_violation then
    raise exception 'state:dispute_open';
  end;
  if rr.status = 'accepted' then
    update public.recovery_requests set status = 'disputed' where id = rr.id;
  end if;
  perform public._audit(rr.university_id, 'dispute.opened', 'dispute', new_id::text);
  for admin in select id from public.profiles where university_id = rr.university_id and role = 'university_admin' and deleted_at is null loop
    perform public._notify(admin.id, 'dispute_opened', jsonb_build_object('dispute_id', new_id), 'dispute:' || new_id || ':' || admin.id);
  end loop;
  return new_id;
end $$;

-- University admin resolves a dispute: resume the handover or cancel it.
-- Admins cannot mark a recovery completed on the parties' behalf.
create or replace function public.admin_resolve_dispute(p_dispute uuid, p_outcome text, p_resolution text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.disputes;
  rr public.recovery_requests;
begin
  perform public._require_active_user();
  select * into d from public.disputes where id = p_dispute for update;
  if not found or not public.is_university_admin(d.university_id) then
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
  if d.status <> 'open' then raise exception 'state:invalid'; end if;
  if p_outcome not in ('resume', 'cancel', 'dismiss') then raise exception 'validation:outcome'; end if;
  select * into rr from public.recovery_requests where id = d.recovery_request_id for update;

  update public.disputes set status = case when p_outcome = 'dismiss' then 'dismissed'::public.case_status else 'actioned'::public.case_status end,
    resolution = left(p_resolution, 1000), resolved_by = auth.uid(), resolved_at = now()
   where id = d.id;
  if rr.status = 'disputed' then
    update public.recovery_requests
       set status = case when p_outcome = 'cancel' then 'cancelled'::public.request_status else 'accepted'::public.request_status end,
           closing_note = case when p_outcome = 'cancel' then 'dispute_cancelled' else closing_note end
     where id = rr.id;
  end if;
  perform public._audit(d.university_id, 'dispute.resolved', 'dispute', d.id::text, jsonb_build_object('outcome', p_outcome));
  perform public._notify(rr.item_owner_id, 'dispute_resolved', jsonb_build_object('dispute_id', d.id, 'outcome', p_outcome), 'dispute-res:' || d.id || ':o');
  perform public._notify(rr.finder_id, 'dispute_resolved', jsonb_build_object('dispute_id', d.id, 'outcome', p_outcome), 'dispute-res:' || d.id || ':f');
end $$;

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create or replace function public.start_conversation(p_report uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uni uuid := public._require_active_user();
  me uuid := auth.uid();
  r public.reports;
  conv uuid;
begin
  select * into r from public.reports where id = p_report;
  if not found or r.university_id <> uni then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if r.owner_id = me then raise exception 'state:own_report'; end if;
  if r.status not in ('active', 'expired', 'recovered') then raise exception 'state:report_not_active'; end if;

  select id into conv from public.conversations where report_id = r.id and created_by = me;
  if conv is not null then return conv; end if;

  perform public._require_unrestricted();
  if public.is_blocked_between(me, r.owner_id) then raise exception 'state:blocked'; end if;

  insert into public.conversations (university_id, report_id, created_by) values (uni, r.id, me) returning id into conv;
  insert into public.conversation_participants (conversation_id, user_id, kind, last_read_at)
  values (conv, me, 'party', now()), (conv, r.owner_id, 'party', null);
  return conv;
end $$;

-- Security staff may join a conversation about a sensitive item or a
-- security-assisted handover (audited).
create or replace function public.security_join_conversation(p_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.conversations;
begin
  perform public._require_active_user();
  select * into c from public.conversations where id = p_conversation;
  if not found or not public.is_security_staff(c.university_id) then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.reports r where r.id = c.report_id and r.is_sensitive)
     and not exists (select 1 from public.recovery_requests rr where rr.report_id = c.report_id and rr.handover_method = 'security') then
    raise exception 'state:not_security_case';
  end if;
  insert into public.conversation_participants (conversation_id, user_id, kind)
  values (c.id, auth.uid(), 'security') on conflict do nothing;
  perform public._audit(c.university_id, 'security.joined_conversation', 'conversation', c.id::text);
end $$;

-- Conversations about a security case, listed for the university's security
-- staff so they can choose to join (joining is audited). Metadata only.
create or replace function public.security_case_conversations(p_report uuid)
returns table (conversation_id uuid, created_at timestamptz, last_message_at timestamptz, joined boolean)
language plpgsql stable security definer set search_path = '' as $$
declare r public.reports;
begin
  select * into r from public.reports where id = p_report;
  if not found or not public.is_security_staff(r.university_id) then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if not r.is_sensitive and not exists (select 1 from public.recovery_requests rr where rr.report_id = r.id and rr.handover_method = 'security') then
    return;
  end if;
  return query
    select c.id, c.created_at, c.last_message_at,
           exists (select 1 from public.conversation_participants cp where cp.conversation_id = c.id and cp.user_id = auth.uid())
    from public.conversations c where c.report_id = r.id order by c.last_message_at desc;
end $$;

create or replace function public._on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participants set last_read_at = new.created_at
   where conversation_id = new.conversation_id and user_id = new.sender_id;
  for p in select user_id from public.conversation_participants
            where conversation_id = new.conversation_id and user_id <> new.sender_id loop
    -- At most one message notification per conversation per recipient per hour.
    perform public._notify(p.user_id, 'new_message', jsonb_build_object('conversation_id', new.conversation_id),
      'msg:' || new.conversation_id || ':' || p.user_id || ':' || to_char(date_trunc('hour', new.created_at), 'YYYYMMDDHH24'));
  end loop;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages for each row execute function public._on_message();

-- ---------------------------------------------------------------------------
-- Ratings
-- ---------------------------------------------------------------------------
create or replace function public.submit_rating(p_request uuid, p_stars int, p_comment text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  rr public.recovery_requests;
  new_id uuid;
begin
  perform public._require_active_user();
  select * into rr from public.recovery_requests where id = p_request;
  if not found or rr.item_owner_id <> auth.uid() then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if rr.status <> 'completed' or rr.owner_confirmed_at is null
     or (rr.finder_confirmed_at is null and rr.security_confirmed_at is null) then
    raise exception 'state:not_completed';
  end if;
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'validation:stars'; end if;
  begin
    insert into public.ratings (university_id, recovery_request_id, rater_id, ratee_id, stars, comment)
    values (rr.university_id, rr.id, rr.item_owner_id, rr.finder_id, p_stars, nullif(left(trim(coalesce(p_comment, '')), 1000), ''))
    returning id into new_id;
  exception when unique_violation then
    raise exception 'state:already_rated';
  end;
  perform public._notify(rr.finder_id, 'rating_received', jsonb_build_object('rating_id', new_id), 'rating:' || new_id);
  return new_id;
end $$;

create or replace function public.user_rating_summary(p_user uuid) returns table (average numeric, total bigint)
language sql stable security definer set search_path = '' as $$
  select round(avg(r.stars)::numeric, 2), count(*)
  from public.ratings r
  join public.profiles p on p.id = r.ratee_id
  where r.ratee_id = p_user and r.hidden_at is null
    and (p.university_id = public.my_university_id() or public.is_global_admin())
$$;

-- ---------------------------------------------------------------------------
-- Abuse reports and graduated sanctions
-- ---------------------------------------------------------------------------
create or replace function public.submit_abuse_report(p_target_type public.abuse_target, p_target uuid, p_reason text, p_details text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uni uuid := public._require_active_user();
  me uuid := auth.uid();
  target_user uuid;
  target_uni uuid;
  new_id uuid;
begin
  case p_target_type
    when 'report' then select owner_id, university_id into target_user, target_uni from public.reports where id = p_target;
    when 'user' then select id, university_id into target_user, target_uni from public.profiles where id = p_target;
    when 'rating' then select rater_id, university_id into target_user, target_uni from public.ratings where id = p_target;
    when 'message' then
      select m.sender_id, c.university_id into target_user, target_uni
        from public.messages m join public.conversations c on c.id = m.conversation_id
       where m.id = p_target and public.is_conversation_participant(c.id);
    when 'conversation' then
      select null::uuid, c.university_id into target_user, target_uni
        from public.conversations c where c.id = p_target and public.is_conversation_participant(c.id);
      select cp.user_id into target_user from public.conversation_participants cp
       where cp.conversation_id = p_target and cp.user_id <> me and cp.kind = 'party' limit 1;
  end case;
  if target_uni is null or target_uni <> uni then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if target_user = me then raise exception 'state:self'; end if;
  begin
    insert into public.abuse_reports (university_id, reporter_id, target_type, target_id, target_user_id, reason, details)
    values (uni, me, p_target_type, p_target, target_user, p_reason, nullif(left(trim(coalesce(p_details, '')), 1000), ''))
    returning id into new_id;
  exception when unique_violation then
    raise exception 'state:already_reported';
  when check_violation then
    raise exception 'validation:reason';
  end;
  return new_id;
end $$;

-- Graduated response to confirmed false/misleading reports:
--  1st confirmed incident -> warning
--  2nd                    -> temporary restriction (7 days)
--  3rd and later          -> 14-day restriction + escalation for admin review
-- Never a permanent ban.
create or replace function public._apply_false_report_sanction(p_user uuid, p_uni uuid, p_abuse uuid) returns public.sanction_kind
language plpgsql security definer set search_path = '' as $$
declare
  prior int;
  v_kind public.sanction_kind;
  until_ts timestamptz;
begin
  select count(*) into prior from public.user_sanctions
   where user_id = p_user and reason = 'false_report' and kind in ('warning', 'temporary_restriction');
  if prior = 0 then
    v_kind := 'warning';
  else
    v_kind := 'temporary_restriction';
    until_ts := now() + case when prior = 1 then interval '7 days' else interval '14 days' end;
    update public.profile_private set restricted_until = greatest(coalesce(restricted_until, now()), until_ts) where id = p_user;
  end if;
  insert into public.user_sanctions (university_id, user_id, kind, reason, abuse_report_id, expires_at, issued_by)
  values (p_uni, p_user, v_kind, 'false_report', p_abuse, until_ts, auth.uid());
  if prior >= 2 then
    insert into public.user_sanctions (university_id, user_id, kind, reason, abuse_report_id, issued_by)
    values (p_uni, p_user, 'escalation', 'false_report', p_abuse, auth.uid());
  end if;
  perform public._notify(p_user, 'sanction', jsonb_build_object('kind', v_kind, 'until', until_ts), 'sanction:' || p_abuse);
  return v_kind;
end $$;

create or replace function public.admin_resolve_abuse(p_abuse uuid, p_action text, p_note text default null, p_remove_content boolean default false)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  a public.abuse_reports;
  result text := p_action;
begin
  perform public._require_active_user();
  select * into a from public.abuse_reports where id = p_abuse for update;
  if not found or not public.is_university_admin(a.university_id) then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if a.status <> 'open' then raise exception 'state:invalid'; end if;
  if p_action not in ('dismiss', 'action', 'confirm_false_report') then raise exception 'validation:action'; end if;

  if p_action = 'confirm_false_report' then
    if a.target_user_id is null then raise exception 'state:no_target_user'; end if;
    result := public._apply_false_report_sanction(a.target_user_id, a.university_id, a.id)::text;
  end if;

  if p_remove_content and p_action <> 'dismiss' then
    case a.target_type
      when 'report' then
        update public.reports set status = 'removed' where id = a.target_id and university_id = a.university_id and status <> 'recovered';
        update public.recovery_requests set status = 'cancelled', closing_note = 'report_removed'
         where report_id = a.target_id and status in ('pending', 'security_review', 'accepted');
      when 'message' then
        update public.messages set hidden_at = now() where id = a.target_id;
      when 'rating' then
        update public.ratings set hidden_at = now() where id = a.target_id and university_id = a.university_id;
      else null;
    end case;
  end if;

  update public.abuse_reports
     set status = case when p_action = 'dismiss' then 'dismissed'::public.case_status else 'actioned'::public.case_status end,
         outcome = result, reviewed_by = auth.uid(), reviewed_at = now()
   where id = a.id;
  perform public._audit(a.university_id, 'abuse.resolved', 'abuse_report', a.id::text,
    jsonb_build_object('action', p_action, 'result', result, 'removed', p_remove_content, 'note', left(p_note, 300)));
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- User administration
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_role(p_user uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.profiles;
begin
  perform public._require_active_user();
  select * into target from public.profiles where id = p_user for update;
  if not found or target.deleted_at is not null then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'state:self'; end if;
  if public.is_global_admin() then
    null; -- may assign any role
  elsif public.is_university_admin(target.university_id) then
    -- University admins manage regular users and security staff only.
    if p_role not in ('user', 'security') or target.role not in ('user', 'security') then
      raise exception 'auth:forbidden' using errcode = '42501';
    end if;
  else
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user;
  perform public._audit(target.university_id, 'user.role_changed', 'profile', p_user::text,
    jsonb_build_object('from', target.role, 'to', p_role));
end $$;

create or replace function public.admin_restrict_user(p_user uuid, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.profiles;
begin
  perform public._require_active_user();
  select * into target from public.profiles where id = p_user;
  if not found or not public.is_university_admin(target.university_id) or p_user = auth.uid() then
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
  if target.role in ('university_admin', 'global_admin') and not public.is_global_admin() then
    raise exception 'auth:forbidden' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 90 then raise exception 'validation:days'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'validation:reason'; end if;
  update public.profile_private set restricted_until = now() + make_interval(days => p_days) where id = p_user;
  insert into public.user_sanctions (university_id, user_id, kind, reason, expires_at, issued_by)
  values (target.university_id, p_user, 'temporary_restriction', left(trim(p_reason), 300), now() + make_interval(days => p_days), auth.uid());
  perform public._audit(target.university_id, 'user.restricted', 'profile', p_user::text, jsonb_build_object('days', p_days));
  perform public._notify(p_user, 'sanction', jsonb_build_object('kind', 'temporary_restriction', 'days', p_days),
    'restrict:' || p_user || ':' || extract(epoch from now())::bigint);
end $$;

create or replace function public.admin_lift_restriction(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.profiles;
begin
  perform public._require_active_user();
  select * into target from public.profiles where id = p_user;
  if not found or not public.is_university_admin(target.university_id) then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  update public.profile_private set restricted_until = null where id = p_user;
  insert into public.user_sanctions (university_id, user_id, kind, reason, issued_by)
  values (target.university_id, p_user, 'lifted', 'manual', auth.uid());
  perform public._audit(target.university_id, 'user.restriction_lifted', 'profile', p_user::text);
end $$;

-- Users list for admins (includes private restriction state, never email).
create or replace function public.admin_list_users(p_university uuid, p_search text default null)
returns table (id uuid, full_name text, role public.app_role, member_type public.member_type, faculty text,
               restricted_until timestamptz, sanctions bigint, reports bigint, created_at timestamptz, university_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_university is null and not public.is_global_admin() then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  if p_university is not null and not public.is_university_admin(p_university) then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  return query
    select p.id, p.full_name, p.role, p.member_type, p.faculty, pp.restricted_until,
      (select count(*) from public.user_sanctions s where s.user_id = p.id and s.kind <> 'lifted'),
      (select count(*) from public.reports r where r.owner_id = p.id),
      p.created_at, p.university_id
    from public.profiles p
    left join public.profile_private pp on pp.id = p.id
    where (p_university is null or p.university_id = p_university)
      and p.deleted_at is null
      and (p_search is null or p.full_name ilike '%' || replace(replace(p_search, '%', ''), '_', '') || '%')
    order by p.created_at desc
    limit 200;
end $$;

-- ---------------------------------------------------------------------------
-- Analytics (aggregates only; no personal data)
-- ---------------------------------------------------------------------------
create or replace function public.university_analytics(p_university uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
begin
  if not public.is_university_admin(p_university) then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total', count(*),
    'lost', count(*) filter (where type = 'lost'),
    'found', count(*) filter (where type = 'found'),
    'active', count(*) filter (where status = 'active'),
    'under_review', count(*) filter (where status = 'under_review'),
    'expired', count(*) filter (where status = 'expired'),
    'recovered', count(*) filter (where status = 'recovered'),
    'closed', count(*) filter (where status = 'closed'),
    'sensitive', count(*) filter (where is_sensitive),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar, 'count', x.n) order by x.n desc), '[]')
                    from (select category_id, count(*) n from public.reports where university_id = p_university group by category_id) x
                    join public.categories c on c.id = x.category_id),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'lost', d.lost, 'found', d.found) order by d.day), '[]')
              from (select gs::date as day,
                           (select count(*) from public.reports r where r.university_id = p_university and r.type = 'lost' and r.created_at::date = gs::date) lost,
                           (select count(*) from public.reports r where r.university_id = p_university and r.type = 'found' and r.created_at::date = gs::date) found
                    from generate_series(current_date - 29, current_date, interval '1 day') gs) d),
    'users', (select count(*) from public.profiles where university_id = p_university and deleted_at is null),
    'open_flags', (select count(*) from public.moderation_flags where university_id = p_university and resolved_at is null),
    'open_abuse', (select count(*) from public.abuse_reports where university_id = p_university and status = 'open'),
    'open_disputes', (select count(*) from public.disputes where university_id = p_university and status = 'open')
  ) into v_out
  from public.reports where university_id = p_university;
  return v_out;
end $$;

create or replace function public.global_analytics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_global_admin() then raise exception 'auth:forbidden' using errcode = '42501'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'university_id', u.id, 'name_en', u.name_en, 'name_ar', u.name_ar, 'is_active', u.is_active,
      'users', (select count(*) from public.profiles p where p.university_id = u.id and p.deleted_at is null),
      'reports', (select count(*) from public.reports r where r.university_id = u.id),
      'recovered', (select count(*) from public.reports r where r.university_id = u.id and r.status = 'recovered'),
      'active', (select count(*) from public.reports r where r.university_id = u.id and r.status = 'active')
    ) order by u.name_en), '[]')
    from public.universities u
  );
end $$;

-- Public, non-sensitive aggregate numbers for the landing page.
create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'universities', (select count(*) from public.universities where is_active),
    'recovered', (select count(*) from public.reports where status = 'recovered'),
    'reports', (select count(*) from public.reports where status <> 'removed')
  )
$$;

-- ---------------------------------------------------------------------------
-- Email outbox (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_email_notifications(p_limit int default 25)
returns table (id uuid, user_id uuid, kind text, data jsonb, attempts smallint, email text, locale text)
language sql security definer set search_path = '' as $$
  with c as (
    select n.id from public.notifications n
     where n.email_status in ('pending', 'sending') and n.next_attempt_at <= now()
     order by n.created_at
     limit greatest(1, least(p_limit, 100))
     for update skip locked
  )
  update public.notifications n
     set email_status = 'sending', email_attempts = n.email_attempts + 1,
         next_attempt_at = now() + interval '10 minutes'
    from c
   where n.id = c.id
  returning n.id, n.user_id, n.kind, n.data, n.email_attempts,
    (select u.email::text from auth.users u where u.id = n.user_id),
    (select pp.locale from public.profile_private pp where pp.id = n.user_id)
$$;

create or replace function public.complete_email_notification(p_id uuid, p_ok boolean, p_error text default null, p_max_attempts int default 3)
returns void language sql security definer set search_path = '' as $$
  update public.notifications
     set email_status = case when p_ok then 'sent'::public.email_status
                             when email_attempts >= p_max_attempts then 'failed'::public.email_status
                             else 'pending'::public.email_status end,
         email_last_error = case when p_ok then null else left(p_error, 300) end,
         next_attempt_at = case when p_ok then next_attempt_at
                                else now() + make_interval(mins => (power(2, email_attempts))::int) end
   where id = p_id and email_status = 'sending';
$$;

-- Audit configuration changes made through RLS-guarded table writes.
create or replace function public._audit_config_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events (university_id, actor_id, action, target_type, target_id, metadata)
  values (
    case when tg_table_name = 'universities' then new.id else (to_jsonb(new)->>'university_id')::uuid end,
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    new.id::text,
    jsonb_build_object('name_en', new.name_en, 'is_active', new.is_active)
  );
  return new;
end $$;
create trigger universities_audit after insert or update on public.universities
  for each row execute function public._audit_config_change();
create trigger categories_audit after insert or update on public.categories
  for each row execute function public._audit_config_change();

-- ---------------------------------------------------------------------------
-- Function privileges: deny by default, then allow the client API surface.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.my_university_id(), public.my_role(), public.is_global_admin(), public.is_university_admin(uuid),
  public.is_security_staff(uuid), public.is_restricted(), public.is_blocked_between(uuid, uuid),
  public.is_conversation_participant(uuid), public.can_moderate_conversation(uuid), public.has_active_request_on(uuid),
  public.create_report(jsonb), public.update_report(uuid, jsonb), public.close_report(uuid, text), public.renew_report(uuid),
  public.admin_review_report(uuid, text, text), public.hold_report(uuid, text[], text),
  public.decide_match(uuid, public.match_decision),
  public.create_recovery_request(uuid, text, text, uuid), public.respond_recovery_request(uuid, boolean, public.handover_method, text),
  public.security_review_request(uuid, boolean, text), public.withdraw_recovery_request(uuid),
  public.confirm_handover(uuid), public.report_handover_failed(uuid, text), public.open_dispute(uuid, text),
  public.admin_resolve_dispute(uuid, text, text),
  public.start_conversation(uuid), public.security_join_conversation(uuid), public.security_case_conversations(uuid),
  public.submit_rating(uuid, int, text), public.user_rating_summary(uuid),
  public.submit_abuse_report(public.abuse_target, uuid, text, text), public.admin_resolve_abuse(uuid, text, text, boolean),
  public.admin_set_role(uuid, public.app_role), public.admin_restrict_user(uuid, int, text), public.admin_lift_restriction(uuid),
  public.admin_list_users(uuid, text), public.university_analytics(uuid), public.global_analytics(),
  public.account_deletion_blockers()
to authenticated;

grant execute on function public.public_stats() to anon, authenticated;

grant execute on function public.expire_reports(), public.claim_email_notifications(int),
  public.complete_email_notification(uuid, boolean, text, int), public.hold_report(uuid, text[], text)
to service_role;
