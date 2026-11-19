-- =============================================================================
-- Lock down four legacy tables that were created outside the migrations and are
-- not used by the application: test_reports, login_profiles, faculties,
-- categories_legacy. They carried full table privileges (including TRUNCATE)
-- for anon and authenticated, plus USING (true) policies, so anyone holding the
-- public API key could read test_reports (including user_id) and any signed-in
-- user could update its rows.
--
-- Data-preserving and reversible: no table, row, column or policy is dropped.
-- Only the anon/authenticated privileges (and those on the tables' own
-- sequences) are revoked. RLS stays enabled; postgres and service_role keep
-- access, so the data remains available to the project owner.
-- To restore the previous access: grant all on these tables and sequences to
-- anon, authenticated.
-- =============================================================================

revoke all on table public.test_reports, public.login_profiles, public.faculties, public.categories_legacy
  from anon, authenticated;

do $$
declare s regclass;
begin
  for s in
    select d.objid::regclass
    from pg_depend d
    join pg_class c on c.oid = d.objid and c.relkind = 'S'
    where d.deptype in ('a', 'i')
      and d.refobjid in ('public.test_reports'::regclass, 'public.login_profiles'::regclass,
                         'public.faculties'::regclass, 'public.categories_legacy'::regclass)
  loop
    execute format('revoke all on sequence %s from anon, authenticated', s);
  end loop;
end $$;

alter table public.test_reports      enable row level security;
alter table public.login_profiles    enable row level security;
alter table public.faculties         enable row level security;
alter table public.categories_legacy enable row level security;
