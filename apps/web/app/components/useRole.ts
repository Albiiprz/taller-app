'use client';

import { useEffect, useState } from "react";

export type Role =
  | "Administración"
  | "Oficina"
  | "Jefe de Taller"
  | "Técnico"
  | "Contabilidad"
  | "Inventario";

const STORAGE_ROLE = "taller_role_v1";

export function getStoredRole(): Role {
  if (typeof window === "undefined") return "Administración";
  const raw = window.localStorage.getItem(STORAGE_ROLE);
  const valid: Role[] = ["Administración","Oficina","Jefe de Taller","Técnico","Contabilidad","Inventario"];
  return (valid.includes(raw as Role) ? (raw as Role) : "Administración");
}

export function setStoredRole(role: Role) {
  window.localStorage.setItem(STORAGE_ROLE, role);
}

export function useRole() {
  const [role, setRole] = useState<Role>(() => getStoredRole());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_ROLE) setRole(getStoredRole());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function updateRole(next: Role) {
    setStoredRole(next);
    setRole(next);
  }

  return { role, setRole: updateRole };
}
