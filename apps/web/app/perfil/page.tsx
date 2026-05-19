'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MobileNav from "../components/MobileNav";
import { Role, User, useSession } from "../components/useSession";
import { logoutApi } from "../core/authApi";
import {
  getPushPublicKey,
  sendPushTestApi,
  subscribePushApi,
  unsubscribePushApi,
} from "../core/pushApi";
import { Icon } from "../components/ui/Icon";
import InfoHint from "../components/ui/InfoHint";

const ALL_ROLES: Role[] = ["Administración", "Oficina", "Jefe de Taller", "Técnico", "Inventario", "Contabilidad"];

type ProfilePane = "me" | "access" | "admin";

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

function Avatar({ user }: { user: User }) {
  const initials = useMemo(() => {
    const parts = (user.name ?? "").trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? "U";
    const b = parts[1]?.[0] ?? "";
    return (a + b).toUpperCase();
  }, [user.name]);

  if (user.avatarDataUrl) {
    return <img src={user.avatarDataUrl} alt="Avatar" className="h-20 w-20 rounded-3xl border-2 border-slate-200 object-cover" />;
  }

  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-slate-200 bg-slate-100 text-xl font-extrabold text-slate-600">
      {initials}
    </div>
  );
}

function paneButtonClass(active: boolean) {
  return active
    ? "border-blue-700 bg-blue-700 text-white"
    : "border-slate-200 bg-white text-slate-800";
}

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export default function PerfilPage() {
  const router = useRouter();
  const { users, activeUser, saveUsers, hasRole } = useSession();
  const isAdmin = hasRole("Administración");
  const me = activeUser;
  const [saving, setSaving] = useState(false);
  const [pushReady, setPushReady] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pane, setPane] = useState<ProfilePane>("me");

  useEffect(() => {
    async function detectPush() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      setPushReady(true);
      setPushEnabled(Boolean(existing));
    }
    void detectPush();
  }, []);

  if (!me) {
    return (
      <main className="min-h-screen app-bg px-4 pt-10 pb-10">
        <p className="text-slate-700">No hay sesión. Ve a <Link className="font-extrabold text-blue-700" href="/login">/login</Link>.</p>
      </main>
    );
  }

  function updateMe(patch: Partial<User>) {
    const next = users.map((u) => (u.id === me.id ? { ...u, ...patch } : u));
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
    const next = current.includes(r) ? current.filter((x) => x !== r) : [...current, r];
    updateMe({ roles: next.length ? next : ["Técnico"] });
  }

  async function onLogout() {
    await logoutApi();
    router.push("/login");
  }

  async function enablePush() {
    if (!pushReady) return;
    try {
      setPushBusy(true);
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await subscribePushApi(existing);
        setPushEnabled(true);
        return;
      }
      const publicKey = await getPushPublicKey();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(publicKey),
      });
      await subscribePushApi(sub);
      setPushEnabled(true);
      alert("Notificaciones activadas.");
    } catch {
      alert("No se pudo activar notificaciones. Revisa permisos del navegador.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    try {
      setPushBusy(true);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushApi(sub.endpoint);
        await sub.unsubscribe();
      }
      setPushEnabled(false);
      alert("Notificaciones desactivadas.");
    } catch {
      alert("No se pudo desactivar notificaciones.");
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    try {
      setPushBusy(true);
      await sendPushTestApi();
      alert("Enviado. Si no llega, revisa permisos de notificación.");
    } catch {
      alert("No se pudo enviar la prueba.");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <main className="min-h-screen app-bg module-admin px-4 pt-4 mobile-nav-safe">
      <header className="module-hero module-admin mx-auto mb-4 w-full max-w-4xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2">
              <h1 className="module-title inline-flex items-center gap-2">
                <Icon name="profile" className="h-6 w-6" />
                Perfil
              </h1>
              <InfoHint text="Perfil simple: tus datos, acceso y permisos si eres administración." />
            </div>
            <p className="module-copy mt-1 text-sm">Tus datos, tu acceso y, si toca, tus permisos.</p>
          </div>
        </div>
      </header>

      <section className="surface-status mx-auto mt-4 w-full max-w-4xl p-4">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar user={me} />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-extrabold text-slate-900">{me.name}</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{(me.roles ?? []).join(", ")}</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">ID: {me.id}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setPane("me")} className={`rounded-2xl border-2 px-4 py-3 text-sm font-extrabold ${paneButtonClass(pane === "me")}`}>
            Mis datos
          </button>
          <button onClick={() => setPane("access")} className={`rounded-2xl border-2 px-4 py-3 text-sm font-extrabold ${paneButtonClass(pane === "access")}`}>
            Acceso
          </button>
          {isAdmin ? (
            <button onClick={() => setPane("admin")} className={`rounded-2xl border-2 px-4 py-3 text-sm font-extrabold ${paneButtonClass(pane === "admin")}`}>
              Permisos
            </button>
          ) : null}
        </div>
      </section>

      {pane === "me" && (
        <section className="surface-content mx-auto mt-4 w-full max-w-4xl p-4">
          <h2 className="text-base font-extrabold text-slate-900">Mis datos</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">Tu información básica de contacto.</p>

          <div className="mt-4">
            <label className="text-xs font-extrabold text-slate-700">Foto</label>
            <input type="file" accept="image/*" className="mt-2 block w-full text-sm" onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)} disabled={saving} />
            <p className="mt-2 text-xs font-semibold text-slate-400">Se guarda comprimida para que la app vaya rápida.</p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-extrabold text-slate-700">Teléfono</label>
              <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-base font-semibold outline-none focus:border-blue-400" value={me.phone ?? ""} onChange={(e) => updateMe({ phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-extrabold text-slate-700">Email</label>
              <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-base font-semibold outline-none focus:border-blue-400" value={me.email ?? ""} onChange={(e) => updateMe({ email: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-extrabold text-slate-700">Notas</label>
              <textarea className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-base font-semibold outline-none focus:border-blue-400" rows={4} value={me.extra ?? ""} onChange={(e) => updateMe({ extra: e.target.value })} placeholder="Algo útil sobre ti o tu puesto" />
            </div>
          </div>
        </section>
      )}

      {pane === "access" && (
        <section className="surface-content mx-auto mt-4 w-full max-w-4xl p-4">
          <h2 className="text-base font-extrabold text-slate-900">Acceso</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">Cómo entras y con qué perfil trabajas.</p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Usuario</p>
              <p className="mt-1 text-base font-extrabold text-slate-900">{me.login || "Sin usuario"}</p>
            </article>
            <article className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">PIN</p>
              <p className="mt-1 text-base font-extrabold text-slate-900">{me.pin ? "Configurado" : "Sin PIN"}</p>
            </article>
            <article className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 sm:col-span-2">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Roles activos</p>
              <p className="mt-1 text-base font-extrabold text-slate-900">{(me.roles ?? []).join(", ")}</p>
            </article>
          </div>

          {!isAdmin ? (
            <div className="mt-4 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              Solo Administración puede cambiar nombre, PIN y permisos.
            </div>
          ) : null}

          {pushReady ? (
            <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-extrabold text-slate-900">Notificaciones en móvil</p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                Estado: {pushEnabled ? "activadas" : "desactivadas"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {pushEnabled ? (
                  <button
                    type="button"
                    onClick={() => void disablePush()}
                    disabled={pushBusy}
                    className="btn-tap rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 disabled:opacity-40"
                  >
                    Desactivar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void enablePush()}
                    disabled={pushBusy}
                    className="btn-tap rounded-2xl bg-slate-900 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40"
                  >
                    Activar notificaciones
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void sendTestPush()}
                  disabled={pushBusy || !pushEnabled}
                  className="btn-tap rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-extrabold text-emerald-800 disabled:opacity-40"
                >
                  Probar notificación
                </button>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {pane === "admin" && isAdmin && (
        <section className="surface-history mx-auto mt-4 w-full max-w-4xl p-4">
          <h2 className="text-base font-extrabold text-slate-900">Permisos y datos de acceso</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">Solo visible para administración.</p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="text-xs font-extrabold text-slate-700">Nombre</label>
              <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-base font-semibold outline-none focus:border-blue-400" value={me.name} onChange={(e) => updateMe({ name: e.target.value })} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-extrabold text-slate-700">PIN</label>
                <input className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-base font-semibold outline-none focus:border-blue-400" value={me.pin ?? ""} onChange={(e) => updateMe({ pin: e.target.value })} inputMode="numeric" placeholder="Vacío = entra sin PIN" />
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-700">Fecha de nacimiento</label>
                <input type="date" className="mt-1 w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-base font-semibold outline-none focus:border-blue-400" value={me.birthDate ?? ""} onChange={(e) => updateMe({ birthDate: e.target.value })} />
              </div>
            </div>

            <div>
              <label className="text-xs font-extrabold text-slate-700">Roles</label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ALL_ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 p-3 text-sm font-semibold text-slate-800">
                    <input type="checkbox" checked={(me.roles ?? []).includes(r)} onChange={() => toggleRole(r)} />
                    {r}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-400">Puedes combinar varios roles en una misma persona.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/inicio" className="btn-tap rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-800">
                Volver al inicio
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto mt-4 w-full max-w-4xl pb-4">
        <button
          onClick={() => void onLogout()}
          className="btn-tap w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-4 text-base font-extrabold text-slate-700"
        >
          Cerrar sesión
        </button>
      </section>

      <MobileNav />
    </main>
  );
}
