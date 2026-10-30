const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "src", "features", "tasks", "task-export.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
});
const compiledModule = new Module(sourcePath, module);
compiledModule.filename = sourcePath;
compiledModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
compiledModule._compile(compiled, sourcePath);
const { buildTasksCsv } = compiledModule.exports;

function task(overrides = {}) {
  return {
    id: "task-1",
    title: "Préparer la réunion",
    description: null,
    project_id: "project-1",
    status: "todo",
    priority: "normal",
    due_date: null,
    created_at: "2026-10-24T09:00:00.000Z",
    workspace_id: "workspace-1",
    ...overrides,
  };
}

test("builds a UTF-8 CSV with localized labels and project names", () => {
  const csv = buildTasksCsv(
    [task({ status: "in_progress", priority: "urgent", due_date: "2026-10-25" })],
    [{ id: "project-1", name: "Équipe produit" }],
  );

  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Titre","Description","Statut","Priorité","Échéance","Projet","Créée le"'));
  assert.ok(csv.includes('"Préparer la réunion","","En cours","Urgente","2026-10-25","Équipe produit"'));
});

test("quotes commas, newlines and embedded quotation marks", () => {
  const csv = buildTasksCsv(
    [task({ title: 'Plan, puis dire "bonjour"', description: "première ligne\r\nseconde ligne" })],
    [{ id: "project-1", name: 'Projet, "Alpha"' }],
  );

  assert.ok(csv.includes('"Plan, puis dire ""bonjour"""'));
  assert.ok(csv.includes('"première ligne\r\nseconde ligne"'));
  assert.ok(csv.includes('"Projet, ""Alpha"""'));
});

test("neutralizes spreadsheet formula prefixes in exported cells", () => {
  const csv = buildTasksCsv(
    [
      task({ title: "=1+1" }),
      task({ id: "task-2", title: "  @SUM(A1:A2)" }),
      task({ id: "task-3", title: "+cmd" }),
      task({ id: "task-4", title: "-1+1" }),
    ],
    [],
  );

  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'  @SUM(A1:A2)"'));
  assert.ok(csv.includes("\"'+cmd\""));
  assert.ok(csv.includes('"\'-1+1"'));
});

test("uses empty cells and a clear fallback for unavailable projects", () => {
  const csv = buildTasksCsv(
    [
      task({ description: null, due_date: null, project_id: null }),
      task({ id: "task-2", project_id: "deleted-project" }),
    ],
    [],
  );

  assert.ok(csv.includes('"Préparer la réunion","","À faire","Normale","","Sans projet"'));
  assert.ok(csv.includes('"Projet indisponible"'));
});
