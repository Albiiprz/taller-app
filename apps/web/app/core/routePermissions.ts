import type { Role } from "../components/useSession";

export type RouteKey =
  | "inicio"
  | "ordenes"
  | "ordenes_nueva"
  | "tecnico_simple"
  | "citas_nueva"
  | "citas_asistente"
  | "calendario"
  | "taller"
  | "inventario"
  | "avisos"
  | "perfil"
  | "usuarios"
  | "clientes"
  | "exportar";

const ALL_ROLES: Role[] = [
  "Administración",
  "Oficina",
  "Jefe de Taller",
  "Técnico",
  "Contabilidad",
  "Inventario",
];

const ROUTE_PERMISSIONS: Record<RouteKey, Role[]> = {
  inicio: ALL_ROLES,
  ordenes: ALL_ROLES,
  avisos: ALL_ROLES,
  perfil: ALL_ROLES,
  ordenes_nueva: ["Administración", "Oficina", "Jefe de Taller"],
  tecnico_simple: ["Técnico", "Jefe de Taller", "Administración"],
  citas_nueva: ["Administración", "Oficina"],
  citas_asistente: ["Administración", "Oficina"],
  calendario: ["Administración", "Oficina", "Jefe de Taller"],
  taller: ALL_ROLES,
  inventario: ["Administración", "Inventario"],
  usuarios: ["Administración"],
  clientes: ["Administración", "Oficina", "Jefe de Taller"],
  exportar: ["Administración", "Oficina"],
};

export function canAccessRoute(userRoles: Role[], route: RouteKey): boolean {
  if (!Array.isArray(userRoles) || userRoles.length === 0) return false;
  const allowed = ROUTE_PERMISSIONS[route] ?? [];
  return userRoles.some((role) => allowed.includes(role));
}
