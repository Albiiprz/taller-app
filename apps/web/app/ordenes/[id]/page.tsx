'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MobileNav from "../../components/MobileNav";
import RoleSelector from "../../components/RoleSelector";
import { useRole } from "../../components/useRole";

type Stage = "DIAGNOSTICO" | "REPARACION" | "QC" | "LISTO";
type Item = {
  id: string;
  plate: string;
  title: string;
  prio: "Normal" | "Alta" | "Urgente";
  stage: Stage;
};

type Photo = {
  id: string;
  dataUrl: string; // base64
  createdAt: string; // ISO
};

type Product = {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  unit: "ud" | "l" | "m";
};

type Move = {
  id: string;
  productId: string;
  qty: number; // + entrada, - salida
  reason: string;
  createdAt: string;
};

type BudgetLine = {
  id: string;
  concept: string;
  qty: number;
  price: number;
};

type Budget = {
  status: "BORRADOR" | "ENVIADO" | "APROBADO" | "RECHAZADO";
  lines: BudgetLine[];
  updatedAt: string; // ISO
};

type AuditEvent = {
  id: string;
  type: "estado" | "nota" | "checklist" | "tiempo" | "presupuesto";
  message: string;
  createdAt: string; // ISO
};

type TimeData = {
  totalSeconds: number;
  running: boolean;
  startedAt: string | null; // ISO
  updatedAt: string; // ISO
};

type Checklist = {
  km: string;
  fuel: "Vacío" | "1/4" | "1/2" | "3/4" | "Lleno";
  damages: boolean;
  damagesText: string;
  hasKeys: boolean;
  hasDocs: boolean;
  hasTachoCard: boolean;
  tachoIssue: boolean;
  extra: string;
  updatedAt: string; // ISO
};

type Note = {
  id: string;
  text: string;
  createdAt: string; // ISO
};

const STORAGE_ITEMS = "taller_items_v1";
const STORAGE_NOTES = "taller_notes_v1";
const STORAGE_CHECKLIST = "taller_checklist_v1";
const STORAGE_TIME = "taller_time_v1";
const STORAGE_AUDIT = "taller_audit_v1";
const STORAGE_BUDGET = "taller_budget_v1";
const STORAGE_PRODUCTS = "taller_products_v1";
const STORAGE_MOVES = "taller_moves_v1";
const STORAGE_PHOTOS = "taller_photos_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function stageLabel(stage: Stage) {
  if (stage === "DIAGNOSTICO") return "Diagnóstico";
  if (stage === "REPARACION") return "En reparación";
  if (stage === "QC") return "Control calidad";
  return "Listo entrega";
}

function stageBadge(stage: Stage) {
  if (stage === "DIAGNOSTICO") return "bg-purple-100 text-purple-700";
  if (stage === "REPARACION") return "bg-orange-100 text-orange-700";
  if (stage === "QC") return "bg-blue-100 text-blue-700";
  return "bg-green-100 text-green-700";
}

async function compressImage(file: File, maxW = 1280, quality = 0.72): Promise<string> {
  // Devuelve un dataUrl JPEG comprimido (mucho más ligero que la foto original)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxW / img.width);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No hay canvas 2D");

  ctx.drawImage(img, 0, 0, w, h);

  // Convertimos a JPEG comprimido
  return canvas.toDataURL("image/jpeg", quality);
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function DetalleOT() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { role } = useRole();
  const canEditBudget = role === 'Administración' || role === 'Oficina' || role === 'Jefe de Taller';

  const [items, setItems] = useState<Item[]>([]);
  const [noteText, setNoteText] = useState("");
  const [notesMap, setNotesMap] = useState<Record<string, Note[]>>({});
  const [checklistMap, setChecklistMap] = useState<Record<string, Checklist>>({});
  const [timeMap, setTimeMap] = useState<Record<string, TimeData>>({});
  const [auditMap, setAuditMap] = useState<Record<string, AuditEvent[]>>({});
  const [budgetMap, setBudgetMap] = useState<Record<string, Budget>>({});

  const [products, setProducts] = useState<Product[]>([]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [consProd, setConsProd] = useState("");
  const [consQty, setConsQty] = useState("1");
  const [nowTick, setNowTick] = useState(0);
  const [photosMap, setPhotosMap] = useState<Record<string, Photo[]>>({});
  const [isMoveOpen, setIsMoveOpen] = useState(false);

  // Cargar OT + notas
  useEffect(() => {
    const loadedItems = safeParse<Item[]>(localStorage.getItem(STORAGE_ITEMS), []);
    setItems(loadedItems);

    const loadedNotes = safeParse<Record<string, Note[]>>(localStorage.getItem(STORAGE_NOTES), {});
    setNotesMap(loadedNotes);

    const loadedChecklist = safeParse<Record<string, Checklist>>(localStorage.getItem(STORAGE_CHECKLIST), {});
    setChecklistMap(loadedChecklist);

    const loadedTime = safeParse<Record<string, TimeData>>(localStorage.getItem(STORAGE_TIME), {});
    setTimeMap(loadedTime);

    const loadedAudit = safeParse<Record<string, AuditEvent[]>>(localStorage.getItem(STORAGE_AUDIT), {});
    setAuditMap(loadedAudit);

    const loadedBudget = safeParse<Record<string, Budget>>(localStorage.getItem(STORAGE_BUDGET), {});
    setBudgetMap(loadedBudget);

    const loadedProducts = safeParse<Product[]>(localStorage.getItem(STORAGE_PRODUCTS), []);
    setProducts(Array.isArray(loadedProducts) ? loadedProducts : []);

    const loadedMoves = safeParse<Move[]>(localStorage.getItem(STORAGE_MOVES), []);
    setMoves(Array.isArray(loadedMoves) ? loadedMoves : []);

    const loadedPhotos = safeParse<Record<string, Photo[]>>(localStorage.getItem(STORAGE_PHOTOS), {});
    setPhotosMap(loadedPhotos);
  }, []);
  // Refresco visual del contador cuando está corriendo
  useEffect(() => {
    const td = timeMap[id];
    if (!td?.running) return;

    const t = setInterval(() => setNowTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [id, timeMap]);
const ot = useMemo(() => items.find((x) => x.id === id), [items, id]);
  const notes = notesMap[id] ?? [];
  const audit = auditMap[id] ?? [];
  const budget: Budget = budgetMap[id] ?? { status: "BORRADOR", lines: [], updatedAt: "" };
  const timeData = timeMap[id] ?? {
    totalSeconds: 0,
    running: false,
    startedAt: null,
    updatedAt: "",
  };

  const checklist = checklistMap[id] ?? {
    km: "",
    fuel: "1/2",
    damages: false,
    damagesText: "",
    hasKeys: true,
    hasDocs: true,
    hasTachoCard: false,
    tachoIssue: false,
    extra: "",
    updatedAt: "",
  };
  const photos = photosMap[id] ?? [];

  function saveItems(next: Item[]) {
    setItems(next);
    localStorage.setItem(STORAGE_ITEMS, JSON.stringify(next));
  }

  function savePhotos(nextMap: Record<string, Photo[]>) {
    setPhotosMap(nextMap);
    try {
      localStorage.setItem(STORAGE_PHOTOS, JSON.stringify(nextMap));
    } catch (e) {
      // Si no cabe, no rompemos la app
      alert("⚠️ No cabe más en el almacenamiento. Prueba con una foto más pequeña o borra alguna foto antigua.");
      console.error(e);
    }
  }

  function saveProducts(next: Product[]) {
    setProducts(next);
    localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(next));
  }

  function saveMoves(next: Move[]) {
    setMoves(next);
    localStorage.setItem(STORAGE_MOVES, JSON.stringify(next));
  }

  function consumeMaterial() {
    const pid = consProd;
    const qtyNum = parseInt(consQty || "0", 10);

    if (!pid) {
      alert("Elige un producto");
      return;
    }
    if (!qtyNum || qtyNum <= 0) {
      alert("Cantidad inválida");
      return;
    }

    const idx = products.findIndex(p => p.id === pid);
    if (idx === -1) {
      alert("Producto no encontrado");
      return;
    }

    const nextProducts = [...products];
    nextProducts[idx] = { ...nextProducts[idx], stock: nextProducts[idx].stock - qtyNum };
    saveProducts(nextProducts);

    const mv: Move = {
      id: String(Date.now()),
      productId: pid,
      qty: -qtyNum,
      reason: `Consumo OT #${id}`,
      createdAt: new Date().toISOString(),
    };
    saveMoves([mv, ...moves]);

    pushAudit("checklist", `Material consumido: ${pid} (-${qtyNum})`);
    setConsQty("1");
  }

  function saveBudget(nextMap: Record<string, Budget>) {
    setBudgetMap(nextMap);
    localStorage.setItem(STORAGE_BUDGET, JSON.stringify(nextMap));
  }

  function updateBudget(nextBudget: Budget) {
    const b: Budget = { ...nextBudget, updatedAt: new Date().toISOString() };
    saveBudget({ ...budgetMap, [id]: b });
  }

  function budgetTotal(b: Budget) {
    return (b.lines || []).reduce((acc, ln) => acc + (Number(ln.qty) || 0) * (Number(ln.price) || 0), 0);
  }

  function addBudgetLine() {
    if (!canEditBudget) {
      alert("⛔ No tienes permiso para modificar presupuestos.");
      return;
    }

    const ln: BudgetLine = { id: String(Date.now()), concept: "", qty: 1, price: 0 };
    updateBudget({ ...budget, lines: [ln, ...(budget.lines || [])] });
    pushAudit("presupuesto", "Línea de presupuesto añadida");
  }

  function updateLine(lineId: string, patch: Partial<BudgetLine>) {
    if (!canEditBudget) {
      alert("⛔ No tienes permiso para modificar presupuestos.");
      return;
    }

    const lines = (budget.lines || []).map((l) => (l.id === lineId ? { ...l, ...patch } : l));
    updateBudget({ ...budget, lines });
  }

  function deleteLine(lineId: string) {
    if (!canEditBudget) {
      alert("⛔ No tienes permiso para modificar presupuestos.");
      return;
    }

    const lines = (budget.lines || []).filter((l) => l.id !== lineId);
    updateBudget({ ...budget, lines });
    pushAudit("presupuesto", "Línea de presupuesto eliminada");
  }

  function setBudgetStatus(status: Budget["status"]) {
    if (!canEditBudget) {
      alert("⛔ No tienes permiso para modificar presupuestos.");
      return;
    }

    updateBudget({ ...budget, status });
    const msg =
      status === "ENVIADO" ? "Presupuesto enviado" :
      status === "APROBADO" ? "Presupuesto aprobado" :
      status === "RECHAZADO" ? "Presupuesto rechazado" :
      "Presupuesto en borrador";
    pushAudit("presupuesto", msg);
  }

  function saveAudit(nextMap: Record<string, AuditEvent[]>) {
    setAuditMap(nextMap);
    localStorage.setItem(STORAGE_AUDIT, JSON.stringify(nextMap));
  }

  function pushAudit(type: AuditEvent["type"], message: string) {
    const ev: AuditEvent = {
      id: String(Date.now()),
      type,
      message,
      createdAt: new Date().toISOString(),
    };
    const next = { ...auditMap, [id]: [ev, ...(auditMap[id] ?? [])] };
    saveAudit(next);
  }

  function saveTime(nextMap: Record<string, TimeData>) {
    setTimeMap(nextMap);
    localStorage.setItem(STORAGE_TIME, JSON.stringify(nextMap));
  }

  function formatHMS(totalSeconds: number) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function currentSeconds(): number {
    if (!timeData.running || !timeData.startedAt) return timeData.totalSeconds;
    const start = new Date(timeData.startedAt).getTime();
    const now = Date.now();
    const extra = Math.max(0, Math.floor((now - start) / 1000));
    return timeData.totalSeconds + extra;
  }

  function startTimer() {
    if (timeData.running) return;
    const next: TimeData = {
      ...timeData,
      running: true,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveTime({ ...timeMap, [id]: next });
    pushAudit('tiempo', 'Tiempo parado');
  }

  function stopTimer() {
    if (!timeData.running || !timeData.startedAt) return;

    const start = new Date(timeData.startedAt).getTime();
    const now = Date.now();
    const extra = Math.max(0, Math.floor((now - start) / 1000));

    const next: TimeData = {
      totalSeconds: timeData.totalSeconds + extra,
      running: false,
      startedAt: null,
      updatedAt: new Date().toISOString(),
    };

    saveTime({ ...timeMap, [id]: next });
    pushAudit('tiempo', 'Tiempo parado');
  }

  function saveChecklist(nextMap: Record<string, Checklist>) {
    setChecklistMap(nextMap);
    localStorage.setItem(STORAGE_CHECKLIST, JSON.stringify(nextMap));
  }

  function updateChecklist(patch: Partial<Checklist>) {
    const next: Checklist = { ...checklist, ...patch, updatedAt: new Date().toISOString() };
    const nextMap = { ...checklistMap, [id]: next };
    saveChecklist(nextMap);
    pushAudit('checklist', 'Checklist actualizado');
  }

  function saveNotes(nextMap: Record<string, Note[]>) {
    setNotesMap(nextMap);
    localStorage.setItem(STORAGE_NOTES, JSON.stringify(nextMap));
  }

  function changeStage(nextStage: Stage) {
    const updated = items.map((x) => (x.id === id ? { ...x, stage: nextStage } : x));
    saveItems(updated);
    pushAudit('estado', `Estado cambiado a ${stageLabel(nextStage)}`);
    setIsMoveOpen(false);
  }

  async function onPickPhoto(file: File) {
    try {
      // 1) Comprimir antes de guardar (clave para que no reviente localStorage)
      const dataUrl = await compressImage(file, 1280, 0.72);

      // 2) Si aun así es enorme, avisamos (evita romper)
      const approxBytes = Math.round((dataUrl.length * 3) / 4); // aproximación
      if (approxBytes > 1_200_000) {
        alert("⚠️ La foto sigue siendo muy grande. Prueba otra más ligera o hazla con menos resolución.");
        return;
      }

      const newPhoto: Photo = {
        id: String(Date.now()),
        dataUrl,
        createdAt: new Date().toISOString(),
      };

      const nextMap = { ...photosMap, [id]: [newPhoto, ...(photosMap[id] ?? [])] };
      savePhotos(nextMap);
    } catch (e) {
      alert("⚠️ No pude procesar esa foto. Prueba otra.");
      console.error(e);
    }
  }

  function deletePhoto(photoId: string) {
    const next = (photosMap[id] ?? []).filter((p) => p.id !== photoId);
    const nextMap = { ...photosMap, [id]: next };
    savePhotos(nextMap);
  }

  function addNote() {
    const text = noteText.trim();
    if (!text) return;

    const newNote: Note = {
      id: String(Date.now()),
      text,
      createdAt: new Date().toISOString(),
    };

    const nextMap = { ...notesMap, [id]: [newNote, ...(notesMap[id] ?? [])] };
    saveNotes(nextMap);
    pushAudit('nota', 'Nota añadida');
    setNoteText("");
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-800">OT #{id}</h1>
          <Link className="text-sm font-medium text-blue-600" href="/ordenes">
            Volver
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Aquí puedes cambiar estado y dejar notas. (Se guarda solo)
        </p>
              <div className="mt-4">
          <RoleSelector />
        </div>
      </header>

      {!ot ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-base font-semibold text-gray-800">No encontrada</p>
          <p className="mt-1 text-sm text-gray-500">
            Esta OT no existe (o aún no se ha cargado).
          </p>
          <Link
            href="/taller"
            className="mt-4 inline-block rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Ir a Taller
          </Link>
        </div>
      ) : (
        <section className="space-y-4">
          {/* Datos */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Estado</span>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${stageBadge(ot.stage)}`}>
                {stageLabel(ot.stage)}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Matrícula</span>
                <span className="font-medium text-gray-800">{ot.plate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Prioridad</span>
                <span className="font-medium text-gray-800">{ot.prio}</span>
              </div>
              <div className="pt-2">
                <span className="text-gray-500">Título</span>
                <p className="mt-1 font-semibold text-gray-800">{ot.title}</p>
              </div>
            </div>
          </div>

          {/* Cambiar estado (tontito) */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800">Estado</h2>
            <p className="mt-1 text-sm text-gray-500">
              Pulsa <b>Cambiar estado</b> y elige.
            </p>

            <button
              className="mt-3 w-full rounded-2xl bg-gray-900 p-4 text-center text-sm font-semibold text-white active:scale-[0.99]"
              onClick={() => setIsMoveOpen((v) => !v)}
            >
              Cambiar estado
            </button>

            {isMoveOpen && (
              <div className="mt-3 rounded-xl bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-700">¿A dónde la mando?</p>

                <select
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none focus:border-blue-400"
                  value={ot.stage}
                  onChange={(e) => changeStage(e.target.value as Stage)}
                >
                  <option value="DIAGNOSTICO">Diagnóstico</option>
                  <option value="REPARACION">En reparación</option>
                  <option value="QC">Control calidad</option>
                  <option value="LISTO">Listo entrega</option>
                </select>

                <button
                  className="mt-2 w-full text-xs font-semibold text-gray-500"
                  onClick={() => setIsMoveOpen(false)}
                >
                  Cancelar
                </button>
              </div>
            )}

            <Link
              href="/taller"
              className="mt-3 block w-full rounded-2xl border border-gray-200 bg-white p-4 text-center text-sm font-semibold text-gray-800 active:scale-[0.99]"
            >
              Ver en el tablero (Taller)
            </Link>
          </div>

          {/* Fotos */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800">Fotos</h2>
            <p className="mt-1 text-sm text-gray-500">
              Pulsa <b>Añadir foto</b>. En móvil te dejará usar cámara o galería.
            </p>

            <label className="mt-3 block w-full cursor-pointer rounded-2xl bg-blue-600 p-4 text-center text-sm font-semibold text-white active:scale-[0.99]">
              Añadir foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  onPickPhoto(f);
                  // reset para poder subir la misma foto otra vez si hace falta
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <div className="mt-4">
              {photos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                  Aún no hay fotos 🙂
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {photos.map((p) => (
                    <div key={p.id} className="rounded-xl border border-gray-100 p-2">
                      <img
                        src={p.dataUrl}
                        alt="Foto OT"
                        className="h-36 w-full rounded-lg object-cover"
                      />
                      <button
                        className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 active:scale-[0.99]"
                        onClick={() => deletePhoto(p.id)}
                      >
                        Borrar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-3 text-xs text-gray-400">
              Nota: ahora se guardan en el móvil/PC (localStorage). Más adelante irán al servidor.
            </p>
          </div>

          {/* Tiempo (Start/Stop) */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800">Tiempo</h2>
            <p className="mt-1 text-sm text-gray-500">
              Pulsa <b>Empezar</b> cuando trabajes y <b>Parar</b> cuando termines.
            </p>

            <div className="mt-4 rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-600">Tiempo total</p>
              <p className="mt-1 text-3xl font-bold text-gray-900 tabular-nums">
                {formatHMS(currentSeconds())}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Estado: {timeData.running ? "⏱️ corriendo" : "✅ parado"}
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="w-full rounded-2xl bg-gray-900 px-4 py-4 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.99]"
                onClick={startTimer}
                disabled={timeData.running}
              >
                ▶️ Empezar
              </button>

              <button
                className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.99]"
                onClick={stopTimer}
                disabled={!timeData.running}
              >
                ⏸ Parar
              </button>
            </div>

            <p className="mt-3 text-xs text-gray-400">
              Última actualización: {timeData.updatedAt ? new Date(timeData.updatedAt).toLocaleString() : "—"}
            </p>
          </div>

          {/* Checklist de recepción */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800">Checklist de recepción</h2>
            <p className="mt-1 text-sm text-gray-500">
              Rellena lo básico al recibir el vehículo. (Se guarda solo)
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Kilómetros</label>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-base outline-none focus:border-blue-400"
                  placeholder="Ej: 245000"
                  value={checklist.km}
                  onChange={(e) => updateChecklist({ km: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Combustible</label>
                <select
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-base outline-none focus:border-blue-400"
                  value={checklist.fuel}
                  onChange={(e) => updateChecklist({ fuel: e.target.value as any })}
                >
                  <option value="Vacío">Vacío</option>
                  <option value="1/4">1/4</option>
                  <option value="1/2">1/2</option>
                  <option value="3/4">3/4</option>
                  <option value="Lleno">Lleno</option>
                </select>
              </div>

              <div className="rounded-xl bg-gray-50 p-3">
                <label className="flex items-center gap-3 text-sm font-medium text-gray-800">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={checklist.damages}
                    onChange={(e) => updateChecklist({ damages: e.target.checked })}
                  />
                  ¿Hay daños visibles?
                </label>

                {checklist.damages && (
                  <textarea
                    className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-3 text-base outline-none focus:border-blue-400"
                    placeholder="Describe daños (golpes, arañazos, etc.)"
                    value={checklist.damagesText}
                    onChange={(e) => updateChecklist({ damagesText: e.target.value })}
                    rows={3}
                  />
                )}
              </div>

              <div className="rounded-xl bg-gray-50 p-3 space-y-3">
                <p className="text-sm font-semibold text-gray-800">Se entrega con:</p>

                <label className="flex items-center gap-3 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={checklist.hasKeys}
                    onChange={(e) => updateChecklist({ hasKeys: e.target.checked })}
                  />
                  Llaves
                </label>

                <label className="flex items-center gap-3 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={checklist.hasDocs}
                    onChange={(e) => updateChecklist({ hasDocs: e.target.checked })}
                  />
                  Documentación
                </label>

                <label className="flex items-center gap-3 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={checklist.hasTachoCard}
                    onChange={(e) => updateChecklist({ hasTachoCard: e.target.checked })}
                  />
                  Tarjeta tacógrafo (si aplica)
                </label>
              </div>

              <div className="rounded-xl bg-gray-50 p-3">
                <label className="flex items-center gap-3 text-sm font-medium text-gray-800">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={checklist.tachoIssue}
                    onChange={(e) => updateChecklist({ tachoIssue: e.target.checked })}
                  />
                  ¿Entra con fallo de tacógrafo?
                </label>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Observaciones (opcional)</label>
                <textarea
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-3 text-base outline-none focus:border-blue-400"
                  placeholder="Ej: Trae aviso en pantalla, revisar cableado..."
                  value={checklist.extra}
                  onChange={(e) => updateChecklist({ extra: e.target.value })}
                  rows={3}
                />
              </div>

              <p className="text-xs text-gray-400">
                Última actualización: {checklist.updatedAt ? new Date(checklist.updatedAt).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          {/* Consumo de material */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800">Material</h2>
            <p className="mt-1 text-sm text-gray-500">
              Consumir material desde esta OT (baja stock y deja registro).
            </p>

            <div className="mt-3 space-y-3">
              <select
                className="w-full rounded-2xl border border-gray-200 bg-white p-4"
                value={consProd}
                onChange={(e) => setConsProd(e.target.value)}
              >
                <option value="">(Elige producto)</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.id} (stock {p.stock}{p.unit})
                  </option>
                ))}
              </select>

              <input
                className="w-full rounded-2xl border border-gray-200 bg-white p-4"
                value={consQty}
                onChange={(e) => setConsQty(e.target.value)}
                placeholder="Cantidad a consumir (ej: 2)"
              />

              <button
                className="w-full rounded-2xl bg-gray-900 p-4 text-sm font-semibold text-white active:scale-[0.99]"
                onClick={consumeMaterial}
              >
                Consumir material
              </button>

              <Link className="block text-center text-sm font-medium text-blue-600" href="/inventario">
                Ver inventario
              </Link>
            </div>
          </div>

          {/* Historial */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800">Historial</h2>
            <p className="mt-1 text-sm text-gray-500">
              Registro automático de lo que pasa en esta OT.
            </p>

            <div className="mt-4 space-y-3">
              {audit.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                  Aún no hay movimientos 🙂
                </div>
              ) : (
                audit.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-gray-100 p-3">
                    <p className="text-sm font-medium text-gray-800">{ev.message}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(ev.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-gray-800">Notas</h2>
            <p className="mt-1 text-sm text-gray-500">
              Escribe una nota corta y dale a <b>Guardar nota</b>.
            </p>

            <textarea
              className="mt-3 w-full rounded-xl border border-gray-200 bg-white p-3 text-base outline-none focus:border-blue-400"
              placeholder="Ej: Cliente comenta que falla desde ayer…"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
            />

            <button
              className="mt-3 w-full rounded-2xl bg-blue-600 p-4 text-center text-sm font-semibold text-white disabled:opacity-40 active:scale-[0.99]"
              disabled={!noteText.trim()}
              onClick={addNote}
            >
              Guardar nota
            </button>

            <div className="mt-4 space-y-3">
              {notes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                  Aún no hay notas 🙂
                </div>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="rounded-xl border border-gray-100 p-3">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.text}</p>
                    <p className="mt-2 text-xs text-gray-400">{formatDate(n.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      <MobileNav />
    </main>
  );
}
