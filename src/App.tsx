import { useEffect, useMemo, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  AlertCircle,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Columns3,
  Download,
  FolderKanban,
  ListChecks,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  BellRing,
  Search,
  Settings2,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { addTaskComment, listTaskComments, type TaskComment } from "./features/comments/comment-service";
import { createProject, listProjects, type Project } from "./features/projects/project-service";
import { createSubtask, deleteSubtask, listSubtasks, updateSubtask, type TaskSubtask } from "./features/subtasks/subtask-service";
import {
  createTaskReminder,
  deleteTaskReminder,
  listNotifications,
  listTaskReminders,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type TaskReminder,
} from "./features/notifications/notification-service";
import {
  createTask,
  deleteTask,
  listAllTasks,
  listTasks,
  updateTask,
  type NewTask,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskUpdates,
} from "./features/tasks/task-service";
import { exportTasksCsv } from "./features/tasks/task-export";

type View = "today" | "all" | "upcoming" | "completed" | "projects" | "calendar" | "analytics";
type TaskLayout = "list" | "kanban";

const taskColumns: { status: TaskStatus; title: string }[] = [
  { status: "todo", title: "À faire" },
  { status: "in_progress", title: "En cours" },
  { status: "done", title: "Terminées" },
];

const priorityNames: Record<TaskPriority, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};

const statusNames: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminée",
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error("Impossible de restaurer la session", error);
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <ConfigurationNotice />;
  if (authLoading) return <LoadingScreen />;
  if (!session?.user) return <AuthScreen />;
  return <Workspace user={session.user} />;
}

function ConfigurationNotice() {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="brand-mark"><CheckCheck size={22} /></div>
        <p className="eyebrow">TODOfLOW PRO · PREMIÈRE CONFIGURATION</p>
        <h1>Votre espace de travail<br />commence ici.</h1>
        <p className="setup-copy">
          Connectez un projet Supabase pour activer l’authentification et la sauvegarde cloud.
          Aucune donnée fictive ne sera affichée.
        </p>
        <ol className="setup-steps">
          <li><span>1</span> Copiez <code>.env.example</code> vers <code>.env</code>.</li>
          <li><span>2</span> Renseignez l’URL et la clé publique de votre projet Supabase.</li>
          <li><span>3</span> Exécutez <code>supabase/migrations/0001_initial_schema.sql</code>.</li>
          <li><span>4</span> Redémarrez le serveur avec <code>npm run dev</code>.</li>
        </ol>
        <div className="setup-note"><AlertCircle size={17} /> Gardez la clé <code>service_role</code> côté serveur uniquement.</div>
      </div>
    </main>
  );
}

function LoadingScreen() {
  return <main className="loading-screen"><LoaderCircle className="spin" size={24} /><span>Chargement de votre espace…</span></main>;
}

function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (signupError) throw signupError;
        if (!data.session) setMessage("Vérifiez votre boîte mail pour confirmer votre adresse.");
      } else {
        const { error: signinError } = await supabase.auth.signInWithPassword({ email, password });
        if (signinError) throw signinError;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-side">
        <div className="brand"><span className="brand-mark"><CheckCheck size={20} /></span><span>TodoFlow <b>Pro</b></span></div>
        <div className="auth-promo">
          <div className="promo-orbit orbit-one" /><div className="promo-orbit orbit-two" />
          <span className="promo-label"><Sparkles size={15} /> VOTRE CLARTÉ, AU QUOTIDIEN</span>
          <h1>Le travail avance<br />mieux quand tout<br /><em>est à sa place.</em></h1>
          <p>Vos idées, vos priorités et votre équipe — réunies dans un espace qui vous ressemble.</p>
          <div className="promo-task"><span className="promo-check"><Check size={13} /></span><span>Finaliser la présentation</span><span className="promo-tag">Aujourd’hui</span></div>
          <div className="promo-task muted"><span className="promo-empty" /><span>Préparer le point d’équipe</span><span className="promo-tag">Demain</span></div>
        </div>
        <div className="auth-side-footer">Conçu pour vous aider à faire place à l’essentiel.</div>
      </div>
      <section className="auth-main">
        <div className="auth-top"><span>Déjà organisé ?</span><button className="text-button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Créer un compte" : "Se connecter"} <span>↗</span></button></div>
        <div className="auth-form-wrap">
          <div className="mobile-brand brand"><span className="brand-mark"><CheckCheck size={20} /></span><span>TodoFlow <b>Pro</b></span></div>
          <div className="auth-heading-icon"><ListTodo size={21} /></div>
          <p className="eyebrow">{mode === "signin" ? "BON RETOUR" : "VOTRE ESPACE VOUS ATTEND"}</p>
          <h2>{mode === "signin" ? "Ravi de vous revoir." : "Tout commence ici."}</h2>
          <p className="form-subtitle">{mode === "signin" ? "Connectez-vous pour retrouver votre espace." : "Créez votre compte pour démarrer."}</p>
          <form onSubmit={submit} className="auth-form">
            {mode === "signup" && <label>Nom complet<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Camille Martin" required /></label>}
            <label>Adresse e-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.fr" required /></label>
            <label>Mot de passe<input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8 caractères minimum" required /></label>
            {error && <div className="form-alert error"><AlertCircle size={16} />{error}</div>}
            {message && <div className="form-alert success"><Check size={16} />{message}</div>}
            <button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{mode === "signin" ? "Se connecter" : "Créer mon compte"} <span>→</span></button>
          </form>
          <p className="auth-terms">En continuant, vous acceptez nos conditions d’utilisation et notre politique de confidentialité.</p>
        </div>
      </section>
    </main>
  );
}

function Workspace({ user }: { user: User }) {
  const [view, setView] = useState<View>("today");
  const [taskLayout, setTaskLayout] = useState<TaskLayout>("list");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [taskForComments, setTaskForComments] = useState<Task | null>(null);
  const [taskForEdit, setTaskForEdit] = useState<Task | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [newTaskDueDate, setNewTaskDueDate] = useState<string | undefined>();
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [calendarMode, setCalendarMode] = useState<"month" | "week">("month");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [realtimeError, setRealtimeError] = useState("");
  const queryClient = useQueryClient();
  const tasksQuery = useQuery({
    queryKey: ["tasks", user.id],
    queryFn: () => listTasks(user),
  });
  const projectsQuery = useQuery({
    queryKey: ["projects", user.id],
    queryFn: () => listProjects(user),
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications", user.id],
    queryFn: listNotifications,
  });

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const refreshWorkspaceData = () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["projects", user.id] });
    };

    const channel = client
      .channel(`workspace-data:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refreshWorkspaceData)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, refreshWorkspaceData)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["comments", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_subtasks" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["subtasks", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_reminders" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["reminders", user.id] });
      })
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") {
          setRealtimeError("");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeError(error?.message ?? "La synchronisation en temps réel est indisponible.");
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [queryClient, user.id]);
  const tasks = tasksQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const visibleTasks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (activeProjectId && task.project_id !== activeProjectId) return false;
      if (view === "completed" && task.status !== "done") return false;
      if (view === "projects") return false;
      if (view !== "completed" && view !== "all" && view !== "calendar" && view !== "analytics" && task.status === "done") return false;
      if (view === "today" && task.status !== "done" && (!task.due_date || !isToday(new Date(`${task.due_date}T12:00:00`)))) return false;
      if (view === "upcoming" && task.status !== "done" && (!task.due_date || !isAfter(new Date(`${task.due_date}T12:00:00`), startOfDay(new Date())))) return false;
      return !normalizedSearch || `${task.title} ${task.description ?? ""}`.toLowerCase().includes(normalizedSearch);
    });
  }, [tasks, view, search, activeProjectId]);

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { status: TaskStatus } }) => updateTask(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", user.id] }),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", user.id] }),
  });

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const title = view === "today" ? "Ma journée" : view === "upcoming" ? "À venir" : view === "completed" ? "Terminées" : view === "projects" ? "Mes projets" : view === "calendar" ? "Calendrier" : view === "analytics" ? "Analyses" : activeProject?.name ?? "Toutes les tâches";
  const firstName = user.user_metadata.full_name?.split(" ")[0] || user.email?.split("@")[0] || "vous";
  const completedCount = tasks.filter((task) => task.status === "done").length;
  const pendingCount = tasks.filter((task) => task.status !== "done").length;
  const overdueCount = tasks.filter((task) => task.status !== "done" && task.due_date && new Date(`${task.due_date}T12:00:00`) < startOfDay(new Date())).length;
  const mutationError = updateMutation.error ?? deleteMutation.error;
  const canShowBoard = view === "all" || Boolean(activeProjectId);
  const unreadNotifications = notificationsQuery.data?.filter((notification) => !notification.read_at).length ?? 0;

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutError(error.message);
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button aria-label="Fermer le menu" className="mobile-scrim" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand"><span className="brand-mark"><CheckCheck size={19} /></span><span>TodoFlow <b>Pro</b></span><button aria-label="Fermer le menu" className="icon-button close-sidebar" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <button className="workspace-switch"><span className="workspace-avatar">P</span><span className="workspace-name"><b>Mon espace</b><small>Espace personnel</small></span><ChevronDown size={15} /></button>
        <nav className="side-nav" aria-label="Navigation principale">
          <p className="nav-caption">ESPACE DE TRAVAIL</p>
          <NavButton icon={<LayoutDashboard size={17} />} label="Ma journée" active={view === "today"} count={tasks.filter((task) => task.status !== "done" && task.due_date && isToday(new Date(`${task.due_date}T12:00:00`))).length} onClick={() => { setActiveProjectId(null); setView("today"); setSidebarOpen(false); }} />
          <NavButton icon={<CalendarDays size={17} />} label="À venir" active={view === "upcoming"} onClick={() => { setActiveProjectId(null); setView("upcoming"); setSidebarOpen(false); }} />
          <NavButton icon={<ListTodo size={17} />} label="Toutes les tâches" active={view === "all" && !activeProjectId} onClick={() => { setActiveProjectId(null); setView("all"); setSidebarOpen(false); }} />
          <NavButton icon={<CalendarRange size={17} />} label="Calendrier" active={view === "calendar"} onClick={() => { setActiveProjectId(null); setView("calendar"); setSidebarOpen(false); }} />
          <NavButton icon={<FolderKanban size={17} />} label="Mes projets" active={view === "projects"} onClick={() => { setActiveProjectId(null); setView("projects"); setSidebarOpen(false); }} />
          <NavButton icon={<CheckCheck size={17} />} label="Terminées" active={view === "completed"} onClick={() => { setActiveProjectId(null); setView("completed"); setSidebarOpen(false); }} />
          <NavButton icon={<BarChart3 size={17} />} label="Analyses" active={view === "analytics"} onClick={() => { setActiveProjectId(null); setView("analytics"); setSidebarOpen(false); }} />
          <p className="nav-caption nav-caption-spaced">VOTRE ESPACE</p>
          <NavButton icon={<Settings2 size={17} />} label="Paramètres" onClick={() => undefined} disabled title="Fonctionnalité à venir" />
          <NavButton icon={<CircleHelp size={17} />} label="Aide & support" onClick={() => undefined} disabled title="Fonctionnalité à venir" />
        </nav>
        <div className="sidebar-bottom">
          {signOutError && <div className="form-alert error sidebar-error"><AlertCircle size={15} /><span>{signOutError}</span></div>}
          <div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={16} /></div><b>Un espace, mille idées.</b><p>Les projets et la collaboration arrivent dans une prochaine étape.</p></div>
          <div className="user-profile"><div className="user-avatar">{firstName.slice(0, 1).toUpperCase()}</div><div className="user-info"><b>{firstName}</b><small>{user.email}</small></div><button className="icon-button profile-logout" aria-label="Se déconnecter" title="Se déconnecter" onClick={signOut}><LogOut size={17} /></button></div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button aria-label="Ouvrir le menu" className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Mon espace</span><span className="crumb-slash">/</span><b>{title}</b></div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={16} /><input aria-label="Rechercher une tâche" placeholder="Rechercher…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} non lues` : ""}`} title="Notifications internes" onClick={() => setShowNotifications(true)}><Bell size={18} />{unreadNotifications > 0 && <span />}</button>
            <button className="top-avatar" aria-label="Compte utilisateur">{firstName.slice(0, 1).toUpperCase()}</button>
          </div>
        </header>
        <section className="content">
          {realtimeError && <div className="form-alert realtime-alert"><AlertCircle size={16} /><span>{realtimeError} Les modifications restent enregistrées ; actualisez la page pour les récupérer.</span><button onClick={() => window.location.reload()}>Actualiser</button></div>}
          <div className="page-heading">
            <div><p className="eyebrow">{format(new Date(), "EEEE d MMMM yyyy", { locale: fr }).toUpperCase()}</p><h1>{title}<span className="heading-period">.</span></h1><p className="welcome-line">Une chose après l’autre, {firstName}.</p></div>
            {view === "projects"
              ? <button className="primary-button create-button" onClick={() => setShowCreateProject(true)}><Plus size={18} /> Nouveau projet</button>
              : <button className="primary-button create-button" onClick={() => setShowCreate(true)}><Plus size={18} /> Nouvelle tâche</button>}
          </div>
          <div className="stats-grid">
            <StatCard icon={<ListTodo size={18} />} label="À faire" value={pendingCount} accent="indigo" foot="dans votre espace" />
            <StatCard icon={<Check size={18} />} label="Terminées" value={completedCount} accent="green" foot="bravo pour l’avancée" />
            <StatCard icon={<Clock3 size={18} />} label="En retard" value={overdueCount} accent="orange" foot={overdueCount ? "à traiter en priorité" : "vous êtes à jour"} />
            <div className="focus-card"><div className="focus-card-top"><span className="focus-icon"><Sun size={17} /></span><span className="focus-chip">VOTRE RYTHME</span><MoreHorizontal size={17} /></div><div className="focus-number">{tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0}<span>%</span></div><p>de vos tâches accomplies</p><div className="progress-track"><span style={{ width: `${tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0}%` }} /></div></div>
          </div>
          <section className={`task-section ${view === "calendar" ? "calendar-task-section" : ""}`}>
            {view === "analytics" ? (
              tasksQuery.isPending || projectsQuery.isPending ? <div className="state-card"><LoaderCircle className="spin" size={20} /><span>Chargement des analyses…</span></div>
                : tasksQuery.isError ? <div className="state-card state-error"><AlertCircle size={20} /><span>{tasksQuery.error.message || "Impossible de charger les tâches."}</span><button onClick={() => tasksQuery.refetch()}>Réessayer</button></div>
                  : projectsQuery.isError ? <div className="state-card state-error"><AlertCircle size={20} /><span>{projectsQuery.error.message || "Impossible de charger les projets pour les analyses."}</span><button onClick={() => projectsQuery.refetch()}>Réessayer</button></div>
                  : <AnalyticsView user={user} tasks={tasks} projects={projects} />
            ) : view === "calendar" ? (
              tasksQuery.isPending ? <div className="state-card"><LoaderCircle className="spin" size={20} /><span>Chargement de vos tâches…</span></div>
                : tasksQuery.isError ? <div className="state-card state-error"><AlertCircle size={20} /><span>{tasksQuery.error.message || "Impossible de charger les tâches."}</span><button onClick={() => tasksQuery.refetch()}>Réessayer</button></div>
                  : <CalendarView tasks={visibleTasks} date={calendarDate} mode={calendarMode} onDateChange={setCalendarDate} onModeChange={setCalendarMode} onTaskSelect={setTaskForEdit} onCreateForDate={(date) => { setCalendarDate(date); setNewTaskDueDate(format(date, "yyyy-MM-dd")); setShowCreate(true); }} />
            ) : view === "projects" ? (
              <ProjectSection
                projects={projects}
                tasks={tasks}
                loading={projectsQuery.isPending}
                error={projectsQuery.error}
                onRetry={() => projectsQuery.refetch()}
                onSelect={(project) => { setActiveProjectId(project.id); setView("all"); setSidebarOpen(false); }}
                onCreate={() => setShowCreateProject(true)}
              />
            ) : (
              <>
                <div className="section-heading"><div><h2>{activeProject ? `Tâches du projet ${activeProject.name}` : view === "today" ? "Vos priorités du jour" : view === "upcoming" ? "Les prochains jours" : view === "completed" ? "Vos tâches terminées" : "Votre liste"}</h2><p>{visibleTasks.length ? `${visibleTasks.length} tâche${visibleTasks.length === 1 ? "" : "s"} à portée de main` : "Votre espace, à votre rythme"}</p></div>{canShowBoard && <div className="layout-toggle" role="group" aria-label="Disposition des tâches"><button className={taskLayout === "list" ? "layout-option active" : "layout-option"} aria-pressed={taskLayout === "list"} onClick={() => setTaskLayout("list")}><ListTodo size={15} /><span>Liste</span></button><button className={taskLayout === "kanban" ? "layout-option active" : "layout-option"} aria-pressed={taskLayout === "kanban"} onClick={() => setTaskLayout("kanban")}><Columns3 size={15} /><span>Kanban</span></button></div>}</div>
                {mutationError && <div className="form-alert error action-error"><AlertCircle size={16} /><span>{mutationError.message || "La modification n’a pas pu être enregistrée."}</span><button onClick={() => { updateMutation.reset(); deleteMutation.reset(); }}>Fermer</button></div>}
                {tasksQuery.isPending ? <div className="state-card"><LoaderCircle className="spin" size={20} /><span>Chargement de vos tâches…</span></div> : tasksQuery.isError ? <div className="state-card state-error"><AlertCircle size={20} /><span>{tasksQuery.error instanceof Error ? tasksQuery.error.message : "Impossible de charger les tâches."}</span><button onClick={() => tasksQuery.refetch()}>Réessayer</button></div> : taskLayout === "kanban" && canShowBoard ? <KanbanBoard tasks={visibleTasks} projects={projects} busy={updateMutation.isPending || deleteMutation.isPending} onStatusChange={(id, status) => updateMutation.mutate({ id, updates: { status } })} onEdit={setTaskForEdit} onComments={setTaskForComments} onDelete={(task) => { if (window.confirm("Supprimer cette tâche ?")) deleteMutation.mutate(task.id); }} /> : visibleTasks.length ? <div className="task-list">{visibleTasks.map((task) => <TaskRow key={task.id} task={task} projectName={projects.find((project) => project.id === task.project_id)?.name} onToggle={() => updateMutation.mutate({ id: task.id, updates: { status: task.status === "done" ? "todo" : "done" } })} onEdit={() => setTaskForEdit(task)} onDelete={() => { if (window.confirm("Supprimer cette tâche ?")) deleteMutation.mutate(task.id); }} onComments={() => setTaskForComments(task)} busy={updateMutation.isPending || deleteMutation.isPending} />)}</div> : <EmptyState view={view} search={search} onCreate={() => setShowCreate(true)} />}
              </>
            )}
          </section>
          <footer className="page-footer"><span><span className="status-dot" /> Vos données sont synchronisées avec Supabase</span><span>Un petit pas compte aussi.</span></footer>
        </section>
      </main>
      {showCreate && <CreateTaskDialog user={user} projects={projects} initialProjectId={activeProjectId} initialDueDate={newTaskDueDate} onClose={() => { setShowCreate(false); setNewTaskDueDate(undefined); }} onCreated={() => queryClient.invalidateQueries({ queryKey: ["tasks", user.id] })} />}
      {showCreateProject && <CreateProjectDialog user={user} onClose={() => setShowCreateProject(false)} onCreated={() => queryClient.invalidateQueries({ queryKey: ["projects", user.id] })} />}
      {taskForComments && <TaskCommentsDialog user={user} task={taskForComments} onClose={() => setTaskForComments(null)} />}
      {taskForEdit && <EditTaskDialog user={user} task={taskForEdit} projects={projects} onClose={() => setTaskForEdit(null)} onUpdated={() => queryClient.invalidateQueries({ queryKey: ["tasks", user.id] })} />}
      {showNotifications && <NotificationCenter user={user} notifications={notificationsQuery.data ?? []} loading={notificationsQuery.isPending} error={notificationsQuery.error} onRetry={() => notificationsQuery.refetch()} tasks={tasks} onClose={() => setShowNotifications(false)} onOpenTask={(task) => { setShowNotifications(false); setTaskForEdit(task); }} />}
    </div>
  );
}

function NavButton({ icon, label, active, count, onClick, disabled, title }: { icon: React.ReactNode; label: string; active?: boolean; count?: number; onClick: () => void; disabled?: boolean; title?: string }) {
  return <button className={`nav-item ${active ? "nav-item-active" : ""}`} onClick={onClick} disabled={disabled} title={title}>{icon}<span>{label}</span>{typeof count === "number" && count > 0 && <small>{count}</small>}</button>;
}

function StatCard({ icon, label, value, accent, foot }: { icon: React.ReactNode; label: string; value: number; accent: string; foot: string }) {
  return <div className="stat-card"><div className="stat-card-top"><span className={`stat-icon ${accent}`}>{icon}</span><MoreHorizontal size={17} className="stat-more" /></div><p className="stat-label">{label}</p><div className="stat-value">{value}</div><p className="stat-foot">{foot}</p></div>;
}

function AnalyticsView({ user, tasks, projects }: { user: User; tasks: Task[]; projects: Project[] }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === "done").length;
  const now = startOfDay(new Date());
  const dueWindowEnd = addDays(now, 8);
  const overdue = tasks.filter((task) => task.status !== "done" && task.due_date && new Date(`${task.due_date}T12:00:00`) < now).length;
  const dueSoon = tasks.filter((task) => {
    if (task.status === "done" || !task.due_date) return false;
    const dueDate = new Date(`${task.due_date}T12:00:00`);
    return dueDate >= now && dueDate < dueWindowEnd;
  }).length;
  const withoutDueDate = tasks.filter((task) => task.status !== "done" && !task.due_date).length;
  const recentlyCreated = tasks.filter((task) => new Date(task.created_at) >= addDays(now, -6)).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  const statusRows = taskColumns.map((column) => ({
    label: column.title,
    count: tasks.filter((task) => task.status === column.status).length,
    tone: column.status,
  }));
  const priorityRows = [
    { label: priorityNames.urgent, priority: "urgent", tone: "urgent" },
    { label: priorityNames.high, priority: "high", tone: "high" },
    { label: priorityNames.normal, priority: "normal", tone: "normal" },
    { label: priorityNames.low, priority: "low", tone: "low" },
  ].map((item) => ({ ...item, count: tasks.filter((task) => task.priority === item.priority).length }));
  const projectRows = [
    ...projects.map((project) => ({
      label: project.name,
      count: tasks.filter((task) => task.project_id === project.id).length,
      tone: "project",
    })),
    { label: "Sans projet", count: tasks.filter((task) => !task.project_id).length, tone: "unassigned" },
  ].sort((left, right) => right.count - left.count).slice(0, 5);

  function BreakdownRows({ rows }: { rows: { label: string; count: number; tone: string }[] }) {
    return <div className="analytics-breakdown">{rows.map((row) => (
      <div className="analytics-breakdown-row" key={row.label}>
        <div className="analytics-breakdown-label"><span>{row.label}</span><b>{row.count}</b></div>
        <div className="analytics-track" role="progressbar" aria-label={`${row.label} : ${row.count} tâche${row.count === 1 ? "" : "s"}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={row.count}>
          <span className={`analytics-bar ${row.tone}`} style={{ width: `${total ? (row.count / total) * 100 : 0}%` }} />
        </div>
      </div>
    ))}</div>;
  }

  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      const allTasks = await listAllTasks(user);
      exportTasksCsv(allTasks, projects);
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "L’export des tâches a échoué.");
    } finally {
      setExporting(false);
    }
  }

  return <div className="analytics-view">
    <div className="section-heading analytics-heading">
      <div><h2>Vue d’ensemble</h2><p>Indicateurs calculés sur les tâches actuellement chargées.</p></div>
      <div className="analytics-heading-actions"><span className="analytics-scope">Indicateurs : 100 max.</span><button className="secondary-button analytics-export" onClick={() => void handleExport()} disabled={exporting}>{exporting ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />}<span>{exporting ? "Préparation…" : "Exporter toutes les tâches"}</span></button></div>
    </div>
    {exportError && <div className="form-alert error" role="alert"><AlertCircle size={16} /><span>{exportError}</span><button className="text-button" onClick={() => setExportError("")}>Fermer</button></div>}
    <div className="analytics-metrics">
      <article className="analytics-metric"><span>Tâches suivies</span><b>{total}</b><small>dans votre espace</small></article>
      <article className="analytics-metric"><span>Progression</span><b>{completionRate}%</b><small>{completed} tâche{completed === 1 ? "" : "s"} terminée{completed === 1 ? "" : "s"}</small></article>
      <article className="analytics-metric analytics-metric-warning"><span>En retard</span><b>{overdue}</b><small>à traiter en priorité</small></article>
      <article className="analytics-metric"><span>Créées récemment</span><b>{recentlyCreated}</b><small>au cours des 7 derniers jours</small></article>
    </div>
    <div className="analytics-grid">
      <section className="analytics-card">
        <div className="analytics-card-heading"><h3>Répartition par statut</h3><span>{total} au total</span></div>
        {total ? <BreakdownRows rows={statusRows} /> : <p className="analytics-empty">Ajoutez des tâches pour voir leur répartition.</p>}
      </section>
      <section className="analytics-card">
        <div className="analytics-card-heading"><h3>Priorités</h3><span>{total} au total</span></div>
        {total ? <BreakdownRows rows={priorityRows} /> : <p className="analytics-empty">Aucune priorité à analyser pour le moment.</p>}
      </section>
      <section className="analytics-card analytics-deadlines">
        <div className="analytics-card-heading"><h3>Échéances</h3><span>tâches non terminées</span></div>
        <div className="analytics-deadline-list">
          <div><span className="analytics-deadline-dot overdue" /><span>En retard</span><b>{overdue}</b></div>
          <div><span className="analytics-deadline-dot soon" /><span>Dans les 7 jours</span><b>{dueSoon}</b></div>
          <div><span className="analytics-deadline-dot none" /><span>Sans échéance</span><b>{withoutDueDate}</b></div>
        </div>
      </section>
      <section className="analytics-card analytics-projects">
        <div className="analytics-card-heading"><h3>Tâches par projet</h3><span>{projects.length} projet{projects.length === 1 ? "" : "s"}</span></div>
        {total ? <BreakdownRows rows={projectRows} /> : <p className="analytics-empty">La répartition apparaîtra lorsque vous créerez des tâches.</p>}
      </section>
    </div>
    <p className="analytics-footnote">Ces chiffres reflètent l’état actuel des tâches. L’historique détaillé des tâches terminées n’est pas encore disponible.</p>
  </div>;
}

function CalendarView({ tasks, date, mode, onDateChange, onModeChange, onTaskSelect, onCreateForDate }: {
  tasks: Task[];
  date: Date;
  mode: "month" | "week";
  onDateChange: (date: Date) => void;
  onModeChange: (mode: "month" | "week") => void;
  onTaskSelect: (task: Task) => void;
  onCreateForDate: (date: Date) => void;
}) {
  const periodStart = mode === "month"
    ? startOfWeek(startOfMonth(date), { weekStartsOn: 1 })
    : startOfWeek(date, { weekStartsOn: 1 });
  const periodEnd = mode === "month"
    ? endOfWeek(endOfMonth(date), { weekStartsOn: 1 })
    : endOfWeek(date, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: periodStart, end: periodEnd });
  const periodLabel = mode === "month"
    ? format(date, "MMMM yyyy", { locale: fr })
    : `${format(periodStart, "d MMM", { locale: fr })} – ${format(periodEnd, "d MMM yyyy", { locale: fr })}`;
  const weekDays = days.slice(0, 7).map((day) => format(day, "EEEEEE", { locale: fr }));

  function movePeriod(direction: -1 | 1) {
    onDateChange(mode === "month" ? addMonths(date, direction) : addWeeks(date, direction));
  }

  return <div className="calendar-view">
    <div className="calendar-toolbar">
      <div className="calendar-period-controls">
        <button className="calendar-today-button" onClick={() => onDateChange(new Date())}>Aujourd’hui</button>
        <button className="icon-button calendar-nav-button" aria-label="Période précédente" onClick={() => movePeriod(-1)}><ChevronLeft size={17} /></button>
        <button className="icon-button calendar-nav-button" aria-label="Période suivante" onClick={() => movePeriod(1)}><ChevronRight size={17} /></button>
        <h2>{periodLabel}</h2>
      </div>
      <div className="layout-toggle" role="group" aria-label="Période du calendrier">
        <button className={mode === "month" ? "layout-option active" : "layout-option"} aria-pressed={mode === "month"} onClick={() => onModeChange("month")}>Mois</button>
        <button className={mode === "week" ? "layout-option active" : "layout-option"} aria-pressed={mode === "week"} onClick={() => onModeChange("week")}>Semaine</button>
      </div>
    </div>
    <div className={`calendar-grid ${mode === "week" ? "calendar-week-mode" : ""}`} role="grid" aria-label={`Calendrier ${periodLabel}`}>
      {weekDays.map((day, index) => <div className="calendar-weekday" role="columnheader" key={`${day}-${index}`}>{day}</div>)}
      {days.map((day) => {
        const dayTasks = tasks.filter((task) => task.due_date === format(day, "yyyy-MM-dd"));
        const inCurrentMonth = mode === "week" || isSameMonth(day, date);
        return <section className={`calendar-day ${inCurrentMonth ? "" : "calendar-day-outside"} ${isToday(day) ? "calendar-day-today" : ""}`} role="gridcell" key={format(day, "yyyy-MM-dd")} aria-label={format(day, "EEEE d MMMM yyyy", { locale: fr })}>
          <div className="calendar-day-header">
            <button className={`calendar-day-number ${isToday(day) ? "today-number" : ""}`} onClick={() => onCreateForDate(day)} aria-label={`Créer une tâche le ${format(day, "d MMMM", { locale: fr })}`}>{format(day, "d")}</button>
            <button className="calendar-add-button" aria-label={`Ajouter une tâche le ${format(day, "d MMMM", { locale: fr })}`} onClick={() => onCreateForDate(day)}><Plus size={13} /></button>
          </div>
          <div className="calendar-day-tasks">
            {dayTasks.slice(0, mode === "month" ? 3 : 8).map((task) => <button className={`calendar-task ${task.status === "done" ? "calendar-task-done" : ""}`} key={task.id} onClick={() => onTaskSelect(task)} title={`${task.title} · ${priorityNames[task.priority]}`}>
              <span className={`calendar-task-dot priority-${task.priority}`} />
              <span>{task.title}</span>
            </button>)}
            {dayTasks.length > (mode === "month" ? 3 : 8) && <span className="calendar-more-tasks">+{dayTasks.length - (mode === "month" ? 3 : 8)} autres</span>}
          </div>
        </section>;
      })}
    </div>
    {!tasks.some((task) => task.due_date) && <p className="calendar-hint">Aucune tâche avec une échéance sur cette période. Sélectionnez un jour pour en ajouter une.</p>}
  </div>;
}

function ProjectSection({ projects, tasks, loading, error, onRetry, onSelect, onCreate }: {
  projects: Project[];
  tasks: Task[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onSelect: (project: Project) => void;
  onCreate: () => void;
}) {
  if (loading) return <div className="state-card"><LoaderCircle className="spin" size={20} /><span>Chargement des projets…</span></div>;
  if (error) return <div className="state-card state-error"><AlertCircle size={20} /><span>{error.message || "Impossible de charger les projets."}</span><button onClick={onRetry}>Réessayer</button></div>;
  if (!projects.length) {
    return <div className="empty-state"><div className="empty-art"><div className="empty-art-sun"><FolderKanban size={24} /></div><span className="empty-spark spark-a">✳</span><span className="empty-spark spark-b">✳</span><div className="empty-line line-a" /><div className="empty-line line-b" /></div><h3>Donnez un espace à vos idées.</h3><p>Créez un projet pour regrouper les tâches qui avancent vers le même objectif.</p><button className="secondary-button" onClick={onCreate}><Plus size={16} /> Créer un projet</button></div>;
  }

  return <div className="project-grid">{projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const completed = projectTasks.filter((task) => task.status === "done").length;
    const progress = projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0;
    return <button className="project-card" key={project.id} onClick={() => onSelect(project)}>
      <div className="project-card-top"><span className="project-mark" style={{ backgroundColor: `${project.color}18`, color: project.color }}><FolderKanban size={18} /></span><span className="project-open">Ouvrir →</span></div>
      <h3>{project.name}</h3><p>{project.description || "Aucune description pour le moment."}</p>
      <div className="project-progress-label"><span>{projectTasks.length} tâche{projectTasks.length === 1 ? "" : "s"}</span><span>{progress}%</span></div>
      <div className="progress-track project-progress"><span style={{ width: `${progress}%`, background: project.color }} /></div>
    </button>;
  })}</div>;
}

function KanbanBoard({ tasks, projects, busy, onStatusChange, onEdit, onComments, onDelete }: {
  tasks: Task[];
  projects: Project[];
  busy: boolean;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onComments: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeColumn, setActiveColumn] = useState<TaskStatus | null>(null);

  function handleDragStart(event: DragEvent<HTMLElement>, task: Task) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    setDraggedTaskId(task.id);
  }

  function handleDrop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
    const task = tasks.find((item) => item.id === taskId);
    if (task && task.status !== status) onStatusChange(task.id, status);
    setDraggedTaskId(null);
    setActiveColumn(null);
  }

  return <div className="kanban-board" aria-label="Tableau Kanban des tâches">
    {taskColumns.map((column) => {
      const columnTasks = tasks.filter((task) => task.status === column.status);
      return <section
        className={`kanban-column ${activeColumn === column.status ? "kanban-column-active" : ""}`}
        key={column.status}
        aria-label={`${column.title}, ${columnTasks.length} tâches`}
        onDragOver={(event) => { event.preventDefault(); setActiveColumn(column.status); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActiveColumn(null); }}
        onDrop={(event) => handleDrop(event, column.status)}
      >
        <header className="kanban-column-header">
          <span className={`kanban-status-dot kanban-dot-${column.status}`} />
          <h3>{column.title}</h3>
          <span className="kanban-count">{columnTasks.length}</span>
        </header>
        <div className="kanban-cards">
          {columnTasks.length ? columnTasks.map((task) => <article
            className={`kanban-card ${draggedTaskId === task.id ? "kanban-card-dragging" : ""}`}
            key={task.id}
            draggable={!busy}
            onDragStart={(event) => handleDragStart(event, task)}
            onDragEnd={() => { setDraggedTaskId(null); setActiveColumn(null); }}
          >
            <div className="kanban-card-meta">
              <span className={`priority-pill priority-${task.priority}`}><span />{priorityNames[task.priority]}</span>
              {task.due_date && <span className="task-due"><CalendarDays size={13} />{format(new Date(`${task.due_date}T12:00:00`), "d MMM", { locale: fr })}</span>}
            </div>
            <button className="kanban-card-title" onClick={() => onEdit(task)}>{task.title}</button>
            {task.description && <p className="kanban-card-description">{task.description}</p>}
            {task.project_id && projects.find((project) => project.id === task.project_id) && <span className="project-tag kanban-project-tag">{projects.find((project) => project.id === task.project_id)?.name}</span>}
            <div className="kanban-card-footer">
              <label className="kanban-status-select-label">Statut
                <select aria-label={`Statut de ${task.title}`} value={task.status} disabled={busy} onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}>
                  {taskColumns.map((option) => <option key={option.status} value={option.status}>{option.title}</option>)}
                </select>
              </label>
              <div className="kanban-card-actions">
                <button className="icon-button" aria-label={`Commentaires de ${task.title}`} title="Commentaires" onClick={() => onComments(task)}><MessageSquare size={15} /></button>
                <button className="icon-button" aria-label={`Supprimer ${task.title}`} title="Supprimer" onClick={() => onDelete(task)}><MoreHorizontal size={17} /></button>
              </div>
            </div>
          </article>) : <div className="kanban-empty">Déposez une tâche ici</div>}
        </div>
      </section>;
    })}
  </div>;
}

function TaskRow({ task, projectName, onToggle, onEdit, onDelete, onComments, busy }: { task: Task; projectName?: string; onToggle: () => void; onEdit: () => void; onDelete: () => void; onComments: () => void; busy: boolean }) {
  const overdue = task.status !== "done" && task.due_date && new Date(`${task.due_date}T12:00:00`) < startOfDay(new Date());
  const dueLabel = task.due_date ? format(new Date(`${task.due_date}T12:00:00`), "d MMM", { locale: fr }) : null;
  return (
    <article className={`task-row ${task.status === "done" ? "task-complete" : ""}`}>
      <button className={`task-check ${task.status === "done" ? "checked" : ""}`} aria-label={task.status === "done" ? "Réactiver la tâche" : "Marquer comme terminée"} onClick={onToggle} disabled={busy}>{task.status === "done" ? <Check size={14} /> : null}</button>
      <div className="task-main"><button className="task-title-button" onClick={onEdit} aria-label={`Modifier ${task.title}`}>{task.title}</button>{(task.description || projectName) && <p>{projectName && <span className="project-tag">{projectName}</span>}{task.description}</p>}</div>
      <span className={`priority-pill priority-${task.priority}`}><span />{priorityNames[task.priority]}</span>
      {dueLabel && <span className={`task-due ${overdue ? "due-overdue" : ""}`}><CalendarDays size={14} />{dueLabel}</span>}
      <span className={`task-status status-${task.status}`}>{statusNames[task.status]}</span>
      <button className="icon-button task-edit-button" aria-label={`Modifier ${task.title}`} title="Modifier" onClick={onEdit}><Pencil size={15} /></button>
      <button className="icon-button task-comment-button" aria-label={`Ouvrir les commentaires de ${task.title}`} title="Commentaires" onClick={onComments}><MessageSquare size={16} /></button>
      <button className="icon-button task-more" aria-label={`Supprimer ${task.title}`} title="Supprimer" onClick={onDelete}><MoreHorizontal size={18} /></button>
    </article>
  );
}

function EditTaskDialog({ user, task, projects, onClose, onUpdated }: { user: User; task: Task; projects: Project[]; onClose: () => void; onUpdated: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [projectId, setProjectId] = useState(task.project_id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const updates: TaskUpdates = {
        title,
        description,
        priority,
        due_date: dueDate || null,
        project_id: projectId || null,
      };
      await updateTask(task.id, updates);
      onUpdated();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La tâche n’a pas pu être modifiée.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="create-dialog edit-task-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-task-title">
      <div className="dialog-top"><span className="dialog-icon"><Pencil size={17} /></span><button className="icon-button" aria-label="Fermer" onClick={onClose} disabled={busy}><X size={18} /></button></div>
      <p className="eyebrow">MISE À JOUR</p><h2 id="edit-task-title">Modifier la tâche</h2><p className="dialog-subtitle">Ajustez les détails pour garder le cap.</p>
      <form onSubmit={submit} className="task-form">
        <label>Titre<input autoFocus maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label>Description <span className="optional-label">OPTIONNEL</span><textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ajoutez du contexte à cette tâche…" /></label>
        {projects.length > 0 && <label>Projet <span className="optional-label">OPTIONNEL</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Aucun projet</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
        <div className="form-row"><label>Priorité<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option></select></label><label>Échéance <span className="optional-label">OPTIONNEL</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label></div>
        {error && <div className="form-alert error"><AlertCircle size={16} />{error}</div>}
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Annuler</button><button className="primary-button" disabled={busy || !title.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Enregistrer</button></div>
      </form>
      <SubtasksPanel user={user} task={task} />
      <TaskRemindersPanel user={user} task={task} />
    </section>
  </div>;
}

function TaskRemindersPanel({ user, task }: { user: User; task: Task }) {
  const [remindAt, setRemindAt] = useState("");
  const [actionError, setActionError] = useState("");
  const queryClient = useQueryClient();
  const queryKey = ["reminders", user.id, task.id];
  const remindersQuery = useQuery({ queryKey, queryFn: () => listTaskReminders(task.id) });
  const refreshReminders = () => queryClient.invalidateQueries({ queryKey });
  const createMutation = useMutation({
    mutationFn: (datetime: string) => createTaskReminder(task, user.id, datetime),
    onSuccess: () => {
      setRemindAt("");
      setActionError("");
      void refreshReminders();
    },
    onError: (error) => setActionError(error.message || "Le rappel n’a pas pu être créé."),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteTaskReminder,
    onSuccess: () => {
      setActionError("");
      void refreshReminders();
    },
    onError: (error) => setActionError(error.message || "Le rappel n’a pas pu être annulé."),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (remindAt) createMutation.mutate(remindAt);
  }

  const reminders = remindersQuery.data ?? [];
  return <section className="reminders-panel" aria-labelledby="reminders-heading">
    <div className="subtasks-heading">
      <span className="subtasks-heading-icon reminder-heading-icon"><BellRing size={15} /></span>
      <div><h3 id="reminders-heading">Rappels</h3><p>Notifications dans l’application</p></div>
    </div>
    {remindersQuery.isPending ? <div className="subtasks-state"><LoaderCircle className="spin" size={15} />Chargement des rappels…</div>
      : remindersQuery.isError ? <div className="subtasks-error"><span>{remindersQuery.error.message || "Impossible de charger les rappels."}</span><button type="button" onClick={() => remindersQuery.refetch()}>Réessayer</button></div>
        : reminders.length > 0 && <div className="reminder-list">{reminders.map((reminder: TaskReminder) => <div className="reminder-row" key={reminder.id}>
          <Clock3 size={14} /><span>{format(new Date(reminder.remind_at), "d MMM yyyy · HH:mm", { locale: fr })}</span><span className={`reminder-state ${reminder.sent_at ? "reminder-sent" : ""}`}>{reminder.sent_at ? "Envoyé" : "À venir"}</span>
          {!reminder.sent_at && <button type="button" className="icon-button reminder-remove" aria-label="Annuler le rappel" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(reminder.id)}><X size={14} /></button>}
        </div>)}</div>}
    {actionError && <div className="form-alert error subtask-action-error"><AlertCircle size={14} /><span>{actionError}</span></div>}
    <form className="reminder-add-form" onSubmit={submit}>
      {task.status === "done" ? <p className="reminder-completed-note">Réactivez la tâche pour planifier un nouveau rappel.</p> : <>
        <label htmlFor="task-remind-at">Ajouter un rappel</label>
        <div><input id="task-remind-at" type="datetime-local" value={remindAt} min={toDateTimeLocal(new Date(Date.now() + 60_000))} onChange={(event) => setRemindAt(event.target.value)} required /><button type="submit" className="secondary-button" disabled={!remindAt || createMutation.isPending}>{createMutation.isPending ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />} Ajouter</button></div>
      </>}
    </form>
  </section>;
}

function toDateTimeLocal(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function SubtasksPanel({ user, task }: { user: User; task: Task }) {
  const [title, setTitle] = useState("");
  const [actionError, setActionError] = useState("");
  const queryClient = useQueryClient();
  const queryKey = ["subtasks", user.id, task.id];
  const subtasksQuery = useQuery({
    queryKey,
    queryFn: () => listSubtasks(task.id),
  });
  const refreshSubtasks = () => queryClient.invalidateQueries({ queryKey });
  const addMutation = useMutation({
    mutationFn: (subtaskTitle: string) => createSubtask(user, task, subtaskTitle),
    onSuccess: () => {
      setTitle("");
      setActionError("");
      void refreshSubtasks();
    },
    onError: (error) => setActionError(error.message || "La sous-tâche n’a pas pu être ajoutée."),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, is_completed }: { id: string; is_completed: boolean }) => updateSubtask(id, { is_completed }),
    onSuccess: () => {
      setActionError("");
      void refreshSubtasks();
    },
    onError: (error) => setActionError(error.message || "La sous-tâche n’a pas pu être mise à jour."),
  });
  const removeMutation = useMutation({
    mutationFn: deleteSubtask,
    onSuccess: () => {
      setActionError("");
      void refreshSubtasks();
    },
    onError: (error) => setActionError(error.message || "La sous-tâche n’a pas pu être supprimée."),
  });
  const completedCount = subtasksQuery.data?.filter((subtask) => subtask.is_completed).length ?? 0;
  const subtasks = subtasksQuery.data ?? [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim()) addMutation.mutate(title);
  }

  return <section className="subtasks-panel" aria-labelledby="subtasks-heading">
    <div className="subtasks-heading">
      <span className="subtasks-heading-icon"><ListChecks size={16} /></span>
      <div><h3 id="subtasks-heading">Sous-tâches</h3><p>{subtasksQuery.isPending ? "Chargement…" : `${completedCount} sur ${subtasks.length} terminée${subtasks.length === 1 ? "" : "s"}`}</p></div>
      {subtasks.length > 0 && <span className="subtasks-progress">{Math.round(completedCount / subtasks.length * 100)}%</span>}
    </div>
    {subtasksQuery.isPending ? <div className="subtasks-state"><LoaderCircle className="spin" size={16} />Chargement des sous-tâches…</div>
      : subtasksQuery.isError ? <div className="subtasks-error"><span>{subtasksQuery.error.message || "Impossible de charger les sous-tâches."}</span><button type="button" onClick={() => subtasksQuery.refetch()}>Réessayer</button></div>
        : subtasks.length > 0 ? <div className="subtask-list">{subtasks.map((subtask: TaskSubtask) => <div className="subtask-row" key={subtask.id}>
          <label className={`subtask-label ${subtask.is_completed ? "subtask-done" : ""}`}>
            <input type="checkbox" checked={subtask.is_completed} disabled={updateMutation.isPending || removeMutation.isPending} onChange={(event) => updateMutation.mutate({ id: subtask.id, is_completed: event.target.checked })} />
            <span>{subtask.title}</span>
          </label>
          <button type="button" className="icon-button subtask-remove" aria-label={`Supprimer la sous-tâche ${subtask.title}`} disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(subtask.id)}><X size={14} /></button>
        </div>)}</div>
          : <p className="subtasks-empty">Découpez cette tâche en petites étapes.</p>}
    {actionError && <div className="form-alert error subtask-action-error"><AlertCircle size={14} /><span>{actionError}</span></div>}
    <form className="subtask-add-form" onSubmit={submit}>
      <input aria-label="Nouvelle sous-tâche" maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ajouter une étape…" />
      <button type="submit" className="subtask-add-button" aria-label="Ajouter la sous-tâche" disabled={!title.trim() || addMutation.isPending}>{addMutation.isPending ? <LoaderCircle className="spin" size={15} /> : <Plus size={16} />}</button>
    </form>
  </section>;
}

function NotificationCenter({ user, notifications, loading, error, onRetry, tasks, onClose, onOpenTask }: {
  user: User;
  notifications: AppNotification[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  tasks: Task[];
  onClose: () => void;
  onOpenTask: (task: Task) => void;
}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const queryKey = ["notifications", user.id];
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const markOneMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (caught) => setActionError(caught.message || "La notification n’a pas pu être marquée comme lue."),
  });
  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      setActionError("");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (caught) => setActionError(caught.message || "Les notifications n’ont pas pu être marquées comme lues."),
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function openNotification(notification: AppNotification) {
    if (!notification.read_at) markOneMutation.mutate(notification.id);
    const task = tasks.find((item) => item.id === notification.task_id);
    if (task) onOpenTask(task);
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="create-dialog notification-dialog" role="dialog" aria-modal="true" aria-labelledby="notifications-title">
      <div className="dialog-top"><span className="dialog-icon"><Bell size={18} /></span><button className="icon-button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></div>
      <div className="notification-heading"><div><p className="eyebrow">VOTRE ESPACE</p><h2 id="notifications-title">Notifications</h2></div>{unreadCount > 0 && <button className="text-button" disabled={markAllMutation.isPending} onClick={() => markAllMutation.mutate()}>{markAllMutation.isPending ? "Mise à jour…" : "Tout marquer comme lu"}</button>}</div>
      <p className="dialog-subtitle">Rappels personnels enregistrés dans l’application.</p>
      {actionError && <div className="form-alert error"><AlertCircle size={16} /><span>{actionError}</span></div>}
      <div className="notification-list" aria-live="polite">
        {loading ? <div className="comments-state"><LoaderCircle className="spin" size={18} />Chargement des notifications…</div>
          : error ? <div className="comments-error"><AlertCircle size={16} /><span>{error.message || "Impossible de charger les notifications."}</span><button onClick={onRetry}>Réessayer</button></div>
            : notifications.length > 0 ? notifications.map((notification) => {
              const task = tasks.find((item) => item.id === notification.task_id);
              const content = <><span className={`notification-icon ${notification.read_at ? "" : "notification-icon-unread"}`}><BellRing size={15} /></span><span className="notification-copy"><b>{notification.title}</b><span>{task ? `Rappel : ${task.title}` : notification.body}</span><time dateTime={notification.created_at}>{format(new Date(notification.created_at), "d MMM yyyy · HH:mm", { locale: fr })}</time></span>{!notification.read_at && <span className="notification-unread-dot" />}</>;
              return task
                ? <button className={`notification-item ${notification.read_at ? "" : "notification-item-unread"}`} key={notification.id} onClick={() => openNotification(notification)}>{content}</button>
                : <div className={`notification-item notification-item-static ${notification.read_at ? "" : "notification-item-unread"}`} key={notification.id}>{content}<button className="notification-read-button" disabled={markOneMutation.isPending || Boolean(notification.read_at)} onClick={() => markOneMutation.mutate(notification.id)}>{notification.read_at ? "Lue" : "Marquer comme lue"}</button></div>;
            }) : <div className="comments-empty"><Bell size={20} /><span>Aucune notification pour le moment.</span><small>Vos rappels apparaîtront ici à leur échéance.</small></div>}
      </div>
      <p className="notification-disclaimer">Les rappels apparaissent ici. Aucun email ni notification push n’est envoyé.</p>
    </section>
  </div>;
}

function EmptyState({ view, search, onCreate }: { view: View; search: string; onCreate: () => void }) {
  const message = search ? "Aucune tâche ne correspond à cette recherche." : view === "today" ? "Votre journée est encore à écrire." : view === "upcoming" ? "Rien de prévu pour les prochains jours." : view === "completed" ? "Aucune tâche terminée pour le moment." : "Votre liste est encore toute neuve.";
  return <div className="empty-state"><div className="empty-art"><div className="empty-art-sun"><Sun size={25} /></div><span className="empty-spark spark-a">✳</span><span className="empty-spark spark-b">✳</span><div className="empty-line line-a" /><div className="empty-line line-b" /></div><h3>{message}</h3><p>{search ? "Essayez un autre mot-clé ou effacez votre recherche." : "Ajoutez une tâche pour libérer votre esprit et avancer à votre façon."}</p>{!search && <button className="secondary-button" onClick={onCreate}><Plus size={16} /> Créer une tâche</button>}</div>;
}

function TaskCommentsDialog({ user, task, onClose }: { user: User; task: Task; onClose: () => void }) {
  const [content, setContent] = useState("");
  const queryClient = useQueryClient();
  const commentsQuery = useQuery({
    queryKey: ["comments", user.id, task.id],
    queryFn: () => listTaskComments(task.id),
  });
  const addMutation = useMutation({
    mutationFn: (comment: string) => addTaskComment(user, task, comment),
    onSuccess: () => {
      setContent("");
      void queryClient.invalidateQueries({ queryKey: ["comments", user.id, task.id] });
    },
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (content.trim()) addMutation.mutate(content);
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="create-dialog comments-dialog" role="dialog" aria-modal="true" aria-labelledby="comments-title">
      <div className="dialog-top"><span className="dialog-icon"><MessageSquare size={18} /></span><button className="icon-button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></div>
      <p className="eyebrow">CONVERSATION DE TÂCHE</p>
      <h2 id="comments-title">{task.title}</h2>
      <p className="dialog-subtitle">Échangez avec les membres qui ont accès à cette tâche.</p>
      <div className="comments-list" aria-live="polite">
        {commentsQuery.isPending ? <div className="comments-state"><LoaderCircle className="spin" size={18} />Chargement des commentaires…</div>
          : commentsQuery.isError ? <div className="comments-error"><AlertCircle size={16} /><span>{commentsQuery.error.message || "Impossible de charger les commentaires."}</span><button onClick={() => commentsQuery.refetch()}>Réessayer</button></div>
            : commentsQuery.data.length ? commentsQuery.data.map((comment: TaskComment) => <article className="comment-item" key={comment.id}>
              <span className="comment-avatar">{comment.author_name.slice(0, 1).toUpperCase()}</span>
              <div className="comment-body"><div className="comment-meta"><b>{comment.author_name}</b><time dateTime={comment.created_at}>{format(new Date(comment.created_at), "d MMM yyyy · HH:mm", { locale: fr })}</time></div><p>{comment.content}</p></div>
            </article>)
              : <div className="comments-empty"><MessageSquare size={20} /><span>Pas encore de commentaire.</span><small>La conversation peut commencer ici.</small></div>}
      </div>
      {addMutation.error && <div className="form-alert error"><AlertCircle size={16} /><span>{addMutation.error.message || "Le commentaire n’a pas pu être envoyé."}</span></div>}
      <form className="comment-form" onSubmit={submit}>
        <label htmlFor="task-comment">Votre commentaire</label>
        <textarea id="task-comment" rows={3} maxLength={4000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Écrivez un message utile à l’équipe…" required />
        <div className="comment-form-footer"><span>{content.length}/4000</span><button className="primary-button" disabled={addMutation.isPending || !content.trim()}>{addMutation.isPending ? <LoaderCircle className="spin" size={16} /> : <MessageSquare size={15} />} Envoyer</button></div>
      </form>
    </section>
  </div>;
}

function CreateTaskDialog({ user, projects, initialProjectId, initialDueDate, onClose, onCreated }: { user: User; projects: Project[]; initialProjectId?: string | null; initialDueDate?: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState(initialDueDate ?? "");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input: NewTask = { title, description, priority, due_date: dueDate || undefined, project_id: projectId || undefined };
      await createTask(user, input);
      onCreated();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La tâche n’a pas pu être créée.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="dialog-top"><span className="dialog-icon"><Plus size={18} /></span><button className="icon-button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></div><p className="eyebrow">UNE NOUVELLE INTENTION</p><h2 id="create-title">Ajouter une tâche</h2><p className="dialog-subtitle">Donnez une forme concrète à votre prochaine étape.</p><form onSubmit={submit} className="task-form"><label>Qu’avez-vous en tête ?<input autoFocus maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Préparer le brief créatif" required /></label><label>Quelques détails <span className="optional-label">OPTIONNEL</span><textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ajoutez du contexte à cette tâche…" /></label>{projects.length > 0 && <label>Projet <span className="optional-label">OPTIONNEL</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Aucun projet</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}<div className="form-row"><label>Priorité<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="low">Basse</option><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option></select></label><label>Échéance <span className="optional-label">OPTIONNEL</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label></div>{error && <div className="form-alert error"><AlertCircle size={16} />{error}</div>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy || !title.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />} Créer la tâche</button></div></form></section></div>;
}

function CreateProjectDialog({ user, onClose, onCreated }: { user: User; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#514be4");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const colors = ["#514be4", "#288dce", "#38a77b", "#e29a4c", "#df6f83", "#8a64c8"];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createProject(user, { name, description, color });
      onCreated();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le projet n’a pas pu être créé.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="project-title"><div className="dialog-top"><span className="dialog-icon"><FolderKanban size={18} /></span><button className="icon-button" aria-label="Fermer" onClick={onClose}><X size={18} /></button></div><p className="eyebrow">UN ESPACE POUR AVANCER</p><h2 id="project-title">Créer un projet</h2><p className="dialog-subtitle">Rassemblez vos tâches autour d’un objectif commun.</p><form onSubmit={submit} className="task-form"><label>Nom du projet<input autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Refonte du site web" required /></label><label>Description <span className="optional-label">OPTIONNEL</span><textarea rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Quel est l’objectif de ce projet ?" /></label><label>Couleur<select value={color} onChange={(event) => setColor(event.target.value)}>{colors.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>{error && <div className="form-alert error"><AlertCircle size={16} />{error}</div>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />} Créer le projet</button></div></form></section></div>;
}

export default App;
