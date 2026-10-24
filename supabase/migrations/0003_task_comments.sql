alter table public.tasks
  add constraint tasks_id_workspace_id_unique unique (id, workspace_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  workspace_id uuid not null,
  author_id uuid not null references auth.users(id) on delete restrict,
  content text not null check (char_length(trim(content)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_comments_task_workspace_fkey
    foreign key (task_id, workspace_id)
    references public.tasks (id, workspace_id)
    on delete cascade
);

create index task_comments_task_created_idx
  on public.task_comments (task_id, created_at asc);

create trigger task_comments_set_updated_at
before update on public.task_comments
for each row execute function public.set_updated_at();

alter table public.task_comments enable row level security;

create policy "Workspace members can view task comments"
on public.task_comments for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "Workspace editors can add task comments"
on public.task_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and public.has_workspace_role(
    workspace_id,
    array['owner', 'admin', 'member']::public.workspace_role[]
  )
);

create policy "Authors and workspace admins can delete task comments"
on public.task_comments for delete to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    author_id = (select auth.uid())
    or public.has_workspace_role(
      workspace_id,
      array['owner', 'admin']::public.workspace_role[]
    )
  )
);

grant select, insert, delete on public.task_comments to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'task_comments'
  ) then
    alter publication supabase_realtime add table public.task_comments;
  end if;
end
$$;
