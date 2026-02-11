'use client';

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../components/useSession";

export default function LoginPage() {
  const router = useRouter();
  const { users, markLogin } = useSession();

  const activeUsers = useMemo(() => users.filter(u => u.isActive), [users]);

  const [selected, setSelected] = useState<string>("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const selectedUser = activeUsers.find(u => u.id === selected) ?? activeUsers[0];

  function submit() {
    setError("");
    if (!selectedUser) {
      setError("No hay usuarios activos.");
      return;
    }

    const required = (selectedUser.pin ?? "").trim();
    if (required && pin.trim() !== required) {
      setError("PIN incorrecto.");
      return;
    }

    markLogin(selectedUser.id);
    router.push("/inicio");
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-10 pb-10">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-900">Entrar</h1>
        <p className="mt-2 text-sm text-gray-600">
          Elige tu usuario y escribe tu PIN (si lo tiene).
        </p>

        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <label className="text-sm font-semibold text-gray-700">Usuario</label>
          <select
            className="mt-2 w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            value={selectedUser?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {activeUsers.map(u => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.roles.join(", ")}
              </option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-semibold text-gray-700">PIN</label>
          <input
            className="mt-2 w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            placeholder={selectedUser?.pin ? "Introduce PIN" : "(Este usuario no requiere PIN)"}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
          />

          {error && (
            <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            className="mt-4 w-full rounded-2xl bg-gray-900 p-4 text-base font-semibold text-white active:scale-[0.99]"
            onClick={submit}
          >
            Entrar
          </button>
        </div>
      </div>
    </main>
  );
}
