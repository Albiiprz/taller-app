import type { Role } from "../components/useSession";
import type { RouteKey } from "./routePermissions";

export type SimpleAction = {
  href: string;
  label: string;
  route: RouteKey;
  tone: "primary" | "secondary" | "warn";
};

export type RoleSimpleConfig = {
  primaryNav: RouteKey[];
  quickActions: SimpleAction[];
};

const CONFIG: Record<Role, RoleSimpleConfig> = {
  "Administración": {
    primaryNav: ["inicio", "citas_nueva", "ordenes", "calendario", "inventario", "perfil"],
    quickActions: [
      { href: "/citas/nueva", label: "Nueva cita guiada", route: "citas_nueva", tone: "primary" },
      { href: "/calendario", label: "Calendario y huecos", route: "calendario", tone: "warn" },
      { href: "/ordenes", label: "Trabajos abiertos", route: "ordenes", tone: "primary" },
      { href: "/inventario", label: "Stock crítico", route: "inventario", tone: "secondary" },
    ],
  },
  Oficina: {
    primaryNav: ["inicio", "citas_nueva", "ordenes", "calendario", "perfil"],
    quickActions: [
      { href: "/citas/nueva", label: "Nueva cita", route: "citas_nueva", tone: "primary" },
      { href: "/calendario", label: "Llegadas de hoy", route: "calendario", tone: "secondary" },
      { href: "/ordenes", label: "Vehículos listos", route: "ordenes", tone: "secondary" },
    ],
  },
  "Jefe de Taller": {
    primaryNav: ["inicio", "taller", "ordenes", "calendario", "perfil"],
    quickActions: [
      { href: "/taller", label: "Tablero taller", route: "taller", tone: "primary" },
      { href: "/calendario", label: "Carga técnicos", route: "calendario", tone: "secondary" },
      { href: "/ordenes", label: "Órdenes de hoy", route: "ordenes", tone: "secondary" },
    ],
  },
  "Técnico": {
    primaryNav: ["tecnico_simple", "ordenes", "perfil"],
    quickActions: [
      { href: "/tecnico/simple", label: "Mi trabajo ahora", route: "tecnico_simple", tone: "primary" },
      { href: "/ordenes", label: "Trabajos de hoy", route: "ordenes", tone: "secondary" },
      { href: "/perfil", label: "Mi perfil", route: "perfil", tone: "secondary" },
    ],
  },
  Contabilidad: {
    primaryNav: ["inicio", "ordenes", "perfil"],
    quickActions: [
      { href: "/ordenes", label: "Pendientes facturar", route: "ordenes", tone: "primary" },
      { href: "/ordenes", label: "Cobros pendientes", route: "ordenes", tone: "secondary" },
    ],
  },
  Inventario: {
    primaryNav: ["inicio", "inventario", "ordenes", "perfil"],
    quickActions: [
      { href: "/inventario", label: "Escanear producto", route: "inventario", tone: "primary" },
      { href: "/inventario?view=low", label: "Stock bajo", route: "inventario", tone: "warn" },
      { href: "/inventario?view=moves", label: "Movimientos", route: "inventario", tone: "secondary" },
    ],
  },
};

export function getPrimaryRole(roles: Role[] | undefined): Role {
  if (!Array.isArray(roles) || roles.length === 0) return "Oficina";
  return roles[0];
}

export function getSimpleConfigByRoles(roles: Role[] | undefined): RoleSimpleConfig {
  const role = getPrimaryRole(roles);
  return CONFIG[role];
}
