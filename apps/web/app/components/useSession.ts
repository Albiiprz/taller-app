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
  login?: string;
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
    login: "admin",
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
    login: "oficina",
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
    login: "tecnico",
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

function isValidRole(r: unknown): r is Role {
  return ["Administración","Oficina","Jefe de Taller","Técnico","Contabilidad","Inventario"].includes(String(r));
}

function normalizeRoles(input: unknown): Role[] {
  if (Array.isArray(input)) {
    const roles = input.filter(isValidRole) as Role[];
    return roles.length ? roles : ["Técnico"];
  }
  if (isValidRole(input)) return [input];
  return ["Técnico"];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeStoredUser(item: Record<string, unknown>): User {
  const id = typeof item["id"] === "string" ? item["id"] : String(item["id"] ?? "");
  const safeId = id || ("u_" + Math.random().toString(16).slice(2));
  const name = typeof item["name"] === "string" ? item["name"] : "Usuario";
  const roles = normalizeRoles(item["roles"] ?? item["role"]);
  const login = typeof item["login"] === "string" ? item["login"] : "";
  const pin = typeof item["pin"] === "string" ? item["pin"] : "";

  return {
    id: safeId,
    name,
    roles,
    login,
    pin,
    avatarDataUrl: typeof item["avatarDataUrl"] === "string" ? item["avatarDataUrl"] : "",
    phone: typeof item["phone"] === "string" ? item["phone"] : "",
    email: typeof item["email"] === "string" ? item["email"] : "",
    birthDate: typeof item["birthDate"] === "string" ? item["birthDate"] : "",
    extra: typeof item["extra"] === "string" ? item["extra"] : "",
    isActive: typeof item["isActive"] === "boolean" ? item["isActive"] : true,
    createdAt: typeof item["createdAt"] === "string" ? item["createdAt"] : new Date().toISOString(),
    lastLoginAt: typeof item["lastLoginAt"] === "string" ? item["lastLoginAt"] : "",
  };
}

function migrateFromV2OrV1(): User[] | null {
  // v2
  const v2raw = safeParse<unknown[]>(localStorage.getItem("taller_users_v2"), []);
  const v2 = (Array.isArray(v2raw) ? v2raw : []).filter(isRecord);
  if (v2.length > 0) {
    return v2.map((u) => ({
      ...normalizeStoredUser({
        ...u,
        extra: typeof u["notes"] === "string" ? u["notes"] : "",
      }),
      // v2 no guardaba avatar/birthDate
      avatarDataUrl: "",
      birthDate: "",
    }));
  }

  // v1 (muy antiguo)
  const v1raw = safeParse<unknown[]>(localStorage.getItem("taller_users_v1"), []);
  const v1 = (Array.isArray(v1raw) ? v1raw : []).filter(isRecord);
  if (v1.length > 0) {
    return v1.map((u) => ({
      ...normalizeStoredUser(u),
      avatarDataUrl: "",
      phone: "",
      email: "",
      birthDate: "",
      extra: "",
      isActive: true,
      lastLoginAt: "",
    }));
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
    const uRaw = safeParse<unknown[]>(localStorage.getItem(STORAGE_USERS), []);
    const a = localStorage.getItem(STORAGE_ACTIVE_USER) || "";
    const normalized = (Array.isArray(uRaw) ? uRaw : [])
      .filter(isRecord)
      .map((item) => normalizeStoredUser(item));
    setUsers(normalized);
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
