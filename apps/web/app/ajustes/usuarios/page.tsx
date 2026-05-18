'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Role, User, useSession } from "../../components/useSession";
import { createUser, deleteUser as deleteUserApi, listUsers, updateUser as updateUserApi } from "../../core/ordersApi";

const ALL_ROLES: Role[] = ["Administración","Oficina","Jefe de Taller","Técnico","Inventario","Contabilidad"];

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    img.onload = () => {
      const max = 256;
      const { width, height } = img;
      const scale = Math.min(1, max / Math.max(width, height));
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("No canvas"));
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No image"));
    };
    img.src = url;
  });
}

export default function UsuariosAdminPage() {
  const { users, activeUser, saveUsers, hasRole } = useSession();
  const isAdmin = hasRole("Administración");
  const [loading, setLoading] = useState(false);

  // form crear
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [roles, setRoles] = useState<Role[]>(["Técnico"]);
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [extra, setExtra] = useState("");

  function normalizeLogin(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "");
  }

  function roleFromApi(value: string): Role {
    if (value === "Administración") return "Administración";
    if (value === "Oficina") return "Oficina";
    if (value === "Jefe de Taller") return "Jefe de Taller";
    if (value === "Técnico") return "Técnico";
    if (value === "Inventario") return "Inventario";
    if (value === "Contabilidad") return "Contabilidad";
    return "Técnico";
  }

  function rolesFromApi(values?: string[], fallback?: string): Role[] {
    const source = Array.isArray(values) && values.length > 0 ? values : (fallback ? [fallback] : []);
    const normalized = source.map((role) => roleFromApi(role));
    return [...new Set(normalized)];
  }

  async function loadRemoteUsers() {
    setLoading(true);
    try {
      const rows = await listUsers({ includeInactive: true });
      const mapped: User[] = rows.map((u) => ({
        id: u.id,
        name: u.name,
        roles: rolesFromApi(u.roles, u.role),
        login: u.login,
        pin: u.pin ?? "",
        avatarDataUrl: u.avatarDataUrl ?? "",
        phone: u.phone ?? "",
        email: u.email ?? "",
        birthDate: u.birthDate ?? "",
        extra: u.extra ?? "",
        isActive: u.isActive,
        createdAt: u.createdAt,
      }));
      saveUsers(mapped);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudieron cargar usuarios reales");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    void loadRemoteUsers();
  }, [isAdmin]);

  const sorted = useMemo(() => [...users].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [users]);

  function toggleCreateRole(r: Role) {
    const next = roles.includes(r) ? roles.filter(x => x !== r) : [...roles, r];
    setRoles(next.length ? next : ["Técnico"]);
  }

  async function addUser() {
    if (!isAdmin) return alert("Solo Administración puede crear usuarios.");
    const nm = name.trim();
    if (!nm) return alert("Falta el nombre");
    const role = (roles[0] ?? "Técnico");
    const lg = normalizeLogin(login || nm);
    if (!pin.trim()) return alert("El PIN es obligatorio");
    try {
      await createUser({
        name: nm,
        role,
        roles,
        login: lg,
        pin: pin.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        birthDate: birthDate || undefined,
        extra: extra.trim() || undefined,
      });
      setName(""); setLogin(""); setRoles(["Técnico"]); setPin(""); setPhone(""); setEmail(""); setBirthDate(""); setExtra("");
      await loadRemoteUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo crear usuario");
    }
  }

  async function updateUser(id: string, patch: Partial<User>) {
    if (!isAdmin) return;
    const current = users.find((u) => u.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    try {
      await updateUserApi({
        id,
        name: next.name,
        role: (next.roles?.[0] ?? "Técnico"),
        roles: next.roles ?? ["Técnico"],
        login: normalizeLogin(next.login || next.name),
        pin: next.pin || "",
        phone: next.phone || undefined,
        email: next.email || undefined,
        birthDate: next.birthDate || undefined,
        extra: next.extra || undefined,
        avatarDataUrl: next.avatarDataUrl || undefined,
        isActive: next.isActive,
      });
      const merged = users.map((u) => (u.id === id ? next : u));
      saveUsers(merged);
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo editar usuario");
    }
  }

  async function deleteUser(id: string) {
    if (!isAdmin) return alert("Solo Administración puede borrar usuarios.");
    try {
      await deleteUserApi({ id });
      await loadRemoteUsers();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo borrar usuario");
    }
  }

  function toggleRole(u: User, r: Role) {
    if (!isAdmin) return;
    const current = u.roles ?? [];
    const next = current.includes(r) ? current.filter(x => x !== r) : [...current, r];
    void updateUser(u.id, { roles: next.length ? next : ["Técnico"] });
  }

  async function onPickAvatar(u: User, file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      await updateUser(u.id, { avatarDataUrl: dataUrl });
    } catch {
      alert("No pude procesar la foto. Prueba con otra más pequeña.");
    }
  }

  return (
    <main className="min-h-screen app-bg module-admin px-4 pt-4 pb-24">
      <header className="module-hero module-admin mx-auto mb-4 w-full max-w-6xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="module-kicker">Administración</p>
            <h1 className="module-title">Perfiles</h1>
            <p className="module-copy text-sm">Alta y edición de usuarios reales en base de datos.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link className="module-map-chip" href="/taller">Taller</Link>
            <Link className="module-map-chip" href="/perfil">Mi perfil</Link>
          </div>
        </div>

        {!isAdmin && (
          <div className="mt-4 rounded-2xl bg-yellow-50 p-4 text-sm text-yellow-800">
            ⛔ Solo Administración puede gestionar perfiles.
          </div>
        )}

        <div className="mt-4 surface-status p-4">
          <p className="text-sm text-gray-700">
            Sesión: <b>{activeUser?.name ?? "—"}</b> — {(activeUser?.roles ?? []).join(", ")}
          </p>
          <div className="mt-2">
            <Link className="text-sm font-semibold text-blue-600" href="/login">Cambiar usuario</Link>
          </div>
        </div>
      </header>

      {/* Crear */}
      <section className="mx-auto w-full max-w-6xl surface-content p-4">
        <h2 className="text-base font-semibold text-gray-900">Crear perfil</h2>

        <div className="mt-3 space-y-3">
          <input className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            placeholder="Nombre" value={name} onChange={(e)=>setName(e.target.value)} disabled={!isAdmin} />
          <input className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            placeholder="Login (ej: paquito)" value={login} onChange={(e)=>setLogin(normalizeLogin(e.target.value))} disabled={!isAdmin} />

          <div>
            <p className="text-xs font-semibold text-gray-600">Roles (multi)</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ALL_ROLES.map(r => (
                <label key={r} className="flex items-center gap-2 rounded-xl border border-gray-200 p-2 text-sm">
                  <input type="checkbox" checked={roles.includes(r)} onChange={() => toggleCreateRole(r)} disabled={!isAdmin} />
                  {r}
                </label>
              ))}
            </div>
          </div>

          <input className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            placeholder="PIN (obligatorio)" value={pin} onChange={(e)=>setPin(e.target.value)} disabled={!isAdmin} inputMode="numeric" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
              placeholder="Teléfono" value={phone} onChange={(e)=>setPhone(e.target.value)} disabled={!isAdmin} />
            <input className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
              placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} disabled={!isAdmin} />
          </div>

          <input type="date" className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            value={birthDate} onChange={(e)=>setBirthDate(e.target.value)} disabled={!isAdmin} />

          <textarea className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            rows={3} placeholder="Otros datos (opcional)" value={extra} onChange={(e)=>setExtra(e.target.value)} disabled={!isAdmin} />

          <button className="w-full rounded-2xl bg-gray-900 p-4 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.99]"
            onClick={() => void addUser()} disabled={!isAdmin || !name.trim() || !pin.trim()}>
            Crear
          </button>
        </div>
      </section>

      {/* Lista */}
      <section className="mx-auto mt-4 w-full max-w-6xl surface-history p-4">
        <h2 className="text-base font-semibold text-gray-900">Usuarios</h2>
        {loading && <p className="mt-2 text-xs text-slate-500">Cargando usuarios reales...</p>}

        <div className="mt-3 space-y-3">
          {sorted.map(u => (
            <div key={u.id} className="rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {u.name} {!u.isActive && <span className="ml-2 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">DESACTIVADO</span>}
                  </p>
                  <p className="text-xs text-gray-500">{(u.roles ?? []).join(", ")} · ID: {u.id}</p>
                  <p className="text-xs text-gray-500">Login: {u.login || "-"}</p>
                  <p className="mt-1 text-xs text-gray-400">Creado: {new Date(u.createdAt).toLocaleString()}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <button className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40"
                    disabled={!isAdmin} onClick={() => void updateUser(u.id, { isActive: !u.isActive })}>
                    {u.isActive ? "Desactivar" : "Activar"}
                  </button>
                  <button className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40"
                    disabled={!isAdmin} onClick={() => void deleteUser(u.id)}>
                    Borrar
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Nombre</label>
                  <input className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.name} disabled={!isAdmin} onChange={(e)=>void updateUser(u.id, { name: e.target.value })} />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Login</label>
                  <input className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.login ?? ""} disabled={!isAdmin} onChange={(e)=>void updateUser(u.id, { login: normalizeLogin(e.target.value) })} />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">PIN</label>
                  <input className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.pin ?? ""} disabled={!isAdmin} onChange={(e)=>void updateUser(u.id, { pin: e.target.value })} inputMode="numeric" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Teléfono</label>
                  <input className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.phone ?? ""} disabled={!isAdmin} onChange={(e)=>void updateUser(u.id, { phone: e.target.value })} />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Email</label>
                  <input className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.email ?? ""} disabled={!isAdmin} onChange={(e)=>void updateUser(u.id, { email: e.target.value })} />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-600">Fecha nacimiento</label>
                  <input type="date" className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.birthDate ?? ""} disabled={!isAdmin} onChange={(e)=>void updateUser(u.id, { birthDate: e.target.value })} />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-600">Otros datos</label>
                  <textarea className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    rows={3} value={u.extra ?? ""} disabled={!isAdmin} onChange={(e)=>void updateUser(u.id, { extra: e.target.value })} />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-600">Foto</label>
                  <input type="file" accept="image/*" className="mt-2 block w-full text-sm"
                    disabled={!isAdmin} onChange={(e)=>onPickAvatar(u, e.target.files?.[0] ?? null)} />
                  <p className="mt-1 text-xs text-gray-400">Se guarda comprimida para no petar localStorage.</p>
                </div>

                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold text-gray-600">Roles (multi)</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {ALL_ROLES.map(r => (
                      <label key={r} className="flex items-center gap-2 rounded-xl border border-gray-200 p-2 text-sm">
                        <input type="checkbox" checked={(u.roles ?? []).includes(r)} disabled={!isAdmin} onChange={() => toggleRole(u, r)} />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
