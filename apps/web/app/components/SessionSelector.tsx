'use client';

import { useSession } from "./useSession";

export default function SessionSelector() {
  const { users, activeUser, setActive } = useSession();

  if (!activeUser) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold text-gray-600">Usuario activo</p>
      <select
        className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
        value={activeUser.id}
        onChange={(e) => setActive(e.target.value)}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} — {u.role}
          </option>
        ))}
      </select>
    </div>
  );
}
