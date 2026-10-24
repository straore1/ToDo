create table public.task_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  remind_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint task_reminders_task_workspace_fkey
    foreign key (task_id, workspace_id)
    references public.tasks (id, workspace_id)
    on delete cascade,
  constraint task_reminders_workspace_member_fkey
    foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id)
    on delete cascade,
  constraint task_reminders_task_user_time_unique
    unique (task_id, user_id, remind_at)
);

create index task_reminders_due_idx
  on public.task_reminders (remind_at)
  where sent_at is null;
create index task_reminders_workspace_user_idx
  on public.task_reminders (workspace_id, user_id);
create index task_reminders_user_task_idx
  on public.task_reminders (user_id, task_id, remind_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid unique references public.task_reminders(id) on delete set null,
  task_id uuid,
  workspace_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('task_reminder')),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_task_workspace_fkey
    foreign key (task_id, workspace_id)
    references public.tasks (id, workspace_id)
    on delete set null (task_id, workspace_id)
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.task_reminders enable row level security;
alter table public.notifications enable row level security;

create policy "Users can view their own task reminders"
on public.task_reminders for select to authenticated
using (
  user_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
);

create policy "Editors can schedule their own workspace task reminders"
on public.task_reminders for insert to authenticated
with check (
  user_id = (select auth.uid())
  and sent_at is null
  and remind_at > now()
  and public.has_workspace_role(
    workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  )
  and exists (
    select 1
    from public.tasks task
    where task.id = task_reminders.task_id
      and task.workspace_id = task_reminders.workspace_id
      and task.status <> 'done'
  )
);

create policy "Users can cancel their own unsent reminders"
on public.task_reminders for delete to authenticated
using (
  user_id = (select auth.uid())
  and sent_at is null
  and public.is_workspace_member(workspace_id)
);

create policy "Users can view their own notifications"
on public.notifications for select to authenticated
using (user_id = (select auth.uid()));

create policy "Users can mark their own notifications as read"
on public.notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, delete on public.task_reminders to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.process_due_task_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  processed_count integer := 0;
begin
  with due_reminders as (
    select reminder.id, reminder.task_id, reminder.workspace_id, reminder.user_id
    from public.task_reminders reminder
    join public.tasks task
      on task.id = reminder.task_id
      and task.workspace_id = reminder.workspace_id
    join public.workspace_members membership
      on membership.workspace_id = reminder.workspace_id
      and membership.user_id = reminder.user_id
    where reminder.sent_at is null
      and reminder.remind_at <= now()
      and task.status <> 'done'
    order by reminder.remind_at
    for update of reminder skip locked
  ),
  created_notifications as (
    insert into public.notifications (
      reminder_id,
      task_id,
      workspace_id,
      user_id,
      type,
      title,
      body
    )
    select
      due.id,
      task.id,
      task.workspace_id,
      due.user_id,
      'task_reminder',
      'Rappel de tâche',
      'Une tâche nécessite votre attention.'
    from due_reminders due
    join public.tasks task on task.id = due.task_id
    on conflict (reminder_id) do nothing
    returning reminder_id
  ),
  completed_reminders as (
    update public.task_reminders reminder
    set sent_at = now()
    from due_reminders due
    where reminder.id = due.id
    returning reminder.id
  )
  select count(*)::integer into processed_count from completed_reminders;

  return processed_count;
end;
$$;

revoke all on function public.process_due_task_reminders() from public, anon, authenticated;
grant execute on function public.process_due_task_reminders() to service_role;

create or replace function public.cancel_task_reminders_when_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    delete from public.task_reminders
    where task_id = new.id
      and workspace_id = new.workspace_id
      and sent_at is null;
  end if;
  return new;
end;
$$;

create trigger tasks_cancel_pending_reminders
after update of status on public.tasks
for each row execute function public.cancel_task_reminders_when_completed();

create extension if not exists pg_cron;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid from cron.job where jobname = 'todoflow-process-due-reminders'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'todoflow-process-due-reminders',
    '* * * * *',
    'select public.process_due_task_reminders();'
  );
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'Publication supabase_realtime is missing. Enable Supabase Realtime for this project before applying this migration.';
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
