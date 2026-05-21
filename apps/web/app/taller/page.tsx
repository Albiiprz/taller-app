'use client';

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import MobileNav from "../components/MobileNav";
import { useSession, type Role } from "../components/useSession";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import InfoHint from "../components/ui/InfoHint";
import { listWorkOrders, updateWorkOrderStatus } from "../core/ordersApi";
import {
  canRoleMoveOt,
  filterOrdersForRoleDay,
  getAllowedNextStatuses,
  isOrderForDay,
  prioBadgeClass,
  statusBadgeClass,
  statusLabel,
  WORKSHOP_BOARD_COLUMNS,
  type OtItem,
  type OtStatus,
} from "../core/workflow";
import { listOpenHelpRequests, type HelpRequest } from "../core/helpRequests";

function roleModuleClass(role: Role) {
  if (role === "Técnico" || role === "Jefe de Taller") return "module-tech";
  if (role === "Oficina") return "module-office";
  if (role === "Inventario") return "module-inventory";
  return "module-admin";
}

function roleIntro(role: Role) {
  switch (role) {
    case "Técnico":
      return "Tu trabajo de ahora, sin menús ni ruido.";
    case "Jefe de Taller":
      return "Mira atascos, ayudas y mueve lo que toque.";
    case "Oficina":
      return "Llegadas del día y trabajos programados.";
    case "Inventario":
      return "Solicitudes, material pendiente y acceso rápido a stock.";
    case "Contabilidad":
      return "Trabajos listos para cierre y facturación.";
    default:
      return "Resumen operativo del taller y decisiones pendientes.";
  }
}

function todayYmd() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function orderSortWeight(item: OtItem) {
  const schedule = item.scheduledStart ?? "9999-12-31T23:59:59.999Z";
  const prio = item.prio === "Urgente" ? 0 : item.prio === "Alta" ? 1 : 2;
  const stage = ["PROGRAMADA", "RECEPCION", "REPARACION", "QC", "LISTO_ENTREGA", "ENTREGADO", "FACTURADO", "CERRADO", "DIAGNOSTICO"].indexOf(item.stage);
  return `${schedule}-${prio}-${stage === -1 ? 99 : stage}`;
}

function pickCurrentWork(items: OtItem[]) {
  const ranked = [...items].sort((a, b) => orderSortWeight(a).localeCompare(orderSortWeight(b)));
  return ranked[0] ?? null;
}

function isDelayStage(item: OtItem) {
  return item.stage === "PROGRAMADA" || item.stage === "PRESUPUESTO_ENVIADO";
}

function formatTimeShort(iso?: string | null): string {
  if (!iso) return "Sin hora";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sin hora";
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function isOverduePending(item: OtItem): boolean {
  if (item.stage !== "PROGRAMADA" || !item.scheduledStart) return false;
  return new Date(item.scheduledStart).getTime() < Date.now();
}

function Section({ title, text, children, tone = "content" }: { title: string; text?: string; children: React.ReactNode; tone?: "action" | "status" | "content" | "history" }) {
  const cls = tone === "action" ? "surface-action" : tone === "status" ? "surface-status" : tone === "history" ? "surface-history" : "surface-content";
  return (
    <section className={`${cls} p-4`}>
      <div className="flex items-center gap-2">
        <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
      </div>
      {text ? <p className="mt-1 text-sm font-semibold text-slate-600">{text}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function StatCard({ label, value, note, tone = "neutral" }: { label: string; value: string; note: string; tone?: "neutral" | "warn" | "danger" | "ok" }) {
  const toneClass = tone === "danger"
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "ok"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-slate-200 bg-white text-slate-900";

  return (
    <article className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-extrabold">{value}</p>
      <p className="mt-1 text-sm font-semibold opacity-80">{note}</p>
    </article>
  );
}

function OrderMiniCard({
  item,
  primaryLabel,
  primaryHref,
  secondaryHref,
  secondaryLabel,
}: {
  item: OtItem;
  primaryLabel: string;
  primaryHref: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <article className="surface-content p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-extrabold text-slate-900">{item.clientName || item.title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{item.plate}</p>
        </div>
        <Badge className={prioBadgeClass(item.prio)}>{item.prio}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge className={statusBadgeClass(item.stage)}>{statusLabel(item.stage)}</Badge>
        <span className="text-xs font-semibold text-slate-500">Trabajo #{item.id}</span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link href={primaryHref} className="cta-primary rounded-2xl px-4 text-sm">
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel ? (
          <Link href={secondaryHref} className="cta-secondary rounded-2xl px-4 text-sm">
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function MoveCard({
  item,
  currentRole,
  activeUserName,
  onMoved,
  busy,
}: {
  item: OtItem;
  currentRole: Role;
  activeUserName: string;
  onMoved: (id: string, next: OtStatus) => Promise<void>;
  busy: boolean;
}) {
  const forceRoles: Role[] = ["Administración", "Oficina", "Jefe de Taller"];
  const canForce = forceRoles.includes(currentRole);
  const allStatuses: OtStatus[] = ["PROGRAMADA", "RECEPCION", "DIAGNOSTICO", "PRESUPUESTO_ENVIADO", "APROBADO", "REPARACION", "QC", "LISTO_ENTREGA", "ENTREGADO", "FACTURADO", "CERRADO"];
  const options = canForce
    ? [item.stage, ...allStatuses.filter((stage) => stage !== item.stage)]
    : [item.stage, ...getAllowedNextStatuses(item.stage).filter((stage) => stage !== item.stage && canRoleMoveOt(currentRole, item.stage, stage))];
  const canMove = options.length > 1;
  const [nextStage, setNextStage] = useState<OtStatus>(() => item.stage);

  return (
    <article className="surface-content p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-900">{item.clientName || item.title}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{item.plate}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-500">{formatTimeShort(item.scheduledStart)}</span>
            {isOverduePending(item) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">
                <Icon name="bell" className="h-3 w-3" />
                Hora pasada
              </span>
            ) : null}
          </div>
        </div>
        <Badge className={prioBadgeClass(item.prio)}>{item.prio}</Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge className={statusBadgeClass(item.stage)}>{statusLabel(item.stage)}</Badge>
        <span className="text-xs font-semibold text-slate-500">Trabajo #{item.id}</span>
      </div>
      <div className="mt-4 space-y-2">
        <Link href={`/ordenes/${item.id}`} className="cta-primary w-full rounded-2xl px-4 text-sm">
          Abrir trabajo
        </Link>
        {canMove ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select
              className="min-w-0 truncate rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900"
              value={nextStage}
              onChange={(e) => setNextStage(e.target.value as OtStatus)}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              className="!min-h-[52px] w-[52px] p-0"
              disabled={busy || nextStage === item.stage}
              onClick={() => void onMoved(item.id, nextStage)}
              title="Mover"
            >
              <Icon name="move" className="h-5 w-5" />
              <span className="sr-only">Mover</span>
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
            Sin cambio disponible
          </div>
        )}
      </div>
    </article>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
      {text}
    </div>
  );
}

function BoardSection({
  items,
  currentRole,
  activeUserName,
  onMoved,
  busy,
  flashId,
}: {
  items: OtItem[];
  currentRole: Role;
  activeUserName: string;
  onMoved: (id: string, next: OtStatus) => Promise<void>;
  busy: boolean;
  flashId: string | null;
}) {
  const columnAccent: Partial<Record<OtStatus, string>> = {
    PROGRAMADA: "#4f46e5",
    RECEPCION: "#0284c7",
    REPARACION: "#f97316",
    QC: "#2563eb",
    LISTO_ENTREGA: "#16a34a",
  };

  const grouped = useMemo(() => {
    const base: Record<OtStatus, OtItem[]> = {
      PROGRAMADA: [],
      RECEPCION: [],
      DIAGNOSTICO: [],
      PRESUPUESTO_ENVIADO: [],
      APROBADO: [],
      REPARACION: [],
      QC: [],
      LISTO_ENTREGA: [],
      ENTREGADO: [],
      FACTURADO: [],
      CERRADO: [],
    };
    for (const item of items) {
      if (item.stage === "DIAGNOSTICO") {
        base.RECEPCION.push(item);
        continue;
      }
      base[item.stage].push(item);
    }
    return base;
  }, [items]);

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2 lg:overflow-visible">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {WORKSHOP_BOARD_COLUMNS.map((column) => {
          const rows = grouped[column.key];
          const accent = columnAccent[column.key] ?? "#334155";
          return (
            <section
              key={column.key}
              className="surface-content overflow-hidden border-0 shadow-none"
              style={{ borderRadius: "1.25rem" }}
            >
              <div style={{ height: 4, background: accent }} />
              <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-white/80 px-4 py-3 backdrop-blur">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{column.title}</h3>
                  <p className="text-xs font-semibold text-slate-500">{column.subtitle}</p>
                </div>
                <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-xs font-extrabold text-slate-700">
                  {rows.length}
                </span>
              </header>
              <div className="space-y-3 p-3">
                {rows.length === 0 ? <EmptyBox text="Nada aquí ahora mismo." /> : null}
                {rows.map((item) => (
                  <div
                    key={`${item.id}-${item.stage}`}
                    id={`ot-${item.id}`}
                    className={flashId === item.id ? "rounded-3xl ring-4 ring-blue-100" : undefined}
                  >
                    <MoveCard
                      item={item}
                      currentRole={currentRole}
                      activeUserName={activeUserName}
                      onMoved={onMoved}
                      busy={busy}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TallerPageContent() {
  const { hasRole, activeUser } = useSession();
  const searchParams = useSearchParams();
  const currentRole = (activeUser?.roles?.[0] ?? "Administración") as Role;
  const currentUserId = activeUser?.id ?? "";
  const activeUserName = activeUser?.name ?? "Usuario";
  const moduleClass = roleModuleClass(currentRole);
  const isAdmin = hasRole("Administración");

  const [items, setItems] = useState<OtItem[]>([]);
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([]);
  const [q, setQ] = useState("");
  const [flashId, setFlashId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMoving, setIsMoving] = useState(false);
  const today = useMemo(() => todayYmd(), []);

  async function loadFromApi() {
    setError("");
    try {
      const rows = await listWorkOrders();
      setItems(rows);
      setHelpRequests(listOpenHelpRequests());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el taller.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFromApi();

    const onFocus = () => void loadFromApi();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadFromApi();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const newId = searchParams.get("new");
    if (!newId) return;
    setFlashId(newId);
    const timer = setTimeout(() => setFlashId(null), 2200);
    return () => clearTimeout(timer);
  }, [searchParams]);

  const roleVisibleItems = useMemo(
    () => [...filterOrdersForRoleDay(items, currentRole, today)].sort((a, b) => orderSortWeight(a).localeCompare(orderSortWeight(b))),
    [items, currentRole, today],
  );

  const filteredItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return roleVisibleItems;
    return roleVisibleItems.filter((item) => (
      item.id.toLowerCase().includes(query) ||
      item.plate.toLowerCase().includes(query) ||
      item.title.toLowerCase().includes(query) ||
      statusLabel(item.stage).toLowerCase().includes(query)
    ));
  }, [roleVisibleItems, q]);

  const todaysItems = useMemo(() => [...items.filter((item) => isOrderForDay(item, today))].sort((a, b) => orderSortWeight(a).localeCompare(orderSortWeight(b))), [items, today]);
  const programmedToday = useMemo(() => todaysItems.filter((item) => item.stage === "PROGRAMADA"), [todaysItems]);
  const openToday = useMemo(() => todaysItems.filter((item) => item.stage !== "CERRADO" && item.stage !== "FACTURADO"), [todaysItems]);
  const supervisorItems = useMemo(() => filteredItems.filter((item) => ["PROGRAMADA", "RECEPCION", "REPARACION", "QC", "LISTO_ENTREGA", "DIAGNOSTICO"].includes(item.stage)), [filteredItems]);
  const urgentItems = useMemo(() => filteredItems.filter((item) => item.prio === "Urgente"), [filteredItems]);
  const blockedItems = useMemo(() => filteredItems.filter((item) => isDelayStage(item)), [filteredItems]);
  const inventoryWaiting = useMemo(() => filteredItems.filter((item) => item.stage === "REPARACION" || item.stage === "RECEPCION" || item.stage === "DIAGNOSTICO"), [filteredItems]);
  const accountingItems = useMemo(() => filteredItems.filter((item) => ["LISTO_ENTREGA", "ENTREGADO", "FACTURADO"].includes(item.stage)), [filteredItems]);
  const assignedToday = useMemo(() => {
    const mine = roleVisibleItems.filter((item) => item.assignedToUserId && item.assignedToUserId === currentUserId);
    return mine.length > 0 ? mine : roleVisibleItems;
  }, [roleVisibleItems, currentUserId]);
  const currentWork = useMemo(() => pickCurrentWork(assignedToday), [assignedToday]);

  async function moveItem(id: string, nextStage: OtStatus) {
    if (isMoving) return;
    const current = items.find((item) => item.id === id);
    if (!current) return;
    const canStandard = canRoleMoveOt(currentRole, current.stage, nextStage);
    const canForce = currentRole === "Administración" || currentRole === "Oficina" || currentRole === "Jefe de Taller";
    if (!canStandard && !canForce) {
      window.alert("No puedes mover este trabajo desde aquí.");
      return;
    }
    setIsMoving(true);
    try {
      const updated = await updateWorkOrderStatus({
        id,
        toStatus: nextStage,
        actorRole: currentRole,
        actorName: activeUserName,
        reason: `Cambio desde taller a ${statusLabel(nextStage)}`,
        force: !canStandard,
        origin: "web",
      });
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo mover el trabajo.");
    } finally {
      setIsMoving(false);
    }
  }

  // ── KPI strip ────────────────────────────────────────────────────────────────

  function KpiStrip({ items }: { items: Array<{ label: string; value: number; note: string; color: "amber" | "navy" | "green" | "rose" | "slate"; href: string }> }) {
    const bg = { amber: "bg-amber-500", navy: "bg-[#0b2a4a]", green: "bg-emerald-600", rose: "bg-rose-600", slate: "bg-slate-600" };
    return (
      <div className={`grid gap-3 ${items.length === 4 ? "grid-cols-2 sm:grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {items.map((item) => (
          <Link key={item.label} href={item.href}
            className={`btn-tap rounded-2xl p-4 text-white ${bg[item.color]}`}
          >
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70 leading-tight">{item.label}</p>
            <p className="mt-1 text-5xl font-black leading-none">{item.value}</p>
            <p className="mt-1.5 text-xs font-semibold opacity-75">{item.note}</p>
          </Link>
        ))}
      </div>
    );
  }

  // ── Renders por rol ───────────────────────────────────────────────────────────

  function renderTecnico() {
    return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Mi trabajo", value: currentWork ? 1 : 0, note: "En marcha", color: "navy", href: "/tecnico/simple" },
          { label: "Hoy", value: assignedToday.length, note: "Trabajos del día", color: "amber", href: "/ordenes" },
          { label: "Listos", value: assignedToday.filter(i => i.stage === "LISTO_ENTREGA").length, note: "Para entregar", color: "green", href: "/ordenes" },
        ]} />

        {/* Trabajo actual — matrícula gigante */}
        {currentWork ? (
          <Link href={currentWork.stage === "REPARACION" || currentWork.stage === "QC" ? "/tecnico/simple" : `/ordenes/${currentWork.id}`}
            className="btn-tap relative block overflow-hidden rounded-3xl p-6 text-white"
            style={{ background: "linear-gradient(135deg, #0b2a4a 0%, #1a3a5c 100%)", boxShadow: "0 8px 28px rgba(11,42,74,0.45)" }}
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full opacity-10"
              style={{ background: "radial-gradient(circle, #f59e0b, transparent)" }} />
            <p className="text-xs font-extrabold uppercase tracking-widest text-amber-400">Trabajo actual</p>
            <p className="mt-2 text-5xl font-black tracking-tight leading-none">{currentWork.plate}</p>
            <p className="mt-2 text-base font-semibold text-white/70 leading-snug">{currentWork.title}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${statusBadgeClass(currentWork.stage)}`}>
                {statusLabel(currentWork.stage)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-extrabold text-white">
                Empezar
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </Link>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-base font-extrabold text-slate-500">Hoy no tienes trabajo pendiente</p>
          </div>
        )}

        {currentWork && (
          <div className="grid grid-cols-3 gap-3">
            <Link href={`/ordenes/${currentWork.id}#fotos`} className="btn-tap flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <Icon name="new" className="h-6 w-6 text-slate-500" />
              <span className="text-xs font-extrabold text-slate-700">Foto</span>
            </Link>
            <Link href={`/ordenes/${currentWork.id}#material`} className="btn-tap flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <Icon name="inventory" className="h-6 w-6 text-slate-500" />
              <span className="text-xs font-extrabold text-slate-700">Material</span>
            </Link>
            <Link href="/tecnico/simple" className="btn-tap flex flex-col items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center">
              <Icon name="alert" className="h-6 w-6 text-rose-600" />
              <span className="text-xs font-extrabold text-rose-700">Ayuda</span>
            </Link>
          </div>
        )}
      </div>
    );
  }

  function renderJefe() {
    return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Atascos",   value: blockedItems.length,   note: "Sin mover",         color: "amber", href: "/taller" },
          { label: "Ayudas",   value: helpRequests.length,   note: "Esperando respuesta", color: "rose",  href: "/taller" },
          { label: "Urgentes", value: urgentItems.length,    note: "No retrasar",        color: "rose",  href: "/ordenes" },
          { label: "Listos",   value: roleVisibleItems.filter(i => i.stage === "LISTO_ENTREGA").length, note: "Para entregar", color: "green", href: "/ordenes" },
        ]} />

        {/* Ayudas activas — tarjetas rojas si hay */}
        {helpRequests.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="h-4 w-1 shrink-0 rounded-full bg-rose-500" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Ayudas activas</p>
            </div>
            {helpRequests.slice(0, 3).map((help) => (
              <Link key={help.id} href={`/ordenes/${help.workOrderId}`}
                className="btn-tap flex items-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                  <Icon name="alert" className="h-5 w-5 text-rose-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-rose-900">{help.technicianName} · {help.plate}</p>
                  <p className="mt-0.5 text-xs font-semibold text-rose-700 truncate">{help.message}</p>
                </div>
                <svg className="h-4 w-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-1">
          <span className="h-4 w-1 shrink-0 rounded-full bg-amber-400" />
          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Estado del taller</p>
        </div>
        <BoardSection
          items={supervisorItems}
          currentRole={currentRole}
          activeUserName={activeUserName}
          onMoved={moveItem}
          busy={isMoving}
          flashId={flashId}
        />
      </div>
    );
  }

  function renderOficina() {
    return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Llegadas", value: programmedToday.length, note: "Hoy",          color: "amber", href: "/ordenes" },
          { label: "Abiertos", value: openToday.length,       note: "En curso",     color: "navy",  href: "/ordenes" },
          { label: "Listos",   value: roleVisibleItems.filter(i => i.stage === "LISTO_ENTREGA").length, note: "Avisar", color: "green", href: "/ordenes" },
        ]} />

        <div className="flex items-center gap-2 px-1">
          <span className="h-4 w-1 shrink-0 rounded-full bg-amber-400" />
          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Fases del taller</p>
        </div>
        <BoardSection
          items={supervisorItems}
          currentRole={currentRole}
          activeUserName={activeUserName}
          onMoved={moveItem}
          busy={isMoving}
          flashId={flashId}
        />
      </div>
    );
  }

  function renderAdmin() {
    return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Activos",  value: filteredItems.length,   note: "En operación", color: "navy",  href: "/ordenes" },
          { label: "Atascos",  value: blockedItems.length,    note: "Sin mover",    color: "amber", href: "/taller" },
          { label: "Ayudas",   value: helpRequests.length,    note: "Esperando",    color: "rose",  href: "/taller" },
          { label: "Listos",   value: filteredItems.filter(i => i.stage === "LISTO_ENTREGA").length, note: "Para avisar", color: "green", href: "/ordenes" },
        ]} />

        {helpRequests.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="h-4 w-1 shrink-0 rounded-full bg-rose-500" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Ayudas activas</p>
            </div>
            {helpRequests.slice(0, 3).map((help) => (
              <Link key={help.id} href={`/ordenes/${help.workOrderId}`}
                className="btn-tap flex items-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                  <Icon name="alert" className="h-5 w-5 text-rose-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-rose-900">{help.technicianName} · {help.plate}</p>
                  <p className="mt-0.5 text-xs font-semibold text-rose-700 truncate">{help.message}</p>
                </div>
                <svg className="h-4 w-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-1">
          <span className="h-4 w-1 shrink-0 rounded-full bg-amber-400" />
          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Estado del taller</p>
        </div>
        <BoardSection
          items={supervisorItems}
          currentRole={currentRole}
          activeUserName={activeUserName}
          onMoved={moveItem}
          busy={isMoving}
          flashId={flashId}
        />
      </div>
    );
  }

  function renderInventario() {
    return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Solicitudes", value: helpRequests.length,       note: "Pendientes", color: helpRequests.length > 0 ? "rose" : "slate", href: "/inventario" },
          { label: "Esperando",   value: inventoryWaiting.length,   note: "Material",   color: "amber", href: "/inventario" },
        ]} />

        <Link href="/inventario"
          className="btn-tap flex w-full items-center gap-4 rounded-2xl p-5 text-white"
          style={{ background: "linear-gradient(135deg, #0f766e 0%, #134e4a 100%)", boxShadow: "0 8px 24px rgba(15,118,110,0.4)" }}
        >
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Icon name="inventory" className="h-6 w-6 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-extrabold">Abrir inventario</p>
            <p className="text-sm text-white/70">Escanea, revisa stock y gestiona movimientos</p>
          </div>
          <svg className="h-5 w-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {helpRequests.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="h-4 w-1 shrink-0 rounded-full bg-rose-500" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Solicitudes de material</p>
            </div>
            {helpRequests.slice(0, 4).map((help) => (
              <Link key={help.id} href={`/ordenes/${help.workOrderId}#material`}
                className="btn-tap flex items-center gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100">
                  <Icon name="alert" className="h-5 w-5 text-rose-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-rose-900">{help.plate}</p>
                  <p className="mt-0.5 text-xs font-semibold text-rose-700 truncate">{help.message}</p>
                </div>
                <svg className="h-4 w-4 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}

        {inventoryWaiting.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="h-4 w-1 shrink-0 rounded-full bg-amber-400" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Trabajos esperando material</p>
            </div>
            {inventoryWaiting.slice(0, 5).map((item) => (
              <OrderMiniCard key={item.id} item={item} primaryLabel="Ver solicitud" primaryHref={`/ordenes/${item.id}#material`} secondaryHref="/inventario" secondaryLabel="Inventario" />
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderContabilidad() {
    return (
      <div className="space-y-4">
        <KpiStrip items={[
          { label: "Para cobrar", value: accountingItems.filter(i => i.stage === "LISTO_ENTREGA" || i.stage === "ENTREGADO").length, note: "Entregados", color: "amber", href: "/ordenes" },
          { label: "Pendientes",  value: accountingItems.length, note: "Sin cerrar", color: "navy", href: "/ordenes" },
        ]} />

        {accountingItems[0] && (
          <Link href={`/ordenes/${accountingItems[0].id}`}
            className="btn-tap flex w-full items-center gap-4 rounded-2xl p-5 text-white"
            style={{ background: "linear-gradient(135deg, #0b2a4a 0%, #1a3a5c 100%)" }}
          >
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <Icon name="orders" className="h-6 w-6 text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-widest text-amber-400">Primero cerrar</p>
              <p className="mt-0.5 text-xl font-black text-white">{accountingItems[0].plate}</p>
              <p className="text-sm text-white/60 truncate">{accountingItems[0].title}</p>
            </div>
            <svg className="h-5 w-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}

        <div className="flex items-center gap-2 px-1">
          <span className="h-4 w-1 shrink-0 rounded-full bg-amber-400" />
          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Pendientes de cierre</p>
        </div>
        <div className="space-y-3">
          {accountingItems.slice(0, 6).map((item) => (
            <OrderMiniCard key={item.id} item={item} primaryLabel="Abrir trabajo" primaryHref={`/ordenes/${item.id}`} />
          ))}
          {accountingItems.length === 0 && <EmptyBox text="Nada pendiente de cierre o facturación." />}
        </div>
      </div>
    );
  }

  function renderByRole() {
    if (currentRole === "Técnico") return renderTecnico();
    if (currentRole === "Jefe de Taller") return renderJefe();
    if (currentRole === "Oficina") return renderOficina();
    if (currentRole === "Inventario") return renderInventario();
    if (currentRole === "Contabilidad") return renderContabilidad();
    return renderAdmin();
  }

  return (
    <main className={`min-h-screen app-bg mobile-nav-safe ${moduleClass}`}>

      {/* ── HERO ── */}
      <div
        className="relative overflow-hidden px-4 pb-6 pt-5 lg:pt-6"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(11,42,74,0.78) 0%, rgba(18,40,64,0.72) 55%, rgba(29,41,59,0.78) 100%), url('/banner-taller.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div className="pointer-events-none absolute -top-16 right-0 h-64 w-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }} />

      <div className="relative mx-auto w-full max-w-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-amber-400">Taller</p>
              <h1 className="mt-1 text-3xl font-black text-white leading-tight">
                {activeUserName}
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/50">{roleIntro(currentRole)}</p>
            </div>
            <span className="shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold text-white"
              style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)" }}>
              {currentRole}
            </span>
          </div>

          {/* Buscador en el hero — solo no técnico */}
          {currentRole !== "Técnico" && (
            <div className="mt-4">
              <Input
                placeholder="Buscar matrícula, número o trabajo…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="!bg-white/10 !border-white/20 !text-white placeholder:!text-white/40 focus:!bg-white/15"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── CONTENIDO ── */}
      <div className="mx-auto w-full max-w-none px-3 pt-5">
        {error ? <div className="mb-4 error-state">{error}</div> : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-500">
            Cargando taller...
          </div>
        ) : renderByRole()}
      </div>

      <MobileNav />
    </main>
  );
}

export default function TallerPage() {
  return (
    <Suspense fallback={<main className="min-h-screen app-bg p-6 text-sm font-semibold text-slate-500">Cargando taller...</main>}>
      <TallerPageContent />
    </Suspense>
  );
}
