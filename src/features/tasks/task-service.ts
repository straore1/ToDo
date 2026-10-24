import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  workspace_id: string;
}

export interface NewTask {
  title: string;
  description?: string;
  priority: TaskPriority;
  due_date?: string;
  project_id?: string;
}

export type TaskUpdates = Partial<
  Pick<Task, "title" | "description" | "project_id" | "status" | "priority" | "due_date">
>;

const taskSelection = "id,title,description,project_id,status,priority,due_date,created_at,workspace_id";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  return supabase;
}

export async function listTasks(_user: User): Promise<Task[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("tasks")
    .select(taskSelection)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as Task[];
}

export async function listAllTasks(_user: User): Promise<Task[]> {
  const client = requireSupabase();
  const pageSize = 500;
  const tasks: Task[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("tasks")
      .select(taskSelection)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = data as Task[];
    tasks.push(...page);
    if (page.length < pageSize) return tasks;
  }
}

export async function createTask(user: User, input: NewTask): Promise<Task> {
  const client = requireSupabase();
  const { data: membership, error: membershipError } = await client
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;
  if (!membership) {
    throw new Error("Aucun espace de travail n’est associé à ce compte.");
  }

  const { data, error } = await client
    .from("tasks")
    .insert({
      workspace_id: membership.workspace_id,
      created_by: user.id,
      project_id: input.project_id || null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority,
      due_date: input.due_date || null,
    })
    .select("id,title,description,project_id,status,priority,due_date,created_at,workspace_id")
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(
  id: string,
  updates: TaskUpdates,
): Promise<void> {
  if (updates.title !== undefined) {
    const title = updates.title.trim();
    if (!title || title.length > 160) {
      throw new Error("Le titre doit contenir entre 1 et 160 caractères.");
    }
    updates = { ...updates, title };
  }
  if (updates.description !== undefined) {
    const description = updates.description?.trim() || null;
    if (description && description.length > 2000) {
      throw new Error("La description ne peut pas dépasser 2 000 caractères.");
    }
    updates = { ...updates, description };
  }

  const client = requireSupabase();
  const { error } = await client.from("tasks").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteTask(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("tasks").delete().eq("id", id);
  if (error) throw error;
}
