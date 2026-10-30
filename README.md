# TodoFlow Pro

TodoFlow Pro is a French-first task-management app built with React, TypeScript, Vite and Supabase. The current release implements real Supabase authentication, a private workspace created at signup, and cloud-backed task and project management. It does not use mock task data.

## Architecture

- `src/App.tsx`: authentication screens and application shell.
- `src/features/tasks/task-service.ts`: typed data-access boundary for task queries and mutations.
- `src/features/projects/project-service.ts`: typed data-access boundary for project queries and creation.
- `src/lib/supabase.ts`: Supabase client configuration using public browser credentials only.
- `supabase/migrations/`: versioned PostgreSQL schema, role model, triggers and RLS policies.
- PostgreSQL RLS is the authorization boundary; hiding UI controls is not treated as security.

The initial schema models profiles, workspaces, workspace membership, projects and tasks. A signup trigger provisions a personal workspace and owner membership. Workspace roles are `owner`, `admin`, `member` and `observer`; observers have read-only access. Tasks and projects are scoped to a workspace.

## Run locally

1. Install Node.js 20.19+ or 22.12+.
2. Install dependencies: `npm install`.
3. Create a Supabase project.
4. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or `VITE_SUPABASE_PUBLISHABLE_KEY`) in `.env`. For compatibility, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are also accepted by Vite's config, which explicitly forwards only these two public values to the browser.
5. Apply `supabase/migrations/0001_initial_schema.sql` through `supabase/migrations/0006_reminder_membership_cleanup.sql` in order using the Supabase SQL editor or Supabase CLI.
6. In Supabase Auth settings, configure the local site URL as `http://localhost:5173` and enable email signup. Configure email confirmation as desired.
7. Start the app: `npm run dev`.

The browser key must be the publishable/anon key. Never put `service_role`, `SUPABASE_SECRET_KEY`, or other secrets in a `VITE_*` variable or frontend file. The Vite config does not load or expose secret keys. RLS is enabled on all application tables in the initial migration.

## Current scope and integrations

The task list loads at most 100 tasks per request. The current app supports account creation, sign-in/out, project creation and task grouping, task creation and editing (description, priority, due date and project), completion, deletion, text search, task subtasks, personal in-app reminders processed by Supabase Cron, an in-app notification center, a three-column Kanban board with persisted status changes, month/week calendar views with task creation on a selected date, Realtime refreshes, task comments, and an Analytics view for the currently loaded tasks. Analytics summarizes current status, priority and deadline counts, tasks created in the last seven days, and project distribution; it does not claim a completion history. The Analytics view can export all workspace tasks to CSV in pages; its dashboard statistics still use only the 100 tasks loaded for the app view, so the CSV is not a full account data export. Reminder times use the browser's local time zone and are stored as UTC instants. Completing or deleting a task cancels its unsent reminders. Email and Web Push delivery, invitations, full account export/deletion and dark mode are not yet implemented. No external notification delivery is claimed.

The reminder migrations enable `pg_cron`, schedule its database-side processor once per minute, add both reminder and notification tables to the existing Supabase Realtime publication, and cascade a member's reminders when they leave a workspace. Verify the project permits the `pg_cron` extension and has the `supabase_realtime` publication before applying them. Migration 0006 does not remove or repair any pre-existing orphan reminder rows; its membership constraint is added `NOT VALID` on upgraded databases to avoid rejecting historical data, while enforcing future writes and membership deletions.

## Commands

- `npm run dev` — local development server.
- `npm run build` — strict TypeScript check and production build.
- `npm test` — run the CSV export unit tests.
- `npm run preview` — serve the production build locally.
