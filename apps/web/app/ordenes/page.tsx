'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MobileNav from "../components/MobileNav";
import { useSession, type Role } from "../components/useSession";
import { listWorkOrders } from "../core/ordersApi";
import {
  filterOrdersForRoleDay,
  isOrderForDay,
  statusBadgeClass,
  statusLabel,
  type OtItem,
} from "../core/workflow";
import { Icon } from "../components/ui/Icon";
import { canAccessRoute } from "../core/routePermissions";

type RoleSection = "all" | "today" | "current" | "arrivals" | "pending" | "ready";
type ViewMode = "cards" | "list";

function todayYmd() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function todayLong() {
  return new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

function sectionOptions(role: Role): RoleSection[] {
  if (role === "Técnico") return ["current", "today", "ready"];
  if (role === "Oficina") return ["today", "pending", "ready"];
  if (role === "Administración" || role === "Jefe de Taller") return ["today", "pending", "ready"];
  if (role === "Inventario") return ["pending", "today"];
  if (role === "Contabilidad") return ["ready", "pending"];
  return ["today", "pending", "ready"];
}

function tabLabel(section: RoleSection, role: Role) {
  if (section === "today") return role === "Técnico" ? "Mis trabajos" : "Hoy";
  if (section === "pending") return role === "Contabilidad" ? "Por cerrar" : "Pendientes";
  if (section === "ready") return role === "Técnico" ? "Terminados" : "Listos";
  if (section === "current") return "En marcha";
  if (section === "arrivals") return "Llegadas";
  return "Todos";
}

function filterBySection(section: RoleSection, rows: OtItem[], today: string): OtItem[] {
  if (section === "all") return rows;
  if (section === "today") return rows.filter((it) => isOrderForDay(it, today));
  if (section === "current") return rows.filter((it) => it.stage === "REPARACION" || it.stage === "QC");
  if (section === "arrivals") return rows.filter((it) => it.stage === "PROGRAMADA" || it.stage === "RECEPCION");
  if (section === "pending") return rows.filter((it) => ["PROGRAMADA", "RECEPCION", "PRESUPUESTO_ENVIADO", "APROBADO", "DIAGNOSTICO"].includes(it.stage));
  return rows.filter((it) => it.stage === "LISTO_ENTREGA" || it.stage === "ENTREGADO" || it.stage === "FACTURADO");
}

function summaryCards(role: Role, rows: OtItem[]) {
  const pending = rows.filter((it) => ["PROGRAMADA", "RECEPCION", "DIAGNOSTICO", "PRESUPUESTO_ENVIADO", "APROBADO"].includes(it.stage)).length;
  const working = rows.filter((it) => it.stage === "REPARACION" || it.stage === "QC").length;
  const ready = rows.filter((it) => it.stage === "LISTO_ENTREGA" || it.stage === "ENTREGADO" || it.stage === "FACTURADO").length;

  if (role === "Técnico") {
    return [
      { title: "En marcha", value: working, note: "Trabajo actual", color: "navy", section: "current" as RoleSection },
      { title: "Mis trabajos", value: rows.length, note: "Todos hoy", color: "slate", section: "today" as RoleSection },
      { title: "Terminados", value: ready, note: "Para entregar", color: "green", section: "ready" as RoleSection },
    ];
  }

  if (role === "Oficina") {
    return [
      { title: "Pendientes", value: pending, note: "Falta mover o llamar", color: "amber", section: "pending" as RoleSection },
      { title: "En trabajo", value: working, note: "Taller activo", color: "navy", section: "today" as RoleSection },
      { title: "Listos", value: ready, note: "Para avisar al cliente", color: "green", section: "ready" as RoleSection },
    ];
  }

  return [
    { title: "Pendientes", value: pending, note: "Qué falta", color: "amber", section: "pending" as RoleSection },
    { title: "En trabajo", value: working, note: "Ahora mismo", color: "navy", section: "today" as RoleSection },
    { title: "Listos", value: ready, note: "Para cerrar o avisar", color: "green", section: "ready" as RoleSection },
  ];
}

function primaryAction(role: Role, activeRoles: Role[]) {
  if (canAccessRoute(activeRoles, "citas_nueva")) {
    return { href: "/citas/nueva", label: "Nueva cita", icon: "new" as const };
  }
  if (canAccessRoute(activeRoles, "tecnico_simple")) {
    return { href: "/tecnico/simple", label: "Mi trabajo", icon: "play" as const };
  }
  return { href: "/taller", label: "Ver taller", icon: "orders" as const };
}

function nextStepHint(item: OtItem) {
  if (item.stage === "PROGRAMADA") return "Pendiente de recibir";
  if (item.stage === "RECEPCION" || item.stage === "DIAGNOSTICO") return "Pendiente de recepción";
  if (item.stage === "PRESUPUESTO_ENVIADO") return "Esperando respuesta";
  if (item.stage === "APROBADO") return "Listo para empezar";
  if (item.stage === "REPARACION") return "Trabajo en marcha";
  if (item.stage === "QC") return "Esperando revisión";
  if (item.stage === "LISTO_ENTREGA") return "Listo para avisar";
  if (item.stage === "ENTREGADO") return "Pendiente de facturar";
  if (item.stage === "FACTURADO") return "Pendiente de cierre";
  return "Trabajo terminado";
}

function titleMain(item: OtItem) {
  return item.clientName?.trim() || item.title;
}

function isPastScheduled(item: OtItem): boolean {
  if (!item.scheduledStart) return false;
  const t = new Date(item.scheduledStart).getTime();
  return Number.isFinite(t) && t < Date.now();
}

function orderWeight(item: OtItem) {
  const schedule = item.scheduledStart ?? "9999-12-31T23:59:59.999Z";
  const prio = item.prio === "Urgente" ? 0 : item.prio === "Alta" ? 1 : 2;
  const stage =
    item.stage === "REPARACION" ? 0 :
    item.stage === "QC" ? 1 :
    item.stage === "DIAGNOSTICO" ? 2 :
    item.stage === "PROGRAMADA" ? 3 :
    item.stage === "LISTO_ENTREGA" ? 4 :
    item.stage === "ENTREGADO" ? 5 :
    6;
  return `${schedule}-${prio}-${stage}-${item.id}`;
}

function cardStripe(item: OtItem) {
  if (item.prio === "Urgente") return "bg-rose-500";
  if (item.stage === "LISTO_ENTREGA" || item.stage === "ENTREGADO" || item.stage === "FACTURADO") return "bg-emerald-500";
  if (item.stage === "REPARACION" || item.stage === "QC") return "bg-blue-500";
  if (item.stage === "DIAGNOSTICO" || item.stage === "PRESUPUESTO_ENVIADO" || item.stage === "APROBADO") return "bg-amber-400";
  return "bg-slate-300";
}

function formatTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function WorkCard({ item }: { item: OtItem }) {
  const isUrgent = item.prio === "Urgente";
  const isReady = item.stage === "LISTO_ENTREGA" || item.stage === "ENTREGADO" || item.stage === "FACTURADO";
  const isActive = item.stage === "REPARACION" || item.stage === "QC";
  const time = formatTime(item.scheduledStart);
  const pastTime = isPastScheduled(item);

  const bg = isUrgent
    ? "bg-rose-50 border-rose-200"
    : isReady
    ? "bg-emerald-50 border-emerald-200"
    : isActive
    ? "bg-blue-50 border-blue-200"
    : "bg-white border-slate-200";

  return (
    <Link href={`/ordenes/${item.id}`} className={`btn-tap relative overflow-hidden rounded-3xl border-2 p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3 ${bg}`}>
      <span className={`absolute left-0 top-0 h-full w-2 ${cardStripe(item)}`} />
      <div className="pl-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 leading-none">{titleMain(item)}</p>
          {isUrgent && (
            <span className="shrink-0 rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-black text-white uppercase">
              URGENTE
            </span>
          )}
        </div>

        {/* Title */}
        <p className="mt-1 text-xs font-semibold text-slate-500 leading-snug">
          {item.plate || "Sin matrícula"}{item.vehicleModel ? ` · ${item.vehicleModel}` : ""}
        </p>

        {/* Meta row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${statusBadgeClass(item.stage)}`}>
            {statusLabel(item.stage)}
          </span>
          <span className="text-xs font-semibold text-slate-400">#{item.id}</span>
          {time && (
            <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              {time}
            </span>
          )}
          {pastTime && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold text-amber-800">Hora pasada</span>}
        </div>

        {/* Hint */}
        <p className="mt-2 text-xs font-bold text-slate-500 uppercase tracking-wide">{nextStepHint(item)}</p>
      </div>
    </Link>
  );
}

function WorkRow({ item }: { item: OtItem }) {
  const isUrgent = item.prio === "Urgente";
  const time = formatTime(item.scheduledStart);
  const pastTime = isPastScheduled(item);

  return (
    <Link
      href={`/ordenes/${item.id}`}
      className={`btn-tap flex items-center gap-4 rounded-2xl border-2 px-4 py-3 ${
        isUrgent ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"
      }`}
    >
      <span className={`h-10 w-1.5 shrink-0 rounded-full ${cardStripe(item)}`} />
      <p className="w-40 shrink-0 truncate text-lg font-black tracking-tight text-slate-900">{titleMain(item)}</p>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-500">{item.plate || "Sin matrícula"}</p>
        <p className="text-xs font-semibold text-slate-400">{nextStepHint(item)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {time && <span className="text-xs font-semibold text-slate-400">{time}</span>}
        {pastTime && <span className="text-[10px] font-extrabold text-amber-700">Pasada</span>}
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${statusBadgeClass(item.stage)}`}>
          {statusLabel(item.stage)}
        </span>
        {isUrgent && (
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">URGENTE</span>
        )}
      </div>
      <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
      </svg>
    </Link>
  );
}

export default function OrdenesPage() {
  const { activeUser } = useSession();
  const activeRole = (activeUser?.roles?.[0] ?? "Oficina") as Role;
  const activeRoles = activeUser?.roles ?? [];
  const action = primaryAction(activeRole, activeRoles);

  const [items, setItems] = useState<OtItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<RoleSection>(sectionOptions(activeRole)[0] ?? "today");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  async function load() {
    setError("");
    try {
      const rows = await listWorkOrders();
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar esta lista.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // Restore view mode preference
    const saved = localStorage.getItem("taller_ordenes_view_v1");
    if (saved === "list" || saved === "cards") setViewMode(saved);

    const onFocus = () => void load();
    const onVisibility = () => document.visibilityState === "visible" && void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    setSection(sectionOptions(activeRole)[0] ?? "today");
  }, [activeRole]);

  function toggleView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("taller_ordenes_view_v1", mode);
  }

  const today = useMemo(() => todayYmd(), []);
  const roleRows = useMemo(() => {
    const rows = filterOrdersForRoleDay(items, activeRole, today);
    if (activeRole === "Técnico" && activeUser?.id) {
      return rows.filter((it) => !it.assignedToUserId || it.assignedToUserId === activeUser.id);
    }
    return rows;
  }, [items, activeRole, today, activeUser?.id]);

  const urgentRows = useMemo(() => roleRows.filter((it) => it.prio === "Urgente"), [roleRows]);

  const searchedRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return roleRows;
    return roleRows.filter((it) =>
      it.id.toLowerCase().includes(query) ||
      it.plate.toLowerCase().includes(query) ||
      it.title.toLowerCase().includes(query) ||
      (it.clientName ?? "").toLowerCase().includes(query),
    );
  }, [roleRows, q]);

  const sectionCounts = useMemo(() => {
    const counts: Partial<Record<RoleSection, number>> = {};
    for (const key of sectionOptions(activeRole)) {
      counts[key] = filterBySection(key, searchedRows, today).length;
    }
    return counts;
  }, [searchedRows, activeRole, today]);

  const filtered = useMemo(
    () => [...filterBySection(section, searchedRows, today)].sort((a, b) => orderWeight(a).localeCompare(orderWeight(b))),
    [section, searchedRows, today],
  );

  const summaries = useMemo(() => summaryCards(activeRole, roleRows), [activeRole, roleRows]);

  const kpiBg: Record<string, string> = {
    amber: "bg-amber-500",
    navy: "bg-[#0b2a4a]",
    green: "bg-emerald-600",
    slate: "bg-slate-600",
    rose: "bg-rose-600",
  };

  return (
    <main className="min-h-screen app-bg mobile-nav-safe">
      {/* Hero */}
      <div
        className="relative overflow-hidden px-4 pb-4 pt-4 lg:pt-6"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(11,42,74,0.78) 0%, rgba(18,40,64,0.72) 55%, rgba(29,41,59,0.78) 100%), url('/banner-trabajos.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Destellos decorativos (solo ambiente) */}
        <div
          className="pointer-events-none absolute -top-16 right-0 h-64 w-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-8 left-0 h-48 w-48 rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #60a5fa 0%, transparent 70%)" }}
        />
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-widest text-amber-400">Trabajos</p>
              <h1 className="mt-0.5 text-[1.9rem] sm:text-2xl font-black text-white">{todayLong()}</h1>
              {urgentRows.length > 0 && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  <span className="text-xs font-black text-white">
                    {urgentRows.length} urgente{urgentRows.length > 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
            <Link
              href={action.href}
              className="btn-tap shrink-0 flex items-center gap-2 rounded-2xl bg-amber-500 px-3 sm:px-4 py-2.5 sm:py-3 text-sm font-extrabold text-white shadow-lg"
            >
              <Icon name={action.icon} className="h-4 w-4" />
              <span className="hidden sm:inline">{action.label}</span>
              <span className="sm:hidden">Nueva</span>
            </Link>
          </div>

          {/* Search */}
          <div className="mt-3 relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/10 pl-10 pr-4 py-3 text-sm font-semibold text-white placeholder:text-white/50 outline-none focus:border-amber-400/60 focus:bg-white/15 transition-colors"
              placeholder="Matrícula, número o trabajo…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/60 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-6">

        {/* KPI strip — clickable, go to section */}
        <section className="mt-4 grid grid-cols-3 gap-3">
          {summaries.map((item) => (
            <button
              key={item.title}
              onClick={() => setSection(item.section)}
              className={`btn-tap rounded-2xl p-3 sm:p-4 text-left text-white transition-opacity ${kpiBg[item.color]} ${
                section === item.section ? "ring-2 ring-white/40 ring-offset-2 ring-offset-transparent" : ""
              }`}
            >
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70 leading-tight">{item.title}</p>
              <p className="mt-1 text-4xl sm:text-5xl font-black leading-none">{item.value}</p>
              <p className="mt-1 text-[11px] sm:text-xs font-semibold opacity-75 leading-tight">{item.note}</p>
            </button>
          ))}
        </section>

        {/* Urgent section — always visible when there are urgents */}
        {urgentRows.length > 0 && !q && (
          <section className="mt-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-rose-600">
                Urgentes ahora — {urgentRows.length}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {urgentRows.map((item) => (
                <WorkCard key={`urgent-${item.id}`} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* Tabs + view toggle */}
        <section className="mt-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {sectionOptions(activeRole).map((key) => {
              const count = sectionCounts[key] ?? 0;
              const isActive = section === key;
              return (
                <button
                  key={key}
                  onClick={() => setSection(key)}
                  className={`btn-tap shrink-0 flex items-center gap-1.5 rounded-full px-3 sm:px-4 py-2 text-xs sm:text-sm font-extrabold transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {tabLabel(key, activeRole)}
                  {count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                      isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* View mode toggle — desktop only */}
          <div className="hidden shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 lg:flex">
            <button
              onClick={() => toggleView("cards")}
              className={`rounded-lg p-2 transition-colors ${viewMode === "cards" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}
              title="Vista tarjetas"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </button>
            <button
              onClick={() => toggleView("list")}
              className={`rounded-lg p-2 transition-colors ${viewMode === "list" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}
              title="Vista lista"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
          </div>
        </section>

        {/* Content */}
        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-base font-extrabold text-red-700">No se pudo abrir esta lista</p>
            <p className="mt-1 text-sm font-semibold text-red-600">{error}</p>
            <button
              onClick={() => void load()}
              className="btn-tap mt-4 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-extrabold text-white"
            >
              Reintentar
            </button>
          </div>
        ) : loading ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-2xl bg-white border border-slate-200 p-10 gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />
            <p className="text-sm font-semibold text-slate-500">Cargando trabajos…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center">
            <p className="text-base font-extrabold text-slate-900">Aquí no hay nada ahora mismo</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Cambia de pestaña o revisa otra sección.
            </p>
          </div>
        ) : viewMode === "list" ? (
          <section className="mt-3 flex flex-col gap-2">
            {filtered.map((item) => (
              <WorkRow key={item.id} item={item} />
            ))}
          </section>
        ) : (
          <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <WorkCard key={item.id} item={item} />
            ))}
          </section>
        )}
      </div>

      <MobileNav />
    </main>
  );
}
