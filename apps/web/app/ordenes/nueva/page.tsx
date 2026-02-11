'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MobileNav from "../../components/MobileNav";

type Stage = "DIAGNOSTICO" | "REPARACION" | "QC" | "LISTO";
type Item = {
  id: string;
  plate: string;
  title: string;
  prio: "Normal" | "Alta" | "Urgente";
  stage: Stage;
};

const STORAGE_KEY = "taller_items_v1";

function safeParseItems(raw: string | null): Item[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Item[]) : [];
  } catch {
    return [];
  }
}

function nextNumericId(items: Item[]) {
  let maxId = 1000;
  items.forEach((it) => {
    const n = parseInt(it.id, 10);
    if (!isNaN(n) && n > maxId) maxId = n;
  });
  return String(maxId + 1);
}

export default function NuevaOTPage() {
  const router = useRouter();
  const [matricula, setMatricula] = useState("");
  const [titulo, setTitulo] = useState("");
  const [prio, setPrio] = useState<"Normal" | "Alta" | "Urgente">("Normal");

  const canCreate = matricula.trim().length > 0 && titulo.trim().length > 0;

  function crearOT() {
    const items = safeParseItems(localStorage.getItem(STORAGE_KEY));
    const id = nextNumericId(items);

    const newItem: Item = {
      id,
      plate: matricula.trim().toUpperCase(),
      title: titulo.trim(),
      prio,
      stage: "DIAGNOSTICO",
    };

    const updated = [newItem, ...items];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    router.push(`/taller?new=${id}`);
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-800">Nueva orden</h1>
          <Link className="text-sm font-medium text-blue-600" href="/ordenes">
            Cancelar
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Rellena lo mínimo. Se guardará y aparecerá en el tablero.
        </p>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Matrícula</label>
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 p-3"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            placeholder="1234-ABC"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Título</label>
          <input
            className="mt-1 w-full rounded-xl border border-gray-200 p-3"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Revisión tacógrafo"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Prioridad</label>
          <select
            className="mt-1 w-full rounded-xl border border-gray-200 p-3"
            value={prio}
            onChange={(e) => setPrio(e.target.value as any)}
          >
            <option value="Normal">Normal</option>
            <option value="Alta">Alta</option>
            <option value="Urgente">Urgente</option>
          </select>
        </div>

        <button
          disabled={!canCreate}
          onClick={crearOT}
          className="w-full rounded-2xl bg-blue-600 p-4 text-lg font-semibold text-white disabled:opacity-40"
        >
          Crear OT
        </button>
      </section>

      <MobileNav />
    </main>
  );
}
