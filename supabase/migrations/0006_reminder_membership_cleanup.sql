do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.task_reminders'::regclass
      and conname = 'task_reminders_workspace_member_fkey'
  ) then
    alter table public.task_reminders
      add constraint task_reminders_workspace_member_fkey
      foreign key (workspace_id, user_id)
      references public.workspace_members (workspace_id, user_id)
      on delete cascade
      not valid;
  end if;
end
$$;

create index if not exists task_reminders_workspace_user_idx
  on public.task_reminders (workspace_id, user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime is missing. Enable Supabase Realtime before applying this migration.';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_reminders'
  ) then
    alter publication supabase_realtime add table public.task_reminders;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
