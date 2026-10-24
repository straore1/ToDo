import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  archived_at: string | null;
  created_at: string;
  workspace_id: string;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  return supabase;
}

export async function listProjects(_user: User): Promise<Project[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("projects")
    .select("id,name,description,color,archived_at,created_at,workspace_id")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Project[];
}

export async function createProject(
  user: User,
  input: { name: string; description?: string; color: string },
): Promise<Project> {
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
    .from("projects")
    .insert({
      workspace_id: membership.workspace_id,
      created_by: user.id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      color: input.color,
    })
    .select("id,name,description,color,archived_at,created_at,workspace_id")
    .single();
  if (error) throw error;
  return data as Project;
}
