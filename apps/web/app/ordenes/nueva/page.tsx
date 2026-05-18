'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MobileNav from "../../components/MobileNav";
import { createWorkOrder } from "../../core/ordersApi";
import type { OtItem, OtPriority } from "../../core/workflow";
import { useSession } from "../../components/useSession";
import { Icon } from "../../components/ui/Icon";

export default function NuevaOTPage() {
  const router = useRouter();
  const { activeUser } = useSession();
  const [matricula, setMatricula] = useState("");
  const [titulo, setTitulo] = useState("");
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tiempo, setTiempo] = useState("");
  const [prio, setPrio] = useState<OtPriority>("Normal");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const canCreate = matricula.trim().length > 0 && titulo.trim().length > 0;

  async function crearOT() {
    if (isSaving) return;
    setError("");
    setIsSaving(true);

    try {
      const created: OtItem = await createWorkOrder({
        plate: matricula.trim().toUpperCase(),
        title: titulo.trim(),
        priority: prio,
        actorRole: (activeUser?.roles?.[0] ?? "Oficina"),
        actorName: activeUser?.name ?? "Usuario",
      });
      router.push(`/taller?new=${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la OT");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen app-bg module-office px-4 pt-4 mobile-nav-safe">
      <header className="module-hero module-office mx-auto mb-4 w-full max-w-3xl p-4">
        <div className="flex items-center justify-between">
          <h1 className="module-title inline-flex items-center gap-2">
            <Icon name="new" className="h-6 w-6" />
            Nueva orden
          </h1>
          <Link className="module-map-chip" href="/ordenes">
            Cancelar
          </Link>
        </div>
        <p className="module-copy mt-1 text-sm">
          Rellena lo mínimo. Se guardará y aparecerá en el tablero.
        </p>
      </header>

      <section className="mx-auto w-full max-w-3xl space-y-4 surface-content p-4">
        <div>
          <label className="text-sm font-extrabold text-slate-700">Matrícula</label>
          <input
            className="mt-1 w-full rounded-xl border-2 border-slate-200 p-3 font-semibold text-slate-900"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            placeholder="1234-ABC"
          />
        </div>

        <div>
          <label className="text-sm font-extrabold text-slate-700">Trabajo</label>
          <input
            className="mt-1 w-full rounded-xl border-2 border-slate-200 p-3 font-semibold text-slate-900"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Revisión tacógrafo"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-extrabold text-slate-700">Cliente <span className="font-normal text-slate-400">(opcional)</span></label>
            <input
              className="mt-1 w-full rounded-xl border-2 border-slate-200 p-3 font-semibold text-slate-900"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Juan García"
            />
          </div>
          <div>
            <label className="text-sm font-extrabold text-slate-700">Teléfono <span className="font-normal text-slate-400">(opcional)</span></label>
            <input
              className="mt-1 w-full rounded-xl border-2 border-slate-200 p-3 font-semibold text-slate-900"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="666 123 456"
              inputMode="tel"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-extrabold text-slate-700">Tiempo est. <span className="font-normal text-slate-400">(opcional)</span></label>
            <select
              className="mt-1 w-full rounded-xl border-2 border-slate-200 p-3 font-semibold text-slate-900"
              value={tiempo}
              onChange={(e) => setTiempo(e.target.value)}
            >
              <option value="">—</option>
              <option value="30">30 min</option>
              <option value="60">1 hora</option>
              <option value="90">1,5 h</option>
              <option value="120">2 horas</option>
              <option value="180">3 horas</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-extrabold text-slate-700">Prioridad</label>
            <select
              className="mt-1 w-full rounded-xl border-2 border-slate-200 p-3 font-semibold text-slate-900"
              value={prio}
              onChange={(e) => setPrio(e.target.value as OtPriority)}
            >
              <option value="Normal">Normal</option>
              <option value="Alta">Alta</option>
              <option value="Urgente">Urgente</option>
            </select>
          </div>
        </div>

        <button
          disabled={!canCreate || isSaving}
          onClick={crearOT}
          className="cta-primary inline-flex w-full items-center justify-center gap-2 p-4 text-lg disabled:opacity-40"
        >
          <Icon name="new" className="h-5 w-5" />
          {isSaving ? "Creando..." : "Crear OT"}
        </button>

        {error && (
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
      </section>

      <MobileNav />
    </main>
  );
}
