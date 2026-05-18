export const OT_PRIORITIES = ['Normal', 'Alta', 'Urgente'] as const;
export type OtPriority = (typeof OT_PRIORITIES)[number];

export const OT_STATUSES = [
  'PROGRAMADA',
  'PRE_ENTRADA',
  'RECEPCION',
  'DIAGNOSTICO',
  'PRESUPUESTO_ENVIADO',
  'APROBADO',
  'REPARACION',
  'QC',
  'LISTO_ENTREGA',
  'ENTREGADO',
  'FACTURADO',
  'CERRADO',
] as const;
export type OtStatus = (typeof OT_STATUSES)[number];

export const APP_ROLES = [
  'Administración',
  'Oficina',
  'Jefe de Taller',
  'Técnico',
  'Contabilidad',
  'Inventario',
] as const;
export type AppRole = (typeof APP_ROLES)[number];

const TRANSITIONS: Record<OtStatus, OtStatus[]> = {
  PROGRAMADA: ['RECEPCION', 'PRE_ENTRADA'],
  PRE_ENTRADA: ['RECEPCION'],
  RECEPCION: ['DIAGNOSTICO'],
  DIAGNOSTICO: ['PRESUPUESTO_ENVIADO', 'REPARACION'],
  PRESUPUESTO_ENVIADO: ['APROBADO'],
  APROBADO: ['REPARACION'],
  REPARACION: ['QC'],
  QC: ['LISTO_ENTREGA', 'REPARACION'],
  LISTO_ENTREGA: ['ENTREGADO'],
  ENTREGADO: ['FACTURADO'],
  FACTURADO: ['CERRADO'],
  CERRADO: [],
};

const ROLE_ALLOWED_TARGETS: Record<AppRole, OtStatus[]> = {
  'Administración': [...OT_STATUSES],
  Oficina: [
    'PRE_ENTRADA',
    'RECEPCION',
    'DIAGNOSTICO',
    'PRESUPUESTO_ENVIADO',
    'APROBADO',
    'LISTO_ENTREGA',
    'ENTREGADO',
  ],
  'Jefe de Taller': ['DIAGNOSTICO', 'REPARACION', 'QC', 'LISTO_ENTREGA', 'APROBADO'],
  'Técnico': ['REPARACION', 'QC', 'LISTO_ENTREGA'],
  Contabilidad: ['FACTURADO', 'CERRADO'],
  Inventario: [],
};

export function isOtPriority(value: string): value is OtPriority {
  return OT_PRIORITIES.includes(value as OtPriority);
}

export function isOtStatus(value: string): value is OtStatus {
  return OT_STATUSES.includes(value as OtStatus);
}

export function isAppRole(value: string): value is AppRole {
  return APP_ROLES.includes(value as AppRole);
}

export function canTransition(from: OtStatus, to: OtStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function canRoleMoveTo(role: AppRole, to: OtStatus): boolean {
  return ROLE_ALLOWED_TARGETS[role].includes(to);
}

export function canMoveByRoleAndFlow(role: AppRole, from: OtStatus, to: OtStatus): boolean {
  return canTransition(from, to) && canRoleMoveTo(role, to);
}
