import { supabase } from "../../lib/supabase";

export interface AppNotification {
  id: string;
  task_id: string | null;
  type: "task_reminder";
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface TaskReminder {
  id: string;
  task_id: string;
  remind_at: string;
  sent_at: string | null;
}

function requireSupabase() {
  if (!supabase) throw new Error("Supabase n’est pas configuré.");
  return supabase;
}

export async function listNotifications(): Promise<AppNotification[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("notifications")
    .select("id,task_id,type,title,body,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as AppNotification[];
}

export async function listTaskReminders(taskId: string): Promise<TaskReminder[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("task_reminders")
    .select("id,task_id,remind_at,sent_at")
    .eq("task_id", taskId)
    .order("remind_at", { ascending: true });
  if (error) throw error;
  return data as TaskReminder[];
}

export async function createTaskReminder(
  task: { id: string; workspace_id: string },
  userId: string,
  remindAt: string,
): Promise<void> {
  const parsedDate = new Date(remindAt);
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
    throw new Error("Choisissez une date et une heure futures.");
  }

  const client = requireSupabase();
  const { error } = await client.from("task_reminders").insert({
    task_id: task.id,
    workspace_id: task.workspace_id,
    user_id: userId,
    remind_at: parsedDate.toISOString(),
  });
  if (error) {
    if (error.code === "23505") throw new Error("Un rappel est déjà prévu à cette date pour cette tâche.");
    throw error;
  }
}

export async function deleteTaskReminder(reminderId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("task_reminders").delete().eq("id", reminderId);
  if (error) throw error;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) throw error;
}
