'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MobileNav from "../components/MobileNav";
import { useSession } from "../components/useSession";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardContent } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";

type Stage = "DIAGNOSTICO" | "REPARACION" | "QC" | "LISTO";

type Item = {
  id: string;
  plate: string;
  title: string;
  prio: "Normal" | "Alta" | "Urgente";
  stage: Stage;
};

const STAGES: { key: Stage; title: string; subtitle: string }[] = [
  { key: "DIAGNOSTICO", title: "Diagnóstico", subtitle: "Pendientes" },
  { key: "REPARACION", title: "En reparación", subtitle: "En curso" },
  { key: "QC", title: "Control calidad", subtitle: "Final" },
  { key: "LISTO", title: "Listo entrega", subtitle: "Avisar cliente" },
];

const STORAGE_KEY = "taller_items_v1";

const DEFAULT_ITEMS: Item[] = [
  { id: "1236", plate: "7777-GHI", title: "Fallo sensor", prio: "Alta", stage: "DIAGNOSTICO" },
  { id: "1238", plate: "2222-JKL", title: "Revisión tacógrafo", prio: "Normal", stage: "DIAGNOSTICO" },
  { id: "1234", plate: "1234-ABC", title: "Revisión tacógrafo", prio: "Normal", stage: "REPARACION" },
  { id: "1239", plate: "9999-MNO", title: "Cableado", prio: "Urgente", stage: "REPARACION" },
  { id: "1241", plate: "3333-PQR", title: "Mantenimiento", prio: "Normal", stage: "QC" },
  { id: "1242", plate: "4444-STU", title: "Tacógrafo OK", prio: "Normal", stage: "LISTO" },
];

function safeParseItems(raw: string | null): Item[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Item[]) : [];
  } catch {
    return [];
  }
}

function prioBadgeClass(prio: Item["prio"]) {
  if (prio === "Urgente") return "bg-red-100 text-red-700";
  if (prio === "Alta") return "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-700";
}

function stageLabel(stage: Stage) {
  if (stage === "DIAGNOSTICO") return "Diagnóstico";
  if (stage === "REPARACION") return "En reparación";
  if (stage === "QC") return "Control calidad";
  return "Listo entrega";
}

export default function TallerPage() {
  const { hasRole } = useSession();
  const isAdmin = hasRole('Administración');
  const searchParams = useSearchParams();

  const [items, setItems] = useState<Item[]>([]);
  const [moveOpenFor, setMoveOpenFor] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [flashId, setFlashId] = useState<string | null>(null);

  function loadFromStorage() {
    const saved = safeParseItems(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.length === 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ITEMS));
      setItems(DEFAULT_ITEMS);
      return;
    }
    setItems(saved);
  }

  useEffect(() => {
    loadFromStorage();

    const onFocus = () => loadFromStorage();
    const onVisibility = () => {
      if (document.visibilityState === "visible") loadFromStorage();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) loadFromStorage();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Si vienes desde "Nueva OT" con ?new=ID, resaltar y hacer scroll
  useEffect(() => {
    const newId = searchParams.get("new");
    if (!newId) return;

    loadFromStorage();
    setFlashId(newId);

    setTimeout(() => {
      const el = document.getElementById(`ot-${newId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    const t = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(t);
  }, [searchParams]);

  const filteredItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((it) => {
      return (
        it.id.toLowerCase().includes(query) ||
        it.plate.toLowerCase().includes(query) ||
        it.title.toLowerCase().includes(query) ||
        it.prio.toLowerCase().includes(query) ||
        stageLabel(it.stage).toLowerCase().includes(query)
      );
    });
  }, [items, q]);

  const grouped = useMemo(() => {
    const m: Record<Stage, Item[]> = { DIAGNOSTICO: [], REPARACION: [], QC: [], LISTO: [] };
    for (const it of filteredItems) m[it.stage].push(it);
    return m;
  }, [filteredItems]);

  function moveItem(id: string, nextStage: Stage) {
    const updated = items.map((x) => (x.id === id ? { ...x, stage: nextStage } : x));
    setItems(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setMoveOpenFor(null);
  }

  function resetDemo() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ITEMS));
    setItems(DEFAULT_ITEMS);
    setMoveOpenFor(null);
    setQ("");
    setFlashId(null);
  }

  return (
    <main className="min-h-screen app-bg px-4 pt-6 pb-24">
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Taller</h1>
            {isAdmin && (
              <Link href="/ajustes/usuarios" className="ml-3 inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800">
                Usuarios
              </Link>
            )}
            <Link href="/perfil" className="ml-2 inline-flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800">
              Perfil
            </Link>
            <p className="text-sm text-gray-600">
              Crear OT → aparece aquí. Mover → elegir estado. Fácil.
            </p>
          </div>

          <Button variant="secondary" size="sm" onClick={resetDemo}>
            Reset
          </Button>
        </div>

        <div className="mt-4">
          <Input
            placeholder="Buscar por OT, matrícula o texto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
            <span>Ej: 1234 o ABC</span>
            <span>{filteredItems.length} resultados</span>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {STAGES.map((col) => {
          const colItems = grouped[col.key];

          return (
            <Card key={col.key}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{col.title}</h2>
                    <p className="text-xs text-gray-500">{col.subtitle}</p>
                  </div>

                  <Badge className="bg-gray-100 text-gray-700">
                    {colItems.length}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="mt-3 space-y-3">
                  {colItems.map((it) => (
                    <div
                      key={it.id}
                      id={`ot-${it.id}`}
                      className={`rounded-2xl border bg-white p-4 transition ${
                        flashId === it.id
                          ? "border-blue-400 ring-4 ring-blue-100"
                          : "border-gray-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-gray-900">OT #{it.id}</span>
                        <Badge className={prioBadgeClass(it.prio)}>{it.prio}</Badge>
                      </div>

                      <p className="mt-2 text-sm font-semibold text-gray-800">{it.title}</p>
                      <p className="mt-1 text-xs text-gray-500">{it.plate}</p>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Link href={`/ordenes/${it.id}`} className="block">
                          <Button className="w-full" size="sm">
                            Abrir
                          </Button>
                        </Link>

                        <Button
                          className="w-full"
                          variant="secondary"
                          size="sm"
                          onClick={() => setMoveOpenFor(moveOpenFor === it.id ? null : it.id)}
                        >
                          Mover
                        </Button>
                      </div>

                      {moveOpenFor === it.id && (
                        <div className="mt-3 rounded-2xl bg-gray-50 p-3">
                          <p className="text-xs font-semibold text-gray-700">¿A dónde la mando?</p>

                          <select
                            className="mt-2 w-full rounded-2xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                            value={it.stage}
                            onChange={(e) => moveItem(it.id, e.target.value as Stage)}
                          >
                            {STAGES.map((s) => (
                              <option key={s.key} value={s.key}>
                                {stageLabel(s.key)}
                              </option>
                            ))}
                          </select>

                          <Button
                            className="mt-2 w-full"
                            variant="ghost"
                            size="sm"
                            onClick={() => setMoveOpenFor(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                  {colItems.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
                      Nada aquí ��
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <MobileNav />
    </main>
  );
}
