-- Live chat updates. Realtime postgres_changes respect RLS, so subscribers
-- only receive messages from conversations they can read.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
