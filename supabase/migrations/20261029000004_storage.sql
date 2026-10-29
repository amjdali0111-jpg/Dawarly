-- =============================================================================
-- Storage: all buckets are PRIVATE. Files are served through short-lived
-- signed URLs generated with the viewer's own session, so storage RLS applies.
--
--   report-images     {university_id}/{user_id}/{uuid}.jpg
--   chat-attachments  {conversation_id}/{user_id}/{uuid}.jpg
--   avatars           {user_id}/{uuid}.jpg
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('report-images', 'report-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('chat-attachments', 'chat-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.safe_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;
grant execute on function public.safe_uuid(text) to authenticated;

-- Report images ----------------------------------------------------------------
create policy "report images: upload to own university folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-images'
    and (storage.foldername(name))[1] = (select public.my_university_id())::text
    and (storage.foldername(name))[2] = auth.uid()::text
    and not (select public.is_restricted())
  );

-- Readable by the uploader, or by anyone who can see the image row (which in
-- turn inherits report visibility and the sensitive-item photo rule).
create policy "report images: read if visible" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-images'
    and ((storage.foldername(name))[2] = auth.uid()::text
         or exists (select 1 from public.report_images ri where ri.storage_path = name))
  );

create policy "report images: owner deletes own uploads" on storage.objects
  for delete to authenticated
  using (bucket_id = 'report-images' and (storage.foldername(name))[2] = auth.uid()::text);

-- Chat attachments ---------------------------------------------------------------
create policy "chat attachments: participants upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and public.is_conversation_participant(public.safe_uuid((storage.foldername(name))[1]))
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "chat attachments: participants read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (public.is_conversation_participant(public.safe_uuid((storage.foldername(name))[1]))
         or public.can_moderate_conversation(public.safe_uuid((storage.foldername(name))[1])))
  );

-- Avatars --------------------------------------------------------------------------
create policy "avatars: own folder write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: own folder delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: same university read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and (p.university_id = (select public.my_university_id()) or (select public.is_global_admin()))
    )
  );
