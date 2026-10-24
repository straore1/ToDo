create extension if not exists pgcrypto;

create type public.workspace_role as enum ('owner', 'admin', 'member', 'observer');
create type public.task_status as enum ('todo', 'in_progress', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text,
  color text not null default '#4F46E5',
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  due_date date,
  completed_at timestamptz,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_workspace_created_idx on public.tasks (workspace_id, created_at desc);
create index tasks_workspace_status_idx on public.tasks (workspace_id, status, due_date);
create index projects_workspace_idx on public.projects (workspace_id, created_at desc);
create index workspace_members_user_idx on public.workspace_members (user_id, workspace_id);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace and wm.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_workspace_role(target_workspace uuid, allowed_roles public.workspace_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace
      and wm.user_id = (select auth.uid())
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger workspaces_set_updated_at before update on public.workspaces
for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.set_task_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at = now();
  elsif new.status <> 'done' then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger tasks_set_completed_at before update on public.tasks
for each row execute function public.set_task_completed_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  insert into public.workspaces (name, created_by)
  values ('Mon espace', new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.add_workspace_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_workspace_created
after insert on public.workspaces
for each row execute function public.add_workspace_creator_as_owner();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;

create policy "Profiles are visible to self and workspace peers"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.workspace_members own_member
    join public.workspace_members peer
      on peer.workspace_id = own_member.workspace_id
    where own_member.user_id = (select auth.uid()) and peer.user_id = profiles.id
  )
);
create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Members can view their workspaces"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));
create policy "Authenticated users can create workspaces"
on public.workspaces for insert to authenticated
with check (created_by = (select auth.uid()));
create policy "Owners and admins can update workspaces"
on public.workspaces for update to authenticated
using (public.has_workspace_role(id, array['owner', 'admin']::public.workspace_role[]))
with check (public.has_workspace_role(id, array['owner', 'admin']::public.workspace_role[]));
create policy "Owners can delete workspaces"
on public.workspaces for delete to authenticated
using (public.has_workspace_role(id, array['owner']::public.workspace_role[]));

create policy "Members can view workspace membership"
on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Owners and admins can add members"
on public.workspace_members for insert to authenticated
with check (
  (
    role in ('member', 'observer')
    and public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
  )
  or (
    role in ('owner', 'admin')
    and public.has_workspace_role(workspace_id, array['owner']::public.workspace_role[])
  )
);
create policy "Owners and admins can change non-owner roles"
on public.workspace_members for update to authenticated
using (
  role <> 'owner'
  and public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
)
with check (
  role <> 'owner'
  and (
    public.has_workspace_role(workspace_id, array['owner']::public.workspace_role[])
    or (
      role in ('member', 'observer')
      and public.has_workspace_role(workspace_id, array['admin']::public.workspace_role[])
    )
  )
);
create policy "Owners and admins can remove non-owner members"
on public.workspace_members for delete to authenticated
using (
  role <> 'owner'
  and public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[])
);

create policy "Workspace members can view projects"
on public.projects for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Editors can create projects"
on public.projects for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[])
);
create policy "Editors can update projects"
on public.projects for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));
create policy "Admins can delete projects"
on public.projects for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin']::public.workspace_role[]));

create policy "Workspace members can view tasks"
on public.tasks for select to authenticated
using (public.is_workspace_member(workspace_id));
create policy "Editors can create tasks"
on public.tasks for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[])
  and (project_id is null or exists (
    select 1 from public.projects p
    where p.id = project_id and p.workspace_id = tasks.workspace_id
  ))
);
create policy "Editors can update tasks"
on public.tasks for update to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]))
with check (
  public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[])
  and (project_id is null or exists (
    select 1 from public.projects p
    where p.id = project_id and p.workspace_id = tasks.workspace_id
  ))
);
create policy "Editors can delete tasks"
on public.tasks for delete to authenticated
using (public.has_workspace_role(workspace_id, array['owner', 'admin', 'member']::public.workspace_role[]));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
