import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export interface TaskSubtask {
  id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  position: number;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  return supabase;
}

export async function listSubtasks(taskId: string): Promise<TaskSubtask[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("task_subtasks")
    .select("id,task_id,title,is_completed,position")
    .eq("task_id", taskId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as TaskSubtask[];
}

export async function createSubtask(
  user: User,
  task: { id: string; workspace_id: string },
  title: string,
): Promise<void> {
  const normalizedTitle = title.trim();
  if (!normalizedTitle || normalizedTitle.length > 160) {
    throw new Error("Le titre doit contenir entre 1 et 160 caractères.");
  }

  const client = requireSupabase();
  const { data: lastSubtask, error: listError } = await client
    .from("task_subtasks")
    .select("position")
    .eq("task_id", task.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (listError) throw listError;

  const { error } = await client.from("task_subtasks").insert({
    task_id: task.id,
    workspace_id: task.workspace_id,
    created_by: user.id,
    title: normalizedTitle,
    position: (lastSubtask?.position ?? 0) + 1,
  });
  if (error) throw error;
}

export async function updateSubtask(
  id: string,
  updates: Partial<Pick<TaskSubtask, "title" | "is_completed">>,
): Promise<void> {
  if (updates.title !== undefined) {
    const title = updates.title.trim();
    if (!title || title.length > 160) {
      throw new Error("Le titre doit contenir entre 1 et 160 caractères.");
    }
    updates = { ...updates, title };
  }
  const client = requireSupabase();
  const { error } = await client.from("task_subtasks").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteSubtask(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("task_subtasks").delete().eq("id", id);
  if (error) throw error;
}
