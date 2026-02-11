'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import MobileNav from "../components/MobileNav";
import { Role, User, useSession } from "../components/useSession";

const ALL_ROLES: Role[] = ["Administración","Oficina","Jefe de Taller","Técnico","Inventario","Contabilidad"];

async function fileToCompressedDataUrl(file: File): Promise<string> {
  // Reescalar a 256px y JPEG calidad 0.7
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

function Avatar({ user }: { user: User }) {
  const initials = useMemo(() => {
    const parts = (user.name ?? "").trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? "U";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }, [user.name]);

  if (user.avatarDataUrl) {
    return (
      <img
        src={user.avatarDataUrl}
        alt="Avatar"
        className="h-16 w-16 rounded-2xl object-cover border border-gray-200"
      />
    );
  }

  return (
    <div className="h-16 w-16 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600">
      {initials}
    </div>
  );
}

export default function PerfilPage() {
  const { users, activeUser, saveUsers, hasRole } = useSession();
  const isAdmin = hasRole("Administración");

  const me = activeUser;
  const [saving, setSaving] = useState(false);

  if (!me) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 pt-10 pb-10">
        <p className="text-gray-700">No hay sesión. Ve a <Link className="text-blue-600 font-semibold" href="/login">/login</Link>.</p>
      </main>
    );
  }

  function updateMe(patch: Partial<User>) {
    const next = users.map(u => (u.id === me.id ? { ...u, ...patch } : u));
    saveUsers(next);
  }

  async function onPickAvatar(file: File | null) {
    if (!file) return;
    try {
      setSaving(true);
      const dataUrl = await fileToCompressedDataUrl(file);
      updateMe({ avatarDataUrl: dataUrl });
    } catch {
      alert("No pude procesar la foto. Prueba con otra más pequeña.");
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(r: Role) {
    if (!isAdmin) return;
    const current = me.roles ?? [];
    const next = current.includes(r) ? current.filter(x => x !== r) : [...current, r];
    updateMe({ roles: next.length ? next : ["Técnico"] });
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <header className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Mi perfil</h1>
            <p className="text-sm text-gray-600">Ver y editar tus datos.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link className="text-sm font-semibold text-blue-600" href="/taller">Taller</Link>
            {isAdmin && (
              <Link className="text-sm font-semibold text-blue-600" href="/ajustes/usuarios">Usuarios</Link>
            )}
          </div>
        </div>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-start gap-4">
          <Avatar user={me} />

          <div className="flex-1">
            <p className="text-lg font-semibold text-gray-900">{me.name}</p>
            <p className="text-sm text-gray-600">{(me.roles ?? []).join(", ")}</p>
            <p className="mt-1 text-xs text-gray-400">ID: {me.id}</p>

            <div className="mt-3">
              <label className="text-xs font-semibold text-gray-600">Foto de perfil</label>
              <input
                type="file"
                accept="image/*"
                className="mt-2 block w-full text-sm"
                onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
                disabled={saving}
              />
              <p className="mt-2 text-xs text-gray-400">Se guardará comprimida (256px) para no petar el almacenamiento.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Datos básicos</h2>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-gray-600">Teléfono</label>
            <input
              className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
              value={me.phone ?? ""}
              onChange={(e) => updateMe({ phone: e.target.value })}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600">Email</label>
            <input
              className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
              value={me.email ?? ""}
              onChange={(e) => updateMe({ email: e.target.value })}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-gray-600">Otros datos / notas</label>
            <textarea
              className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
              rows={4}
              value={me.extra ?? ""}
              onChange={(e) => updateMe({ extra: e.target.value })}
              placeholder="Ej: talla camiseta, contacto emergencia, preferencias..."
            />
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Solo Admin</h2>

        {!isAdmin ? (
          <div className="mt-2 rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800">
            ⛔ Solo Administración puede editar roles, PIN, nombre y fecha de nacimiento.
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600">Nombre</label>
              <input
                className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
                value={me.name}
                onChange={(e) => updateMe({ name: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">PIN</label>
              <input
                className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
                value={me.pin ?? ""}
                onChange={(e) => updateMe({ pin: e.target.value })}
                inputMode="numeric"
                placeholder="(vacío = entra sin PIN)"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600">Fecha de nacimiento</label>
              <input
                type="date"
                className="mt-1 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
                value={me.birthDate ?? ""}
                onChange={(e) => updateMe({ birthDate: e.target.value })}
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-600">Roles (multi)</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {ALL_ROLES.map(r => (
                  <label key={r} className="flex items-center gap-2 rounded-xl border border-gray-200 p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={(me.roles ?? []).includes(r)}
                      onChange={() => toggleRole(r)}
                    />
                    {r}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400">Puedes ser Técnico + Inventario, etc.</p>
            </div>
          </div>
        )}
      </section>

      <MobileNav />
    </main>
  );
}
