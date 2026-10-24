import type { Project } from "../projects/project-service";
import type { Task } from "./task-service";

function csvCell(value: string): string {
  const safeValue = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function localDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildTasksCsv(tasks: Task[], projects: Project[]): string {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const rows = [
    ["Titre", "Description", "Statut", "Priorité", "Échéance", "Projet", "Créée le"],
    ...tasks.map((task) => [
      task.title,
      task.description ?? "",
      task.status === "done" ? "Terminée" : task.status === "in_progress" ? "En cours" : "À faire",
      task.priority === "urgent" ? "Urgente" : task.priority === "high" ? "Haute" : task.priority === "low" ? "Basse" : "Normale",
      task.due_date ?? "",
      task.project_id ? projectNames.get(task.project_id) ?? "Projet indisponible" : "Sans projet",
      task.created_at,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function exportTasksCsv(tasks: Task[], projects: Project[]): void {
  const csv = buildTasksCsv(tasks, projects);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `todoflow-taches-${localDateStamp(new Date())}.csv`;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
