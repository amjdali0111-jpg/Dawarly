-- =============================================================================
-- Add three universities to the registration list. Registration reads active
-- rows from public.universities and handle_new_user() validates against the
-- same table, so inserting rows is all that is needed end-to-end.
--
-- Idempotent: a university is skipped if its slug, English name or Arabic name
-- already exists (so re-running, or an earlier manual insert, never duplicates).
-- Map centres are left unset; set them in /admin/universities.
-- =============================================================================
insert into public.universities (slug, name_en, name_ar)
select v.slug, v.name_en, v.name_ar
from (values
  ('sphinx-university', 'Sphinx University', 'جامعة سفينكس'),
  ('assiut-national-university', 'Assiut National University', 'جامعة أسيوط الأهلية'),
  ('assiut-university', 'Assiut University', 'جامعة أسيوط')
) as v(slug, name_en, name_ar)
where not exists (
  select 1 from public.universities u
  where u.slug = v.slug
     or lower(u.name_en) = lower(v.name_en)
     or u.name_ar = v.name_ar
);
