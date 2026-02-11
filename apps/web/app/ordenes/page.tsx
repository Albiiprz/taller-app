'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MobileNav from "../components/MobileNav";

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

function stageInfo(stage: Stage) {
  if (stage === "DIAGNOSTICO") return { label: "Diagnóstico", badge: "bg-purple-100 text-purple-700" };
  if (stage === "REPARACION") return { label: "En reparación", badge: "bg-orange-100 text-orange-700" };
  if (stage === "QC") return { label: "Control calidad", badge: "bg-blue-100 text-blue-700" };
  return { label: "Listo entrega", badge: "bg-green-100 text-green-700" };
}

function prioBadge(prio: Item["prio"]) {
  if (prio === "Urgente") return "bg-red-100 text-red-700";
  if (prio === "Alta") return "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-700";
}

export default function OrdenesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");

  function load() {
    setItems(safeParseItems(localStorage.getItem(STORAGE_KEY)));
  }

  useEffect(() => {
    load();
    const onFocus = () => load();
    const onVisibility = () => document.visibilityState === "visible" && load();
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && load();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((it) =>
      it.id.toLowerCase().includes(query) ||
      it.plate.toLowerCase().includes(query) ||
      it.title.toLowerCase().includes(query) ||
      it.prio.toLowerCase().includes(query)
    );
  }, [items, q]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-800">Órdenes</h1>
          <Link
            href="/ordenes/nueva"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm active:scale-[0.98]"
          >
            + Nueva
          </Link>
        </div>

        <p className="mt-1 text-sm text-gray-500">
          Aquí ves las órdenes reales (las mismas que el tablero).
        </p>

        <div className="mt-4">
          <input
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-base outline-none focus:border-blue-400"
            placeholder="Buscar por OT o matrícula…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
            <span>Ej: 1234 o 1234-ABC</span>
            <span>{filtered.length} resultados</span>
          </div>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm text-center">
          <p className="text-base font-semibold text-gray-800">No hay órdenes</p>
          <p className="mt-1 text-sm text-gray-500">
            Crea una desde <b>+ Nueva</b> y aparecerá aquí y en <b>Taller</b>.
          </p>
          <Link
            href="/ordenes/nueva"
            className="mt-4 inline-block rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
          >
            Crear mi primera OT
          </Link>
        </div>
      ) : (
        <section className="space-y-3">
          {filtered.map((it) => {
            const st = stageInfo(it.stage);
            return (
              <Link
                key={it.id}
                href={`/ordenes/${it.id}`}
                className="block rounded-2xl bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-gray-800">OT #{it.id}</p>
                    <p className="text-sm text-gray-500">{it.plate}</p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${st.badge}`}>
                      {st.label}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${prioBadge(it.prio)}`}>
                      {it.prio}
                    </span>
                  </div>
                </div>

                <p className="mt-2 text-sm text-gray-700">{it.title}</p>
              </Link>
            );
          })}
        </section>
      )}

      <MobileNav />
    </main>
  );
}
