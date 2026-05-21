import type { Role } from "../components/useRole";

export type OtPriority = "Normal" | "Alta" | "Urgente";

export type OtStatus =
  | "PROGRAMADA"
  | "RECEPCION"
  | "DIAGNOSTICO"
  | "PRESUPUESTO_ENVIADO"
  | "APROBADO"
  | "REPARACION"
  | "QC"
  | "LISTO_ENTREGA"
  | "ENTREGADO"
  | "FACTURADO"
  | "CERRADO";

export type OtItem = {
  id: string;
  plate: string;
  title: string;
  prio: OtPriority;
  stage: OtStatus;
  assignedToUserId?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  createdAt?: string | null;
};

type SessionRole =
  | "Administración"
  | "Oficina"
  | "Jefe de Taller"
  | "Técnico"
  | "Contabilidad"
  | "Inventario";

const STATUS_META: Record<OtStatus, { label: string; badge: string }> = {
  PROGRAMADA: { label: "Pendiente para hoy", badge: "bg-indigo-100 text-indigo-700" },
  RECEPCION: { label: "Recepción", badge: "bg-sky-100 text-sky-700" },
  DIAGNOSTICO: { label: "Diagnóstico", badge: "bg-purple-100 text-purple-700" },
  PRESUPUESTO_ENVIADO: { label: "Presupuesto enviado", badge: "bg-indigo-100 text-indigo-700" },
  APROBADO: { label: "Aprobado", badge: "bg-emerald-100 text-emerald-700" },
  REPARACION: { label: "En trabajo", badge: "bg-orange-100 text-orange-700" },
  QC: { label: "Revisión final", badge: "bg-blue-100 text-blue-700" },
  LISTO_ENTREGA: { label: "Listo para avisar", badge: "bg-green-100 text-green-700" },
  ENTREGADO: { label: "Entregado", badge: "bg-teal-100 text-teal-700" },
  FACTURADO: { label: "Facturado", badge: "bg-cyan-100 text-cyan-700" },
  CERRADO: { label: "Cerrado", badge: "bg-gray-200 text-gray-700" },
};

const TRANSITIONS: Record<OtStatus, OtStatus[]> = {
  PROGRAMADA: ["RECEPCION"],
  RECEPCION: ["PROGRAMADA", "DIAGNOSTICO"],
  DIAGNOSTICO: ["RECEPCION", "PRESUPUESTO_ENVIADO", "REPARACION"],
  PRESUPUESTO_ENVIADO: ["DIAGNOSTICO", "APROBADO"],
  APROBADO: ["DIAGNOSTICO", "REPARACION"],
  // Simpler workshop flow: allow direct finish without mandatory QC step.
  REPARACION: ["DIAGNOSTICO", "LISTO_ENTREGA"],
  QC: ["LISTO_ENTREGA", "REPARACION"],
  LISTO_ENTREGA: ["REPARACION", "ENTREGADO"],
  ENTREGADO: ["LISTO_ENTREGA", "FACTURADO"],
  FACTURADO: ["ENTREGADO", "CERRADO"],
  CERRADO: [],
};

const ROLE_ALLOWED_TARGETS: Record<Role, OtStatus[]> = {
  "Administración": [
    "PROGRAMADA",
    "RECEPCION",
    "DIAGNOSTICO",
    "PRESUPUESTO_ENVIADO",
    "APROBADO",
    "REPARACION",
    "QC",
    "LISTO_ENTREGA",
    "ENTREGADO",
    "FACTURADO",
    "CERRADO",
  ],
  Oficina: [
    "PROGRAMADA",
    "RECEPCION",
    "DIAGNOSTICO",
    "PRESUPUESTO_ENVIADO",
    "APROBADO",
    "LISTO_ENTREGA",
    "ENTREGADO",
  ],
  "Jefe de Taller": ["DIAGNOSTICO", "REPARACION", "QC", "LISTO_ENTREGA", "APROBADO"],
  "Técnico": ["REPARACION", "QC", "LISTO_ENTREGA"],
  Contabilidad: ["FACTURADO", "CERRADO"],
  Inventario: [],
};

export function statusLabel(status: OtStatus): string {
  return STATUS_META[status].label;
}

export function statusBadgeClass(status: OtStatus): string {
  return STATUS_META[status].badge;
}

export function canTransition(from: OtStatus, to: OtStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function getAllowedNextStatuses(from: OtStatus): OtStatus[] {
  return [from, ...TRANSITIONS[from]];
}

export function canRoleMoveOt(role: Role, from: OtStatus, to: OtStatus): boolean {
  if (!canTransition(from, to)) return false;
  return ROLE_ALLOWED_TARGETS[role].includes(to);
}

export const WORKSHOP_BOARD_COLUMNS: Array<{ key: OtStatus; title: string; subtitle: string }> = [
  { key: "PROGRAMADA", title: "Pendientes", subtitle: "Agenda del día" },
  { key: "RECEPCION", title: "Recepción", subtitle: "Entrada" },
  { key: "DIAGNOSTICO", title: "Diagnóstico", subtitle: "Pendientes" },
  { key: "REPARACION", title: "En trabajo", subtitle: "En curso" },
  { key: "LISTO_ENTREGA", title: "Listo para avisar", subtitle: "Avisar cliente" },
];

export function prioBadgeClass(prio: OtPriority): string {
  if (prio === "Urgente") return "bg-red-100 text-red-700";
  if (prio === "Alta") return "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-700";
}

function toLocalYmd(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function isOrderForDay(order: OtItem, ymd: string): boolean {
  const scheduledDay = toLocalYmd(order.scheduledStart ?? null);
  if (scheduledDay) return scheduledDay === ymd;
  const createdDay = toLocalYmd(order.createdAt ?? null);
  if (createdDay) return createdDay === ymd;
  return false;
}

export function shouldShowProgrammedByRole(role: SessionRole): boolean {
  return role === "Administración" || role === "Oficina";
}

export function filterOrdersForRoleDay(
  items: OtItem[],
  role: SessionRole,
  ymd: string,
): OtItem[] {
  if (shouldShowProgrammedByRole(role)) return items;
  return items.filter((it) => isOrderForDay(it, ymd));
}
