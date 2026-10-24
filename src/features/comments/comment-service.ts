import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name: string;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  return supabase;
}

export async function listTaskComments(taskId: string): Promise<TaskComment[]> {
  const client = requireSupabase();
  const { data: comments, error } = await client
    .from("task_comments")
    .select("id,task_id,author_id,content,created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  if (!comments.length) return [];

  const authorIds = [...new Set(comments.map((comment) => comment.author_id))];
  const { data: profiles, error: profilesError } = await client
    .from("profiles")
    .select("id,full_name")
    .in("id", authorIds);

  if (profilesError) throw profilesError;
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]));

  return comments.map((comment) => ({
    ...comment,
    author_name: names.get(comment.author_id)?.trim() || "Membre",
  }));
}

export async function addTaskComment(
  user: User,
  task: { id: string; workspace_id: string },
  content: string,
): Promise<void> {
  const trimmedContent = content.trim();
  if (!trimmedContent || trimmedContent.length > 4000) {
    throw new Error("Le commentaire doit contenir entre 1 et 4 000 caractères.");
  }

  const client = requireSupabase();
  const { error } = await client.from("task_comments").insert({
    task_id: task.id,
    workspace_id: task.workspace_id,
    author_id: user.id,
    content: trimmedContent,
  });
  if (error) throw error;
}
