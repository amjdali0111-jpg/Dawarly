-- =============================================================================
-- Fix: the registration page (anonymous visitor) could not list universities.
-- The universities/categories SELECT policies call is_global_admin() and
-- my_university_id(), but the anon role had no EXECUTE on them, so the query
-- failed with "permission denied". Both return false/NULL for anonymous
-- callers (auth.uid() is NULL), so granting EXECUTE exposes nothing new:
-- anon still sees only active universities and platform-default categories.
-- =============================================================================
grant execute on function public.is_global_admin(), public.my_university_id() to anon;
