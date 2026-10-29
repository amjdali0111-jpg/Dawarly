-- =============================================================================
-- DEVELOPMENT-ONLY SEED. Applied by `supabase db reset` on a LOCAL stack only;
-- `supabase db push` never runs it against a hosted project.
-- Contains only example universities so you can register locally. It creates
-- no users, reports, messages or matches.
-- =============================================================================
insert into public.universities (slug, name_en, name_ar, center_lat, center_lng) values
  ('dev-north-campus', 'Dev University (North Campus)', 'جامعة التطوير (الحرم الشمالي)', 24.7136, 46.6753),
  ('dev-south-campus', 'Dev University (South Campus)', 'جامعة التطوير (الحرم الجنوبي)', 21.4858, 39.1925)
on conflict (slug) do nothing;
