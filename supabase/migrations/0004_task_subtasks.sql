create table public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  workspace_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  is_completed boolean not null default false,
  position double precision not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_subtasks_task_workspace_fkey
    foreign key (task_id, workspace_id)
    references public.tasks (id, workspace_id)
    on delete cascade
);

create index task_subtasks_task_position_idx
  on public.task_subtasks (task_id, position, created_at);

create trigger task_subtasks_set_updated_at
before update on public.task_subtasks
for each row execute function public.set_updated_at();

alter table public.task_subtasks enable row level security;

create policy "Workspace members can view task subtasks"
on public.task_subtasks for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Workspace editors can create task subtasks"
on public.task_subtasks for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_workspace_role(
    workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  )
);

create policy "Workspace editors can update task subtasks"
on public.task_subtasks for update to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  )
)
with check (
  public.has_workspace_role(
    workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  )
);

create policy "Workspace editors can delete task subtasks"
on public.task_subtasks for delete to authenticated
using (
  public.has_workspace_role(
    workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  )
);

grant select, insert, delete on public.task_subtasks to authenticated;
grant update (title, is_completed, position) on public.task_subtasks to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_subtasks'
  ) then
    alter publication supabase_realtime add table public.task_subtasks;
  end if;
end
$$;
