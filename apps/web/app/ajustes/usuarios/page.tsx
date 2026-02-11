'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { Role, User, useSession } from "../../components/useSession";

const ALL_ROLES: Role[] = ["Administración","Oficina","Jefe de Taller","Técnico","Inventario","Contabilidad"];

function uid() {
  return "u_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

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

  // form crear
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<Role[]>(["Técnico"]);
  const [pin, setPin] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [extra, setExtra] = useState("");

  const sorted = useMemo(() => [...users].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [users]);

  function toggleCreateRole(r: Role) {
    const next = roles.includes(r) ? roles.filter(x => x !== r) : [...roles, r];
    setRoles(next.length ? next : ["Técnico"]);
  }

  function addUser() {
    if (!isAdmin) return alert("⛔ Solo Administración puede crear usuarios.");
    const nm = name.trim();
    if (!nm) return alert("Falta el nombre");

    const u: User = {
      id: uid(),
      name: nm,
      roles: roles.length ? roles : ["Técnico"],
      pin: pin.trim(),
      avatarDataUrl: "",
      phone: phone.trim(),
      email: email.trim(),
      birthDate: birthDate,
      extra: extra,
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: "",
    };

    saveUsers([u, ...users]);
    setName(""); setRoles(["Técnico"]); setPin(""); setPhone(""); setEmail(""); setBirthDate(""); setExtra("");
  }

  function updateUser(id: string, patch: Partial<User>) {
    if (!isAdmin) return alert("⛔ Solo Administración puede editar usuarios.");
    const next = users.map(u => (u.id === id ? { ...u, ...patch } : u));
    saveUsers(next);
  }

  function deleteUser(id: string) {
    if (!isAdmin) return alert("⛔ Solo Administración puede borrar usuarios.");
    if (id == "u_admin") return alert("No puedes borrar el Admin por defecto.");
    saveUsers(users.filter(u => u.id !== id));
  }

  function toggleRole(u: User, r: Role) {
    if (!isAdmin) return;
    const current = u.roles ?? [];
    const next = current.includes(r) ? current.filter(x => x !== r) : [...current, r];
    updateUser(u.id, { roles: next.length ? next : ["Técnico"] });
  }

  async function onPickAvatar(u: User, file: File | null) {
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      updateUser(u.id, { avatarDataUrl: dataUrl });
    } catch {
      alert("No pude procesar la foto. Prueba con otra más pequeña.");
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <header className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Perfiles</h1>
            <p className="text-sm text-gray-600">Alta, edición y roles (multi).</p>
          </div>
          <div className="flex items-center gap-3">
            <Link className="text-sm font-semibold text-blue-600" href="/taller">Taller</Link>
            <Link className="text-sm font-semibold text-blue-600" href="/perfil">Mi perfil</Link>
          </div>
        </div>

        {!isAdmin && (
          <div className="mt-4 rounded-2xl bg-yellow-50 p-4 text-sm text-yellow-800">
            ⛔ Solo Administración puede gestionar perfiles.
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-700">
            Sesión: <b>{activeUser?.name ?? "—"}</b> — {(activeUser?.roles ?? []).join(", ")}
          </p>
          <div className="mt-2">
            <Link className="text-sm font-semibold text-blue-600" href="/login">Cambiar usuario</Link>
          </div>
        </div>
      </header>

      {/* Crear */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Crear perfil</h2>

        <div className="mt-3 space-y-3">
          <input className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            placeholder="Nombre" value={name} onChange={(e)=>setName(e.target.value)} disabled={!isAdmin} />

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
            placeholder="PIN (opcional)" value={pin} onChange={(e)=>setPin(e.target.value)} disabled={!isAdmin} inputMode="numeric" />

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
            onClick={addUser} disabled={!isAdmin || !name.trim()}>
            Crear
          </button>
        </div>
      </section>

      {/* Lista */}
      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Usuarios</h2>

        <div className="mt-3 space-y-3">
          {sorted.map(u => (
            <div key={u.id} className="rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {u.name} {!u.isActive && <span className="ml-2 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">DESACTIVADO</span>}
                  </p>
                  <p className="text-xs text-gray-500">{(u.roles ?? []).join(", ")} · ID: {u.id}</p>
                  <p className="mt-1 text-xs text-gray-400">Creado: {new Date(u.createdAt).toLocaleString()}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <button className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40"
                    disabled={!isAdmin || u.id === "u_admin"} onClick={() => updateUser(u.id, { isActive: !u.isActive })}>
                    {u.isActive ? "Desactivar" : "Activar"}
                  </button>
                  <button className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40"
                    disabled={!isAdmin || u.id === "u_admin"} onClick={() => deleteUser(u.id)}>
                    Borrar
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Nombre</label>
                  <input className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.name} disabled={!isAdmin} onChange={(e)=>updateUser(u.id, { name: e.target.value })} />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">PIN</label>
                  <input className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.pin ?? ""} disabled={!isAdmin} onChange={(e)=>updateUser(u.id, { pin: e.target.value })} inputMode="numeric" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Teléfono</label>
                  <input className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.phone ?? ""} disabled={!isAdmin} onChange={(e)=>updateUser(u.id, { phone: e.target.value })} />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600">Email</label>
                  <input className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.email ?? ""} disabled={!isAdmin} onChange={(e)=>updateUser(u.id, { email: e.target.value })} />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-600">Fecha nacimiento</label>
                  <input type="date" className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    value={u.birthDate ?? ""} disabled={!isAdmin} onChange={(e)=>updateUser(u.id, { birthDate: e.target.value })} />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-600">Otros datos</label>
                  <textarea className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 disabled:opacity-60"
                    rows={3} value={u.extra ?? ""} disabled={!isAdmin} onChange={(e)=>updateUser(u.id, { extra: e.target.value })} />
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
