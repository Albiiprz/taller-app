'use client';

import { useEffect, useMemo, useState } from "react";

export type Role =
  | "Administración"
  | "Oficina"
  | "Jefe de Taller"
  | "Técnico"
  | "Contabilidad"
  | "Inventario";

export type User = {
  id: string;
  name: string;
  roles: Role[];           // ✅ multi-rol
  pin?: string;

  avatarDataUrl?: string;  // ✅ foto comprimida (data URL)
  phone?: string;
  email?: string;
  birthDate?: string;      // ISO YYYY-MM-DD
  extra?: string;          // otros datos libres

  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
};

const STORAGE_USERS = "taller_users_v3";
const STORAGE_ACTIVE_USER = "taller_active_user_v3";

const DEFAULT_USERS: User[] = [
  {
    id: "u_admin",
    name: "Admin",
    roles: ["Administración"],
    pin: "",
    avatarDataUrl: "",
    phone: "",
    email: "",
    birthDate: "",
    extra: "",
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: "",
  },
  {
    id: "u_oficina",
    name: "Oficina",
    roles: ["Oficina"],
    pin: "1234",
    avatarDataUrl: "",
    phone: "",
    email: "",
    birthDate: "",
    extra: "",
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: "",
  },
  {
    id: "u_tecnico",
    name: "Técnico",
    roles: ["Técnico"],
    pin: "1234",
    avatarDataUrl: "",
    phone: "",
    email: "",
    birthDate: "",
    extra: "",
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: "",
  },
];

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isValidRole(r: any): r is Role {
  return ["Administración","Oficina","Jefe de Taller","Técnico","Contabilidad","Inventario"].includes(String(r));
}

function normalizeRoles(input: any): Role[] {
  if (Array.isArray(input)) {
    const roles = input.filter(isValidRole) as Role[];
    return roles.length ? roles : ["Técnico"];
  }
  if (isValidRole(input)) return [input];
  return ["Técnico"];
}

function migrateFromV2OrV1(): User[] | null {
  // v2
  const v2 = safeParse<any[]>(localStorage.getItem("taller_users_v2"), []);
  if (Array.isArray(v2) && v2.length > 0) {
    return v2.map((u: any) => ({
      id: String(u.id ?? ("u_" + Math.random().toString(16).slice(2))),
      name: String(u.name ?? "Usuario"),
      roles: normalizeRoles(u.role ?? u.roles),
      pin: String(u.pin ?? ""),
      avatarDataUrl: "",
      phone: String(u.phone ?? ""),
      email: String(u.email ?? ""),
      birthDate: "",
      extra: String(u.notes ?? ""),
      isActive: Boolean(u.isActive ?? true),
      createdAt: String(u.createdAt ?? new Date().toISOString()),
      lastLoginAt: String(u.lastLoginAt ?? u.lastLoginAt ?? ""),
    })) as User[];
  }

  // v1 (muy antiguo)
  const v1 = safeParse<any[]>(localStorage.getItem("taller_users_v1"), []);
  if (Array.isArray(v1) && v1.length > 0) {
    return v1.map((u: any) => ({
      id: String(u.id ?? ("u_" + Math.random().toString(16).slice(2))),
      name: String(u.name ?? "Usuario"),
      roles: normalizeRoles(u.role ?? u.roles),
      pin: String(u.pin ?? ""),
      avatarDataUrl: "",
      phone: "",
      email: "",
      birthDate: "",
      extra: "",
      isActive: true,
      createdAt: String(u.createdAt ?? new Date().toISOString()),
      lastLoginAt: "",
    })) as User[];
  }

  return null;
}

export function initUsersIfNeeded() {
  if (typeof window === "undefined") return;

  const users = safeParse<User[]>(localStorage.getItem(STORAGE_USERS), []);
  if (Array.isArray(users) && users.length > 0) {
    const active = localStorage.getItem(STORAGE_ACTIVE_USER);
    if (!active) localStorage.setItem(STORAGE_ACTIVE_USER, users[0].id);
    return;
  }

  const migrated = migrateFromV2OrV1();
  if (migrated && migrated.length > 0) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(migrated));
    const activeOld =
      localStorage.getItem("taller_active_user_v2") ||
      localStorage.getItem("taller_active_user_v1") ||
      migrated[0].id;
    localStorage.setItem(STORAGE_ACTIVE_USER, activeOld);
    return;
  }

  localStorage.setItem(STORAGE_USERS, JSON.stringify(DEFAULT_USERS));
  localStorage.setItem(STORAGE_ACTIVE_USER, "u_admin");
}

export function useSession() {
  const [users, setUsers] = useState<User[]>([]);
  const [activeUserId, setActiveUserId] = useState<string>("");

  function load() {
    initUsersIfNeeded();
    const u = safeParse<User[]>(localStorage.getItem(STORAGE_USERS), []);
    const a = localStorage.getItem(STORAGE_ACTIVE_USER) || "";
    setUsers(Array.isArray(u) ? u : []);
    setActiveUserId(a);
  }

  useEffect(() => {
    load();
    const onFocus = () => load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_USERS || e.key === STORAGE_ACTIVE_USER) load();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const activeUser = useMemo(
    () => users.find((u) => u.id === activeUserId) ?? users[0],
    [users, activeUserId]
  );

  function saveUsers(next: User[]) {
    setUsers(next);
    localStorage.setItem(STORAGE_USERS, JSON.stringify(next));
  }

  function setActive(id: string) {
    setActiveUserId(id);
    localStorage.setItem(STORAGE_ACTIVE_USER, id);
  }

  function hasRole(role: Role): boolean {
    const r = activeUser?.roles ?? [];
    return r.includes(role);
  }

  function markLogin(userId: string) {
    const next = users.map((u) =>
      u.id === userId ? { ...u, lastLoginAt: new Date().toISOString() } : u
    );
    saveUsers(next);
    setActive(userId);
  }

  return { users, activeUser, activeUserId, setActive, saveUsers, reload: load, markLogin, hasRole };
}
