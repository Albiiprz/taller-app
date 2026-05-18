'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Role, User, useSession } from "../components/useSession";
import { listLoginUsersApi, loginApi, setAuthTokens } from "../core/authApi";
import BrandMark from "../components/ui/BrandMark";

const roleMap: Record<string, Role> = {
  "Administración": "Administración",
  "Oficina": "Oficina",
  "Jefe de Taller": "Jefe de Taller",
  "Técnico": "Técnico",
  "Contabilidad": "Contabilidad",
  "Inventario": "Inventario",
};

function mapRole(raw: string): Role | null {
  return roleMap[raw] ?? null;
}

function resolvePostLoginPath(roles: Role[]): string {
  const hasTech = roles.includes("Técnico");
  const hasOfficeFlow = roles.includes("Administración") || roles.includes("Oficina");
  if (hasTech && !hasOfficeFlow) return "/tecnico/simple";
  return "/inicio";
}

export default function LoginClient() {
  const router = useRouter();
  const { users, setActive, saveUsers } = useSession();

  const [remoteUsers, setRemoteUsers] = useState<Array<{ id: string; name: string; role: string; roles?: string[]; login: string; pinRequired: boolean }>>([]);
  const activeUsers = useMemo(() => remoteUsers.filter((u) => u.login), [remoteUsers]);

  const [selected, setSelected] = useState<string>("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const selectedUser = activeUsers.find((u) => u.id === selected) ?? activeUsers[0];

  async function loadUsers() {
    try {
      const list = await listLoginUsersApi();
      setRemoteUsers(list);
      const lastUserId = localStorage.getItem("taller_last_login_user_id_v1");
      if (lastUserId && list.some((u) => u.id === lastUserId)) {
        setSelected(lastUserId);
      } else if (list[0]?.id) {
        setSelected(list[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar la entrada.");
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function submit() {
    setError("");
    if (!selectedUser) {
      setError("No hay nadie disponible para entrar.");
      return;
    }
    const pinToSend = pin.trim();
    if (!pinToSend) {
      setError("Escribe el PIN para entrar.");
      return;
    }

    try {
      const result = await loginApi({
        login: selectedUser.login,
        pin: pinToSend,
      });
      setAuthTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
      const mappedRoles: Role[] = [
        ...new Set(
          (Array.isArray(result.user.roles) && result.user.roles.length > 0
            ? result.user.roles
            : [result.user.role])
            .map((raw) => mapRole(raw))
            .filter((role): role is Role => Boolean(role)),
        ),
      ];
      const roles: Role[] = mappedRoles.length > 0 ? mappedRoles : ["Técnico"];
      const merged: User[] = [
        {
          id: result.user.id,
          name: result.user.name,
          roles,
          pin: "",
          isActive: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        },
        ...users.filter((u) => u.id !== result.user.id),
      ];
      saveUsers(merged);
      setActive(result.user.id);
      localStorage.setItem("taller_last_login_user_id_v1", result.user.id);
      router.push(resolvePostLoginPath(roles));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo entrar ahora.");
    }
  }

  return (
    <main className="min-h-screen app-bg flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Logo + nombre del taller */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl shadow-2xl"
            style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" }}>
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="2"/>
              <path d="M16 8h4l3 5v3h-7V8Z"/>
              <circle cx="5.5" cy="18.5" r="2.5"/>
              <circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Talleres MALU</h1>
          <p className="mt-2 text-sm font-semibold text-slate-400">
            Elige tu usuario y escribe el PIN
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/95 p-6 shadow-2xl backdrop-blur">
          <label className="text-sm font-extrabold uppercase tracking-widest text-slate-500">Usuario</label>
          <select
            className="mt-2 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-base font-semibold text-slate-900 outline-none focus:border-[color:var(--brand-navy)] focus:bg-white"
            value={selectedUser?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {activeUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {Array.isArray(u.roles) && u.roles.length > 0 ? u.roles.join(", ") : u.role}
              </option>
            ))}
          </select>

          <label className="mt-5 block text-sm font-extrabold uppercase tracking-widest text-slate-500">PIN</label>
          <input
            className="mt-2 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-2xl font-extrabold tracking-[0.5em] text-slate-900 outline-none focus:border-[color:var(--brand-navy)] focus:bg-white"
            placeholder="· · · ·"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            inputMode="numeric"
            type="password"
          />

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <button
            className="mt-6 w-full rounded-2xl p-4 text-lg font-extrabold text-white shadow-lg active:scale-[0.98] transition-transform"
            style={{ background: "linear-gradient(135deg, #0b2a4a 0%, #1a3a5c 100%)" }}
            onClick={() => void submit()}
          >
            Entrar al taller
          </button>
        </div>
      </div>
    </main>
  );
}
