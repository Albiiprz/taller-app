'use client';

import { useEffect, useState } from "react";

export type Role =
  | "ADMINISTRACION"
  | "OFICINA"
  | "JEFE_TALLER"
  | "TECNICO"
  | "CONTABILIDAD"
  | "INVENTARIO";

const roles: { value: Role; label: string }[] = [
  { value: "ADMINISTRACION", label: "Administración" },
  { value: "OFICINA", label: "Oficina" },
  { value: "JEFE_TALLER", label: "Jefe/a de Taller" },
  { value: "TECNICO", label: "Técnico/a" },
  { value: "CONTABILIDAD", label: "Contabilidad" },
  { value: "INVENTARIO", label: "Inventario" },
];

export default function RoleSwitcher({
  onChange,
}: {
  onChange: (role: Role) => void;
}) {
  const [role, setRole] = useState<Role>("OFICINA");

  useEffect(() => {
    const saved = localStorage.getItem("taller_role") as Role | null;
    if (saved) {
      setRole(saved);
      onChange(saved);
    } else {
      onChange("OFICINA");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setNewRole(r: Role) {
    setRole(r);
    localStorage.setItem("taller_role", r);
    onChange(r);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 hidden sm:inline">Rol:</span>
      <select
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
        value={role}
        onChange={(e) => setNewRole(e.target.value as Role)}
      >
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
