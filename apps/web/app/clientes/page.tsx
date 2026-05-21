'use client';

import { useEffect, useState } from "react";
import MobileNav from "../components/MobileNav";
import { useSession } from "../components/useSession";
import { searchClients, getClient, updateClient, type ClientSummary, type ClientDetail } from "../core/ordersApi";
import Link from "next/link";

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ClientesPage() {
  const { hasRole } = useSession();
  const canEdit = hasRole("Administración") || hasRole("Oficina");

  const [q, setQ] = useState("");
  const [results, setResults] = useState<ClientSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ClientDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", company: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchClients(q));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function openClient(id: number) {
    setLoadingDetail(true);
    setSelected(null);
    setEditing(false);
    try {
      setSelected(await getClient(id));
    } finally {
      setLoadingDetail(false);
    }
  }

  function startEdit() {
    if (!selected) return;
    setEditForm({ name: selected.name, phone: selected.phone ?? "", email: selected.email ?? "", company: selected.company ?? "" });
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateClient(selected.id, editForm);
      if (updated) setSelected(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen app-bg mobile-nav-safe">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0b2a4a] px-4 py-4 shadow-lg">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-extrabold uppercase tracking-widest text-white/60">Base de datos</p>
            <h1 className="text-xl font-black text-white">Clientes</h1>
          </div>
        </div>
        <div className="mx-auto mt-3 w-full max-w-6xl">
          <div className="relative">
            <svg className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
            </svg>
            <input
              className="w-full rounded-2xl bg-white/10 py-3 pl-11 pr-4 text-sm font-semibold text-white placeholder-white/50 outline-none focus:bg-white/20"
              placeholder="Buscar por nombre, teléfono o matrícula…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-32">
        {q.trim().length < 2 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center">
            <p className="text-sm font-extrabold text-slate-500">Escribe al menos 2 caracteres para buscar</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">Los clientes se crean automáticamente al registrar citas</p>
          </div>
        )}

        {q.trim().length >= 2 && !searching && results.length === 0 && (
          <p className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
            Sin resultados para &ldquo;{q}&rdquo;
          </p>
        )}

        {results.length > 0 && !selected && (
          <ul className="space-y-2">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="btn-tap w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-left"
                  onClick={() => void openClient(c.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-slate-900">{c.name}{c.company ? ` — ${c.company}` : ""}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        {[c.phone, c.email].filter(Boolean).join(" · ")}
                      </p>
                      {c.plates.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.plates.map((p) => (
                            <span key={p} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-600">{p}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {c.last_appointment && (
                      <p className="shrink-0 text-[10px] font-semibold text-slate-400">{fmtDate(c.last_appointment)}</p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {loadingDetail && (
          <p className="text-center text-sm font-semibold text-slate-500 py-10">Cargando…</p>
        )}

        {selected && !loadingDetail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button type="button" className="btn-tap rounded-2xl border-2 border-slate-200 px-4 py-2 text-sm font-extrabold text-slate-700"
                onClick={() => { setSelected(null); setEditing(false); }}>
                ← Volver
              </button>
              {canEdit && !editing && (
                <button type="button" className="btn-tap rounded-2xl bg-[#0b2a4a] px-4 py-2 text-sm font-extrabold text-white"
                  onClick={startEdit}>
                  Editar datos
                </button>
              )}
            </div>

            {/* Datos cliente */}
            <section className="rounded-2xl border-2 border-slate-200 bg-white p-5">
              {editing ? (
                <div className="space-y-3">
                  {([
                    { label: "Nombre", key: "name" as const },
                    { label: "Teléfono", key: "phone" as const },
                    { label: "Email", key: "email" as const },
                    { label: "Empresa", key: "company" as const },
                  ]).map(({ label, key }) => (
                    <div key={key}>
                      <label className="text-xs font-extrabold text-slate-500">{label}</label>
                      <input
                        className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-blue-400"
                        value={editForm[key]}
                        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setEditing(false)}
                      className="btn-tap flex-1 rounded-2xl border-2 border-slate-200 py-2.5 text-sm font-extrabold text-slate-700">
                      Cancelar
                    </button>
                    <button type="button" onClick={() => void saveEdit()} disabled={saving}
                      className="btn-tap flex-1 rounded-2xl bg-[#0b2a4a] py-2.5 text-sm font-extrabold text-white disabled:opacity-50">
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "Nombre", value: selected.name },
                    { label: "Teléfono", value: selected.phone },
                    { label: "Email", value: selected.email },
                    { label: "Empresa", value: selected.company },
                    { label: "Cliente desde", value: fmtDate(selected.created_at) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <dt className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{label}</dt>
                      <dd className="mt-0.5 font-semibold text-slate-800">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            {/* Vehículos */}
            {selected.vehicles.length > 0 && (
              <section className="rounded-2xl border-2 border-slate-200 bg-white p-5">
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">Vehículos</p>
                <ul className="space-y-2">
                  {selected.vehicles.map((v) => (
                    <li key={v.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                      <span className="rounded-lg bg-[#0b2a4a] px-2 py-1 text-xs font-black text-white">{v.plate}</span>
                      <span className="text-sm font-semibold text-slate-700">{v.model || v.vehicle_type || "—"}</span>
                      {v.vin && <span className="text-xs text-slate-400">{v.vin}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Historial de citas */}
            {selected.appointments.length > 0 && (
              <section className="rounded-2xl border-2 border-slate-200 bg-white p-5">
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-3">Últimas citas</p>
                <ul className="space-y-2">
                  {selected.appointments.map((a) => (
                    <li key={a.id}>
                      <Link href={`/ordenes/${a.id}`}
                        className="btn-tap flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50">
                        <div>
                          <p className="text-sm font-extrabold text-slate-900">{a.work_type || "Sin tipo"}</p>
                          <p className="text-xs font-semibold text-slate-500">{a.plate || ""} · {fmtDate(a.start_at)}</p>
                        </div>
                        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <MobileNav />
    </main>
  );
}
