'use client';

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import MobileNav from "../components/MobileNav";
import { Role, useSession } from "../components/useSession";
import { Icon } from "../components/ui/Icon";
import { listWorkOrders } from "../core/ordersApi";
import {
  filterOrdersForRoleDay,
  statusBadgeClass,
  statusLabel,
  type OtItem,
} from "../core/workflow";
import {
  getReminderTargetMonday,
  isReminderDone,
  isWeeklyReminderDay,
} from "../core/weeklyScheduleReminder";

type ActionTile = {
  href: string;
  title: string;
  note: string;
  icon: "new" | "orders" | "bell" | "workshop" | "inventory" | "profile" | "home" | "play" | "scan" | "alert";
  tone?: "primary" | "secondary" | "warn";
};

function todayYmd(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 13) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

function todayLong(): string {
  return new Date().toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function roleModuleClass(role: Role) {
  if (role === "Técnico" || role === "Jefe de Taller") return "module-tech";
  if (role === "Oficina") return "module-office";
  if (role === "Inventario") return "module-inventory";
  if (role === "Administración" || role === "Contabilidad") return "module-admin";
  return "module-office";
}

function playScheduleReminderSound() {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 988;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch { /* Sin audio */ }
}

// ── KPI strip con color sólido ────────────────────────────────────────────────

type KpiItem = { label: string; value: number; note: string; color: "amber" | "navy" | "green" | "rose"; href: string };

function KpiStrip({ items }: { items: KpiItem[] }) {
  const bg: Record<KpiItem["color"], string> = {
    amber: "bg-amber-500",
    navy:  "bg-[#0b2a4a]",
    green: "bg-emerald-600",
    rose:  "bg-rose-600",
  };
  return (
    <div className={`grid gap-3 ${items.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
      {items.map((item) => (
        <Link key={item.label} href={item.href}
          className={`btn-tap rounded-2xl p-3 sm:p-4 text-white ${bg[item.color]}`}
        >
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70 leading-tight">{item.label}</p>
          <p className="mt-1 text-4xl sm:text-5xl font-black leading-none">{item.value}</p>
          <p className="mt-1 text-[11px] sm:text-xs font-semibold opacity-75 leading-tight">{item.note}</p>
        </Link>
      ))}
    </div>
  );
}

// ── Acción primaria hero ──────────────────────────────────────────────────────

function PrimaryAction({ href, label, sub, icon }: { href: string; label: string; sub: string; icon: ActionTile["icon"] }) {
  return (
    <Link href={href}
      className="btn-tap flex w-full items-center gap-3 rounded-2xl p-4 sm:p-5 text-white"
      style={{ background: "linear-gradient(135deg, #0b2a4a 0%, #1a3a5c 100%)", boxShadow: "0 8px 24px rgba(11,42,74,0.45)" }}
    >
      <span className="inline-flex h-11 w-11 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
        <Icon name={icon} className="h-5 w-5 sm:h-7 sm:w-7 text-white" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base sm:text-lg font-black leading-tight">{label}</p>
        <p className="mt-0.5 text-xs sm:text-sm font-semibold text-white/70">{sub}</p>
      </div>
      <svg className="h-5 w-5 text-white/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ── Grid de tiles secundarias ─────────────────────────────────────────────────

function SecondaryGrid({ actions }: { actions: ActionTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {actions.map((a) => {
        const isWarn = a.tone === "warn";
        return (
          <Link key={a.href + a.title} href={a.href}
            className={`btn-tap flex flex-col gap-2 rounded-2xl border p-4 ${isWarn ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}
          >
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${isWarn ? "bg-amber-100" : "bg-slate-100"}`}>
              <Icon name={a.icon} className={`h-5 w-5 ${isWarn ? "text-amber-700" : "text-slate-600"}`} />
            </span>
            <div>
              <p className={`text-sm font-extrabold ${isWarn ? "text-amber-900" : "text-slate-900"}`}>{a.title}</p>
              <p className={`mt-0.5 text-xs font-semibold ${isWarn ? "text-amber-700" : "text-slate-500"}`}>{a.note}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Scroll horizontal de coches ───────────────────────────────────────────────

function CarScroll({ rows, emptyText }: { rows: OtItem[]; emptyText: string }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm font-extrabold text-slate-500">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {rows.map((ot) => {
        const isUrgent = ot.prio === "Urgente";
        const isReady = ot.stage === "LISTO_ENTREGA" || ot.stage === "ENTREGADO";
        const isWorking = ot.stage === "REPARACION" || ot.stage === "QC";
        const cardBg = isUrgent ? "bg-rose-50 border-rose-300" : isReady ? "bg-emerald-50 border-emerald-300" : isWorking ? "bg-blue-50 border-blue-200" : "bg-white border-slate-200";
        const stripe = isUrgent ? "bg-rose-500" : isReady ? "bg-emerald-500" : isWorking ? "bg-blue-500" : "bg-slate-300";
        return (
          <Link key={ot.id} href={`/ordenes/${ot.id}`}
            className={`btn-tap relative shrink-0 w-40 overflow-hidden rounded-2xl border-2 p-4 ${cardBg}`}
          >
            <span className={`absolute inset-x-0 top-0 h-1 ${stripe}`} />
            <p className="mt-1 text-xl font-black tracking-tight text-slate-900 leading-none">{ot.plate}</p>
            <p className="mt-1.5 text-xs font-semibold text-slate-500 line-clamp-2 leading-snug">{ot.title}</p>
            <span className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold ${statusBadgeClass(ot.stage)}`}>
              {statusLabel(ot.stage)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

// ── Separador de sección ──────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="h-4 w-1 shrink-0 rounded-full bg-amber-400" />
      <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">{children}</p>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function InicioPage() {
  const { activeUser } = useSession();
  const activeRole = (activeUser?.roles?.[0] ?? "Oficina") as Role;
  const [pendingOrders, setPendingOrders] = useState<OtItem[]>([]);
  const [loadingPendings, setLoadingPendings] = useState(true);
  const [pendingsError, setPendingsError] = useState("");
  const [showWeeklyScheduleAlert, setShowWeeklyScheduleAlert] = useState(false);
  const moduleClass = roleModuleClass(activeRole);

  useEffect(() => {
    let cancelled = false;
    async function loadPendings() {
      setPendingsError("");
      try {
        const rows = await listWorkOrders();
        if (cancelled) return;
        setPendingOrders(rows);
      } catch (e) {
        if (cancelled) return;
        setPendingsError(e instanceof Error ? e.message : "No se pudieron cargar los trabajos");
      } finally {
        if (!cancelled) setLoadingPendings(false);
      }
    }
    void loadPendings();
    const onFocus = () => void loadPendings();
    const onVisibility = () => document.visibilityState === "visible" && void loadPendings();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (activeRole !== "Administración") { setShowWeeklyScheduleAlert(false); return; }
    const now = new Date();
    const reminderDay = isWeeklyReminderDay(now);
    const targetMonday = getReminderTargetMonday(now);
    const done = isReminderDone(targetMonday);
    const shouldShow = reminderDay && !done;
    setShowWeeklyScheduleAlert(shouldShow);
    if (!shouldShow) return;
    const soundKey = `weekly_schedule_alert_sound_${now.toISOString().slice(0, 10)}`;
    if (localStorage.getItem(soundKey) !== "1") {
      playScheduleReminderSound();
      localStorage.setItem(soundKey, "1");
    }
  }, [activeRole]);

  const roleRows = useMemo(() => filterOrdersForRoleDay(pendingOrders, activeRole, todayYmd()), [pendingOrders, activeRole]);
  const urgentRows = useMemo(() => pendingOrders.filter((ot) => ot.prio === "Urgente" && ot.stage !== "CERRADO" && ot.stage !== "FACTURADO"), [pendingOrders]);
  const techRows = useMemo(() => {
    const base = activeRole === "Técnico" && activeUser?.id ? roleRows.filter((ot) => ot.assignedToUserId === activeUser.id) : roleRows;
    return base.filter((ot) => ot.stage !== "CERRADO" && ot.stage !== "FACTURADO");
  }, [activeRole, activeUser?.id, roleRows]);
  const currentTechOrder = techRows.find((ot) => ot.stage === "REPARACION" || ot.stage === "QC") ?? techRows[0] ?? null;
  const todayArrivals = roleRows.filter((ot) => ot.stage === "PROGRAMADA" || ot.stage === "RECEPCION");
  const callPendings = roleRows.filter((ot) => ot.stage === "PRESUPUESTO_ENVIADO" || ot.stage === "LISTO_ENTREGA");
  const readyVehicles = roleRows.filter((ot) => ot.stage === "LISTO_ENTREGA");
  const diagnosticQueue = pendingOrders.filter((ot) => ot.stage === "DIAGNOSTICO");

  // ── Configuración por rol ─────────────────────────────────────────────────

  function renderByRole() {
    if (activeRole === "Técnico") return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Mi trabajo",  value: currentTechOrder ? 1 : 0, note: "En marcha ahora",    color: "navy",  href: "/tecnico/simple" },
          { label: "Hoy",        value: techRows.length,           note: "Trabajos del día",   color: "amber", href: "/ordenes" },
          { label: "Terminados", value: techRows.filter(r => r.stage === "LISTO_ENTREGA" || r.stage === "ENTREGADO").length, note: "Para entregar", color: "green", href: "/ordenes" },
        ]} />

        <PrimaryAction href="/tecnico/simple" label="Mi trabajo ahora" sub="Empezar, pausar o reanudar sin menús" icon="play" />

        {currentTechOrder && (
          <div className="surface-content rounded-2xl p-3 sm:p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-700">Trabajo actual</p>
            <p className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">{currentTechOrder.plate}</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">{currentTechOrder.title}</p>
            <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ${statusBadgeClass(currentTechOrder.stage)}`}>
              {statusLabel(currentTechOrder.stage)}
            </span>
          </div>
        )}

        <SectionLabel>Tus trabajos de hoy</SectionLabel>
        <CarScroll rows={techRows.slice(0, 8)} emptyText="No tienes trabajo pendiente para hoy." />
      </div>
    );

    if (activeRole === "Oficina") return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Llegadas",  value: todayArrivals.length, note: "Hoy",              color: "amber", href: "/ordenes" },
          { label: "Llamar",   value: callPendings.length,  note: "Pendientes",        color: "rose",  href: "/ordenes" },
          { label: "Listos",   value: readyVehicles.length, note: "Para avisar",       color: "green", href: "/ordenes" },
        ]} />

        <PrimaryAction href="/citas/nueva" label="Nueva cita" sub="Crea el trabajo automáticamente en pasos" icon="new" />

        <SecondaryGrid actions={[
          { href: "/calendario", title: "Llegadas de hoy", note: `${todayArrivals.length} previstas`, icon: "home" },
          { href: "/ordenes",    title: "Pendientes de llamar", note: `${callPendings.length} por resolver`, icon: "bell", tone: callPendings.length > 0 ? "warn" : "secondary" },
          { href: "/ordenes",    title: "Vehículos listos", note: `${readyVehicles.length} para avisar`, icon: "orders" },
        ]} />

        <SectionLabel>Trabajos del día</SectionLabel>
        <CarScroll rows={roleRows.slice(0, 10)} emptyText="No hay trabajos abiertos ahora." />
      </div>
    );

    if (activeRole === "Administración") return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Bloqueados", value: diagnosticQueue.length, note: "Sin diagnóstico", color: "amber", href: "/taller" },
          { label: "Listos",     value: readyVehicles.length,   note: "Avisar cliente",  color: "green", href: "/ordenes" },
          { label: "Llamar",     value: callPendings.length,    note: "Presupuestos",    color: "navy",  href: "/ordenes" },
          { label: "Urgentes",   value: urgentRows.length,      note: "Prioritarios",   color: "rose",  href: "/ordenes" },
        ]} />

        <PrimaryAction href="/ordenes" label="Ver trabajos de hoy" sub={`${roleRows.length} trabajos activos ahora mismo`} icon="orders" />

        <SecondaryGrid actions={[
          { href: "/calendario",       title: "Calendario",   note: "Huecos y agenda",              icon: "bell" },
          { href: "/ajustes/usuarios", title: "Usuarios",     note: "Altas y permisos",             icon: "profile" },
          { href: "/taller",           title: "Taller",       note: "Ver tablero",                  icon: "workshop" },
          { href: "/inventario",       title: "Inventario",   note: "Stock y movimientos",          icon: "inventory" },
        ]} />

        <SectionLabel>Trabajos activos hoy</SectionLabel>
        <CarScroll rows={roleRows.slice(0, 12)} emptyText="No hay trabajos abiertos ahora." />
      </div>
    );

    if (activeRole === "Jefe de Taller") return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Activos",   value: roleRows.length,    note: "En el taller",    color: "navy",  href: "/taller" },
          { label: "Urgentes",  value: urgentRows.length,  note: "Prioritarios",   color: "rose",  href: "/ordenes" },
          { label: "Listos",    value: readyVehicles.length, note: "Para entregar", color: "green", href: "/ordenes" },
        ]} />

        <PrimaryAction href="/taller" label="Tablero del taller" sub="Mueve trabajos y gestiona la carga del día" icon="workshop" />

        <SecondaryGrid actions={[
          { href: "/ordenes",    title: "Trabajos de hoy",  note: `${roleRows.length} activos`,  icon: "orders" },
          { href: "/calendario", title: "Calendario",       note: "Agenda del taller",           icon: "bell" },
        ]} />

        <SectionLabel>Cola actual</SectionLabel>
        <CarScroll rows={roleRows.slice(0, 10)} emptyText="No hay trabajos activos." />
      </div>
    );

    if (activeRole === "Inventario") return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Consumos",  value: roleRows.length, note: "Trabajos hoy", color: "navy",  href: "/inventario" },
          { label: "Stock bajo", value: pendingOrders.filter(ot => ot.stage === "APROBADO").length, note: "Revisar", color: "rose", href: "/inventario" },
        ]} />

        <PrimaryAction href="/inventario" label="Abrir inventario" sub="Escanea, revisa stock y registra movimientos" icon="inventory" />

        <SecondaryGrid actions={[
          { href: "/inventario?view=scan",  title: "Escanear",   note: "Buscar producto",      icon: "scan" },
          { href: "/inventario?view=new",   title: "Nuevo",      note: "Alta rápida",          icon: "new" },
          { href: "/inventario?view=moves", title: "Movimientos", note: "Entradas y salidas",  icon: "orders" },
          { href: "/inventario?view=low",   title: "Stock bajo", note: "Lo urgente primero",  icon: "alert", tone: "warn" },
        ]} />
      </div>
    );

    if (activeRole === "Contabilidad") return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Para cobrar", value: readyVehicles.length, note: "Entregados",    color: "amber", href: "/ordenes" },
          { label: "Abiertos",   value: roleRows.length,       note: "Activos hoy",  color: "navy",  href: "/ordenes" },
        ]} />

        <PrimaryAction href="/ordenes" label="Facturas pendientes" sub="Trabajos entregados sin cerrar o facturar" icon="orders" />

        <SectionLabel>Pendientes de cierre</SectionLabel>
        <CarScroll rows={roleRows.slice(0, 8)} emptyText="No hay trabajos pendientes de cierre." />
      </div>
    );

    return null;
  }

  return (
    <main className={`min-h-screen app-bg mobile-nav-safe ${moduleClass}`}>

      {/* ── HERO ── */}
      <div
        className="relative overflow-hidden px-4 pb-5 pt-4 lg:pt-6"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(11,42,74,0.78) 0%, rgba(18,40,64,0.72) 55%, rgba(29,41,59,0.78) 100%), url('/banner-inicio.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Destellos decorativos */}
        <div className="pointer-events-none absolute -top-16 right-0 h-64 w-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }} />
        <div className="pointer-events-none absolute -bottom-8 left-0 h-48 w-48 rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #60a5fa 0%, transparent 70%)" }} />

        <div className="relative mx-auto w-full max-w-6xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-extrabold text-amber-400 uppercase tracking-widest">
                {greeting()}
              </p>
              <h1 className="mt-1 text-[2rem] sm:text-3xl font-black text-white leading-tight">
                {activeUser?.name ?? "—"}
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/50 capitalize">{todayLong()}</p>
            </div>
            <span className="shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold text-white"
              style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)" }}>
              {activeRole}
            </span>
          </div>

          {/* Alerta urgente inline en el hero */}
          {!loadingPendings && urgentRows.length > 0 && (
            <Link href="/ordenes"
              className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-400/40 bg-rose-500/20 px-4 py-3 backdrop-blur-sm"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500">
                <Icon name="alert" className="h-4 w-4 text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-white">
                  {urgentRows.length} trabajo{urgentRows.length > 1 ? "s" : ""} urgente{urgentRows.length > 1 ? "s" : ""}
                </p>
                <p className="text-xs font-semibold text-white/60">Toca para ver — no pueden esperar</p>
              </div>
              <svg className="h-4 w-4 shrink-0 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* ── CONTENIDO ── */}
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pt-5">

        {pendingsError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {pendingsError}
          </div>
        )}

        {showWeeklyScheduleAlert && (
          <Link href="/calendario#horario-semanal"
            className="btn-tap flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <Icon name="bell" className="h-5 w-5 text-amber-700" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-amber-900">Recordatorio: configura el horario semanal</p>
              <p className="mt-0.5 text-xs font-semibold text-amber-700">Hoy toca revisar la semana — toca para abrir</p>
            </div>
            <svg className="h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}

        {loadingPendings ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
            Cargando datos del taller...
          </div>
        ) : renderByRole()}

      </div>

      <MobileNav />
    </main>
  );
}
