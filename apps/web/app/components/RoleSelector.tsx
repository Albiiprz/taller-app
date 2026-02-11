'use client';

import { Role, useRole } from "./useRole";

export default function RoleSelector() {
  const { role, setRole } = useRole();

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold text-gray-600">Rol actual</p>
      <select
        className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
      >
        <option>Administración</option>
        <option>Oficina</option>
        <option>Jefe de Taller</option>
        <option>Técnico</option>
        <option>Inventario</option>
        <option>Contabilidad</option>
      </select>
    </div>
  );
}
