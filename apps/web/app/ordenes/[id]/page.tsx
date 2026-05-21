'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import MobileNav from "../../components/MobileNav";
import RoleSelector from "../../components/RoleSelector";
import { useUndoAction } from "../../components/useUndoAction";
import { Role, useRole } from "../../components/useRole";
import { useSession } from "../../components/useSession";
import {
  canRoleMoveOt,
  statusBadgeClass,
  statusLabel,
} from "../../core/workflow";
import type { OtItem, OtStatus } from "../../core/workflow";
import {
  createWorkOrderNote,
  consumeWorkOrderMaterial,
  type WorkOrderAuditEvent as ApiWorkOrderAuditEvent,
  getWorkOrderAudit,
  getWorkOrderById,
  getWorkOrderChecklist,
  getWorkOrderNotes,
  getWorkOrderTime,
  findInventoryProductByBarcode,
  listInventoryProducts,
  startWorkOrderTime,
  stopWorkOrderTime,
  updateAppointment,
  updateWorkOrderStatus,
  upsertWorkOrderChecklist,
  type WorkOrderChecklist as ApiWorkOrderChecklist,
  type InventoryProduct,
  type WorkOrderNote as ApiWorkOrderNote,
  type WorkOrderTime as ApiWorkOrderTime,
} from "../../core/ordersApi";

type Photo = {
  id: string;
  dataUrl: string;
  createdAt: string;
  tag: "Recepción" | "Avería" | "Reparación" | "Entrega" | "Material";
  actorRole: Role | null;
  actorName: string | null;
  origin: "movil" | "web";
};

type Product = InventoryProduct;

type BudgetLine = {
  id: string;
  concept: string;
  qty: number;
  price: number;
};

type Budget = {
  status: "BORRADOR" | "ENVIADO" | "APROBADO" | "RECHAZADO";
  lines: BudgetLine[];
  updatedAt: string;
};

type AuditEvent = ApiWorkOrderAuditEvent;
type TimeData = ApiWorkOrderTime;
type Checklist = ApiWorkOrderChecklist;
type Note = ApiWorkOrderNote;

type TimelineItem = {
  id: string;
  source: "audit" | "note" | "session" | "photo";
  title: string;
  subtitle?: string;
  meta?: string;
  createdAt: string;
};

type Tab = "fotos" | "material" | "notas" | "entrada" | "historial" | "mas";

type Toast = { type: "success" | "error"; message: string } | null;

type ReasonModal = {
  label: string;
  onConfirm: (reason: string) => void;
} | null;

function onlyDigits(v: string): string {
  return (v || "").replace(/\D+/g, "");
}

const STORAGE_AUDIT = "taller_audit_v1";
const STORAGE_BUDGET = "taller_budget_v1";
const STORAGE_PRODUCTS = "taller_products_v1";
const STORAGE_PHOTOS = "taller_photos_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

async function compressImage(file: File, maxW = 1280, quality = 0.72): Promise<string> {
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
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No hay canvas 2D");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function formatDateShort(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function parseLocaleNumber(value: string): number {
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toDateTimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function describeSnapshot(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const parts = Object.entries(data as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function heroStripe(ot: OtItem) {
  if (ot.prio === "Urgente") return "#ef4444";
  if (ot.stage === "LISTO_ENTREGA" || ot.stage === "ENTREGADO" || ot.stage === "FACTURADO") return "#10b981";
  if (ot.stage === "REPARACION" || ot.stage === "QC") return "#3b82f6";
  if (ot.stage === "DIAGNOSTICO" || ot.stage === "PRESUPUESTO_ENVIADO" || ot.stage === "APROBADO") return "#f59e0b";
  return "#64748b";
}

export default function DetalleOT() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const { role } = useRole();
  const { activeUser } = useSession();
  const canEditBudget = role === "Administración" || role === "Oficina" || role === "Jefe de Taller";

  const [items, setItems] = useState<OtItem[]>([]);
  const [noteText, setNoteText] = useState("");
  const [notesMap, setNotesMap] = useState<Record<string, Note[]>>({});
  const [checklistMap, setChecklistMap] = useState<Record<string, Checklist>>({});
  const [timeMap, setTimeMap] = useState<Record<string, TimeData>>({});
  const [auditMap, setAuditMap] = useState<Record<string, AuditEvent[]>>({});
  const [budgetMap, setBudgetMap] = useState<Record<string, Budget>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [consProd, setConsProd] = useState("");
  const [consQty, setConsQty] = useState("1");
  const [materialScanOpen, setMaterialScanOpen] = useState(false);
  const [materialScanError, setMaterialScanError] = useState("");
  const [materialScanMessage, setMaterialScanMessage] = useState("");
  const [materialScanCode, setMaterialScanCode] = useState("");
  const [materialScanLocked, setMaterialScanLocked] = useState(false);
  const materialVideoRef = useRef<HTMLVideoElement | null>(null);
  const materialStreamRef = useRef<MediaStream | null>(null);
  const materialScanTimerRef = useRef<number | null>(null);
  const consQtyRef = useRef<HTMLInputElement | null>(null);
  const [, setNowTick] = useState(0);
  const [photosMap, setPhotosMap] = useState<Record<string, Photo[]>>({});
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [loadingOt, setLoadingOt] = useState(true);
  const [otError, setOtError] = useState("");
  const { pending, scheduleAction, undoAction } = useUndoAction();
  const [nowTs, setNowTs] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<Tab>("entrada");
  const [toast, setToast] = useState<Toast>(null);
  const [reasonModal, setReasonModal] = useState<ReasonModal>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [photoTag, setPhotoTag] = useState<Photo["tag"]>("Avería");
  const [photoTagModalFile, setPhotoTagModalFile] = useState<File | null>(null);
  const [editingAppointment, setEditingAppointment] = useState(false);
  const [editClientName, setEditClientName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPlate, setEditPlate] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editWorkType, setEditWorkType] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStartAt, setEditStartAt] = useState("");
  const [editEndAt, setEditEndAt] = useState("");

  function showToast(type: NonNullable<Toast>["type"], message: string) {
    setToast({ type: type ?? "success", message });
    setTimeout(() => setToast(null), 3500);
  }

  function askReason(label: string): Promise<string> {
    return new Promise((resolve) => {
      setReasonInput("");
      setReasonModal({
        label,
        onConfirm: (reason) => {
          setReasonModal(null);
          resolve(reason);
        },
      });
    });
  }

  async function loadOrderFromApi() {
    setOtError("");
    try {
      const order = await getWorkOrderById(id);
      setItems([order]);
    } catch (e) {
      setOtError(e instanceof Error ? e.message : "No pude abrir este trabajo.");
      setItems([]);
    } finally {
      setLoadingOt(false);
    }
  }

  async function loadAuditFromApi() {
    try {
      const apiAudit = await getWorkOrderAudit(id);
      setAuditMap((prev) => {
        const localOnly = (prev[id] ?? []).filter((event) => event.origin === "local");
        return { ...prev, [id]: [...localOnly, ...apiAudit] };
      });
    } catch { /* mantener local */ }
  }

  async function loadNotesFromApi() {
    try {
      const apiNotes = await getWorkOrderNotes(id);
      setNotesMap((prev) => ({ ...prev, [id]: apiNotes }));
    } catch { /* fallback */ }
  }

  async function loadChecklistFromApi() {
    try {
      const apiChecklist = await getWorkOrderChecklist(id);
      setChecklistMap((prev) => ({ ...prev, [id]: apiChecklist }));
    } catch { /* fallback */ }
  }

  async function loadTimeFromApi() {
    try {
      const apiTime = await getWorkOrderTime(id);
      setTimeMap((prev) => ({ ...prev, [id]: apiTime }));
    } catch { /* fallback */ }
  }

  async function loadProductsFromApi() {
    try {
      const rows = await listInventoryProducts();
      setProducts(rows);
      localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(rows));
    } catch {
      const loaded = safeParse<Product[]>(localStorage.getItem(STORAGE_PRODUCTS), []);
      setProducts(Array.isArray(loaded) ? loaded : []);
    }
  }

  useEffect(() => {
    const loadedAudit = safeParse<Record<string, AuditEvent[]>>(localStorage.getItem(STORAGE_AUDIT), {});
    const normalizedAudit = Object.fromEntries(
      Object.entries(loadedAudit).map(([wid, events]) => [
        wid,
        (events ?? []).map((event) => {
          const s = event as Partial<AuditEvent>;
          return { ...s, actorRole: s.actorRole ?? null, actorName: s.actorName ?? null, origin: s.origin ?? "local", reason: s.reason ?? null, beforeData: s.beforeData ?? null, afterData: s.afterData ?? null } as AuditEvent;
        }),
      ]),
    );
    setAuditMap(normalizedAudit);

    const loadedBudget = safeParse<Record<string, Budget>>(localStorage.getItem(STORAGE_BUDGET), {});
    setBudgetMap(loadedBudget);

    const loadedPhotos = safeParse<Record<string, Photo[]>>(localStorage.getItem(STORAGE_PHOTOS), {});
    const normalizedPhotos = Object.fromEntries(
      Object.entries(loadedPhotos).map(([wid, photoList]) => [
        wid,
        (photoList ?? []).map((photo) => {
          const s = photo as Partial<Photo>;
          return { ...s, tag: s.tag ?? "Avería", actorRole: s.actorRole ?? null, actorName: s.actorName ?? null, origin: s.origin ?? "web" } as Photo;
        }),
      ]),
    );
    setPhotosMap(normalizedPhotos);

    void loadOrderFromApi();
    void loadAuditFromApi();
    void loadNotesFromApi();
    void loadChecklistFromApi();
    void loadTimeFromApi();
    void loadProductsFromApi();
  }, [id]);

  useEffect(() => {
    const td = timeMap[id];
    if (!td?.running) return;
    const t = setInterval(() => setNowTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [id, timeMap]);

  useEffect(() => {
    if (pending.length === 0) return;
    const t = window.setInterval(() => setNowTs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [pending.length]);

  useEffect(() => {
    return () => { stopMaterialScan(); };
  }, []);

  const ot = useMemo(() => items.find((x) => x.id === id), [items, id]);
  const notes = notesMap[id] ?? [];
  const audit = auditMap[id] ?? [];
  const budget: Budget = budgetMap[id] ?? { status: "BORRADOR", lines: [], updatedAt: "" };
  const timeData = timeMap[id] ?? { totalSeconds: 0, running: false, startedAt: null, updatedAt: "", sessions: [] };
  const checklist = checklistMap[id] ?? { km: "", fuel: "1/2", damages: false, damagesText: "", hasKeys: true, hasDocs: true, hasTachoCard: false, tachoIssue: false, extra: "", updatedAt: "" };
  const photos = photosMap[id] ?? [];

  useEffect(() => {
    if (!ot) return;
    setEditClientName(ot.clientName ?? "");
    setEditPhone(ot.clientPhone ?? "");
    setEditEmail(ot.clientEmail ?? "");
    setEditPlate(ot.plate ?? "");
    setEditModel(ot.vehicleModel ?? "");
    setEditWorkType(ot.appointmentWorkType ?? ot.title ?? "");
    setEditNotes(ot.appointmentNotes ?? "");
    setEditStartAt(toDateTimeLocal(ot.appointmentStart));
    setEditEndAt(toDateTimeLocal(ot.appointmentEnd));
  }, [ot]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const auditItems: TimelineItem[] = audit
      .filter((e) => e.type !== "nota" && e.type !== "tiempo")
      .map((e) => ({
        id: `audit-${e.id}`,
        source: "audit" as const,
        title: e.message,
        subtitle: e.reason || describeSnapshot(e.afterData) || describeSnapshot(e.beforeData) || undefined,
        meta: [e.actorName, e.actorRole, e.origin].filter(Boolean).join(" · "),
        createdAt: e.createdAt,
      }));
    const noteItems: TimelineItem[] = notes.map((n) => ({
      id: `note-${n.id}`,
      source: "note" as const,
      title: "Nota añadida",
      subtitle: n.text,
      meta: [n.actorName, n.actorRole].filter(Boolean).join(" · "),
      createdAt: n.createdAt,
    }));
    const sessionItems: TimelineItem[] = (timeData.sessions ?? []).map((s) => ({
      id: `session-${s.id}`,
      source: "session" as const,
      title: `Sesión ${formatHMS(s.totalSeconds)}`,
      subtitle: `${formatDate(s.startedAt)}${s.endedAt ? ` → ${formatDate(s.endedAt)}` : " · En curso"}`,
      meta: [s.actorName, s.actorRole].filter(Boolean).join(" · "),
      createdAt: s.startedAt,
    }));
    const photoItems: TimelineItem[] = photos.map((p) => ({
      id: `photo-${p.id}`,
      source: "photo" as const,
      title: `Foto · ${p.tag}`,
      meta: [p.actorName, p.actorRole].filter(Boolean).join(" · "),
      createdAt: p.createdAt,
    }));
    return [...auditItems, ...noteItems, ...sessionItems, ...photoItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [audit, notes, photos, timeData.sessions]);

  function formatHMS(totalSeconds: number) {
    const s = Math.max(0, Math.floor(totalSeconds));
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((v) => String(v).padStart(2, "0")).join(":");
  }

  function currentSeconds(): number {
    if (!timeData.running || !timeData.startedAt) return timeData.totalSeconds;
    return timeData.totalSeconds + Math.max(0, Math.floor((Date.now() - new Date(timeData.startedAt).getTime()) / 1000));
  }

  function savePhotos(nextMap: Record<string, Photo[]>) {
    setPhotosMap(nextMap);
    try {
      localStorage.setItem(STORAGE_PHOTOS, JSON.stringify(nextMap));
    } catch {
      showToast("error", "No cabe más en el almacenamiento. Borra alguna foto antigua.");
    }
  }

  function stopMaterialScan() {
    if (materialScanTimerRef.current) { window.clearInterval(materialScanTimerRef.current); materialScanTimerRef.current = null; }
    if (materialStreamRef.current) { materialStreamRef.current.getTracks().forEach((t) => t.stop()); materialStreamRef.current = null; }
    setMaterialScanLocked(false);
  }

  function applyScannedMaterialSelection(product: Product) {
    setConsProd(product.id);
    setConsQty((current) => current && current !== "0" ? current : "1");
    setMaterialScanError("");
    setMaterialScanMessage(`Producto elegido: ${product.name}`);
    setMaterialScanOpen(false);
    stopMaterialScan();
    setActiveTab("material");
    setTimeout(() => { consQtyRef.current?.focus(); consQtyRef.current?.select(); }, 120);
  }

  function selectMaterialByBarcode(raw: string) {
    const code = onlyDigits(raw);
    if (!code) return;
    setMaterialScanCode(code);
    const local = products.find((p) => (p.barcode ?? "") === code);
    if (local) { applyScannedMaterialSelection(local); return; }
    void findInventoryProductByBarcode(code)
      .then((p) => { applyScannedMaterialSelection(p); })
      .catch(() => { setMaterialScanError(`No se encontró producto con código ${code}`); });
  }

  async function startMaterialScan() {
    setMaterialScanError(""); setMaterialScanMessage(""); setMaterialScanCode(""); setMaterialScanOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      materialStreamRef.current = stream;
      if (materialVideoRef.current) { materialVideoRef.current.srcObject = stream; await materialVideoRef.current.play(); }
    } catch (e) { setMaterialScanError(e instanceof Error ? e.message : "No pude abrir la cámara."); return; }
    if (!window.BarcodeDetector) { setMaterialScanError("Tu navegador no soporta escaneo nativo. Usa Chrome móvil o pega el código manualmente."); return; }
    const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"] });
    materialScanTimerRef.current = window.setInterval(async () => {
      if (!materialVideoRef.current || materialScanLocked) return;
      try {
        const found = await detector.detect(materialVideoRef.current);
        const raw = found.find((x) => x.rawValue)?.rawValue ?? "";
        if (!raw) return;
        setMaterialScanLocked(true);
        selectMaterialByBarcode(raw);
        stopMaterialScan();
      } catch { /* seguimos */ }
    }, 350);
  }

  async function consumeMaterial() {
    const pid = consProd;
    const qtyNum = parseInt(consQty || "0", 10);
    if (!pid) { showToast("error", "Elige un producto primero."); return; }
    if (!qtyNum || qtyNum <= 0) { showToast("error", "Cantidad inválida."); return; }
    const reason = await askReason("consumir material");
    if (!reason) { showToast("error", "Debes indicar el motivo del consumo."); return; }
    const selectedProduct = products.find((p) => p.id === pid);
    scheduleAction({
      label: `Consumir ${qtyNum} ud (${selectedProduct?.name ?? pid})`,
      run: async () => {
        try {
          const res = await consumeWorkOrderMaterial({ id, productId: pid, qty: qtyNum, actorRole: role as Role, actorName: activeUser?.name ?? "Usuario", reason, label: selectedProduct?.name ?? pid, origin: "web" });
          setProducts((prev) => prev.map((p) => (p.id === res.product.id ? res.product : p)));
          setConsQty("1");
          await loadAuditFromApi();
          showToast("success", "Material registrado.");
        } catch (e) { showToast("error", e instanceof Error ? e.message : "No pude guardar el material."); }
      },
    });
  }

  function saveBudget(nextMap: Record<string, Budget>) {
    setBudgetMap(nextMap);
    localStorage.setItem(STORAGE_BUDGET, JSON.stringify(nextMap));
  }

  function updateBudget(nextBudget: Budget) {
    saveBudget({ ...budgetMap, [id]: { ...nextBudget, updatedAt: new Date().toISOString() } });
  }

  function budgetTotal(b: Budget) {
    return (b.lines || []).reduce((acc, ln) => acc + (Number(ln.qty) || 0) * (Number(ln.price) || 0), 0);
  }

  function addBudgetLine() {
    if (!canEditBudget) { showToast("error", "No tienes permiso para modificar presupuestos."); return; }
    const ln: BudgetLine = { id: String(Date.now()), concept: "", qty: 1, price: 0 };
    updateBudget({ ...budget, lines: [ln, ...(budget.lines || [])] });
    pushAudit("presupuesto", "Línea de presupuesto añadida");
  }

  function updateLine(lineId: string, patch: Partial<BudgetLine>) {
    if (!canEditBudget) { showToast("error", "No tienes permiso para modificar presupuestos."); return; }
    const lines = (budget.lines || []).map((l) => (l.id === lineId ? { ...l, ...patch } : l));
    updateBudget({ ...budget, lines });
  }

  function deleteLine(lineId: string) {
    if (!canEditBudget) { showToast("error", "No tienes permiso para modificar presupuestos."); return; }
    updateBudget({ ...budget, lines: (budget.lines || []).filter((l) => l.id !== lineId) });
    pushAudit("presupuesto", "Línea de presupuesto eliminada");
  }

  function setBudgetStatus(status: Budget["status"]) {
    if (!canEditBudget) { showToast("error", "No tienes permiso para modificar presupuestos."); return; }
    updateBudget({ ...budget, status });
    const msg = status === "ENVIADO" ? "Presupuesto enviado" : status === "APROBADO" ? "Presupuesto aprobado" : status === "RECHAZADO" ? "Presupuesto rechazado" : "Presupuesto en borrador";
    pushAudit("presupuesto", msg);
  }

  function saveAudit(nextMap: Record<string, AuditEvent[]>) {
    setAuditMap(nextMap);
    localStorage.setItem(STORAGE_AUDIT, JSON.stringify(nextMap));
  }

  function pushAudit(type: AuditEvent["type"], message: string) {
    const ev: AuditEvent = { id: `local-${Date.now()}`, type, message, actorRole: role as Role, actorName: activeUser?.name ?? "Usuario", origin: "local", reason: null, beforeData: null, afterData: null, createdAt: new Date().toISOString() };
    saveAudit({ ...auditMap, [id]: [ev, ...(auditMap[id] ?? [])] });
  }

  async function startTimer() {
    if (timeData.running) return;
    try {
      const next = await startWorkOrderTime({ id, actorRole: role as Role, actorName: activeUser?.name ?? "Usuario", origin: "web" });
      setTimeMap((prev) => ({ ...prev, [id]: next }));
      await loadAuditFromApi();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "No pude empezar el tiempo."); }
  }

  async function stopTimer() {
    if (!timeData.running || !timeData.startedAt) return;
    try {
      const next = await stopWorkOrderTime({ id, actorRole: role as Role, actorName: activeUser?.name ?? "Usuario", origin: "web" });
      setTimeMap((prev) => ({ ...prev, [id]: next }));
      await loadAuditFromApi();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "No pude pausar el tiempo."); }
  }

  function updateChecklist(patch: Partial<Checklist>) {
    const next: Checklist = { ...checklist, ...patch, updatedAt: new Date().toISOString() };
    setChecklistMap((prev) => ({ ...prev, [id]: next }));
    void upsertWorkOrderChecklist({ id, checklist: next, actorRole: role as Role, actorName: activeUser?.name ?? "Usuario", origin: "web" })
      .then((saved) => { setChecklistMap((prev) => ({ ...prev, [id]: saved })); return loadAuditFromApi(); })
      .catch((e) => { console.error("Error guardando checklist", e); });
  }

  async function changeStage(nextStage: OtStatus) {
    if (!ot) return;
    const canStandard = canRoleMoveOt(role as Role, ot.stage, nextStage);
    const canForceByRole = role === "Administración" || role === "Oficina" || role === "Jefe de Taller";
    const canForce = canForceByRole;
    if (!canStandard && !canForce) {
      showToast("error", "No permitido por rol o por flujo.");
      return;
    }
    const reason = await askReason(`${canStandard ? "cambiar" : "corregir"} a "${statusLabel(nextStage)}"`);
    if (!reason) { showToast("error", "Debes indicar el motivo del cambio."); return; }
    const run = async () => {
      try {
        const updated = await updateWorkOrderStatus({
          id,
          toStatus: nextStage,
          actorRole: role as Role,
          actorName: activeUser?.name ?? "Usuario",
          reason,
          force: !canStandard,
          origin: "web",
        });
        setItems([updated]);
        await loadAuditFromApi();
        setIsMoveOpen(false);
        showToast("success", `Movido a "${statusLabel(nextStage)}"`);
      } catch (e) { showToast("error", e instanceof Error ? e.message : "No pude cambiar el estado."); }
    };
    if (nextStage === "CERRADO") {
      scheduleAction({ label: `Cerrar OT #${id}`, run });
      return;
    }
    await run();
  }

  async function saveAppointmentFromOt() {
    if (!ot?.appointmentId) {
      showToast("error", "Esta OT no tiene cita vinculada para editar.");
      return;
    }
    if (!editStartAt || !editEndAt || !editWorkType.trim()) {
      showToast("error", "Completa fecha inicio, fin y motivo.");
      return;
    }
    try {
      await updateAppointment({
        id: ot.appointmentId,
        client: { name: editClientName.trim() || undefined, phone: editPhone.trim() || undefined, email: editEmail.trim() || undefined },
        vehicle: { plate: editPlate.trim() || undefined, model: editModel.trim() || undefined },
        workType: editWorkType.trim(),
        notes: editNotes.trim() || undefined,
        startAt: new Date(editStartAt).toISOString(),
        endAt: new Date(editEndAt).toISOString(),
      });
      await loadOrderFromApi();
      setEditingAppointment(false);
      showToast("success", "Datos de cita/reparación actualizados.");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "No pude guardar cambios de cita.");
    }
  }

  async function onPickPhoto(file: File, tag: Photo["tag"]) {
    try {
      const dataUrl = await compressImage(file, 1280, 0.72);
      const approxBytes = Math.round((dataUrl.length * 3) / 4);
      if (approxBytes > 1_200_000) { showToast("error", "La foto es muy grande. Prueba otra con menos resolución."); return; }
      const newPhoto: Photo = { id: String(Date.now()), dataUrl, createdAt: new Date().toISOString(), tag, actorRole: role as Role, actorName: activeUser?.name ?? "Usuario", origin: "web" };
      const nextMap = { ...photosMap, [id]: [newPhoto, ...(photosMap[id] ?? [])] };
      savePhotos(nextMap);
      showToast("success", "Foto añadida.");
      setActiveTab("fotos");
    } catch { showToast("error", "No pude procesar esa foto. Prueba otra."); }
  }

  function deletePhoto(photoId: string) {
    savePhotos({ ...photosMap, [id]: (photosMap[id] ?? []).filter((p) => p.id !== photoId) });
  }

  async function addNote() {
    const text = noteText.trim();
    if (!text) return;
    try {
      const created = await createWorkOrderNote({ id, text, actorRole: role as Role, actorName: activeUser?.name ?? "Usuario", origin: "web" });
      setNotesMap((prev) => ({ ...prev, [id]: [created, ...(prev[id] ?? [])] }));
      setNoteText("");
      await loadAuditFromApi();
      showToast("success", "Nota guardada.");
    } catch (e) { showToast("error", e instanceof Error ? e.message : "No pude guardar la nota."); }
  }

  function printBudget() {
    window.print();
  }

  const allowedNextStages = ot
    ? (["PROGRAMADA", "PRE_ENTRADA", "RECEPCION", "DIAGNOSTICO", "PRESUPUESTO_ENVIADO", "APROBADO", "REPARACION", "QC", "LISTO_ENTREGA", "ENTREGADO", "FACTURADO", "CERRADO"] as OtStatus[])
      .filter((s) => s !== ot.stage && (canRoleMoveOt(role as Role, ot.stage, s) || role === "Administración" || role === "Oficina" || role === "Jefe de Taller"))
    : [];

  const TABS: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "entrada", label: "Entrada" },
    { key: "historial", label: "Historial", count: timeline.length > 0 ? timeline.length : undefined },
    { key: "mas", label: "Presupuesto" },
  ];

  return (
    <main className="min-h-screen app-bg mobile-nav-safe">

      {/* ── HERO ── */}
      {ot ? (
        <div
          className="relative overflow-hidden px-4 pb-6 pt-5 lg:pt-6"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(11,42,74,0.78) 0%, rgba(18,40,64,0.72) 55%, rgba(29,41,59,0.78) 100%), url('/banner-ordenes.webp')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Status color stripe top */}
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: heroStripe(ot) }} />

          {/* Destellos decorativos (solo ambiente) */}
          <div
            className="pointer-events-none absolute -top-16 right-0 h-64 w-64 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-8 left-0 h-48 w-48 rounded-full opacity-5"
            style={{ background: "radial-gradient(circle, #60a5fa 0%, transparent 70%)" }}
          />

          <div className="mx-auto w-full max-w-4xl">
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/ordenes"
                className="btn-tap inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-extrabold text-white/70 hover:text-white"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                </svg>
                Trabajos
              </Link>
              <span className="text-xs font-extrabold text-white/40">#{id}</span>
            </div>

            <p className="mt-4 text-4xl sm:text-5xl font-black tracking-tight text-white leading-none">{ot.clientName || ot.title}</p>
            <p className="mt-2 text-base font-semibold text-white/70 leading-snug">
              {ot.plate || "Sin matrícula"}{ot.vehicleModel ? ` · ${ot.vehicleModel}` : ""}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${statusBadgeClass(ot.stage)}`}>
                {statusLabel(ot.stage)}
              </span>
              {ot.prio === "Urgente" && (
                <span className="rounded-full bg-rose-500 px-3 py-1.5 text-xs font-black text-white">URGENTE</span>
              )}
              {ot.prio === "Alta" && (
                <span className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white">ALTA</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative overflow-hidden px-4 pb-6 pt-5 lg:pt-6"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(11,42,74,0.78) 0%, rgba(18,40,64,0.72) 55%, rgba(29,41,59,0.78) 100%), url('/banner-ordenes.webp')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div
            className="pointer-events-none absolute -top-16 right-0 h-64 w-64 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #f59e0b 0%, transparent 70%)" }}
          />
          <div className="mx-auto w-full max-w-4xl">
            <Link href="/ordenes" className="btn-tap inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-extrabold text-white/70">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
              Trabajos
            </Link>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-4xl px-4 pb-6">

        {/* ── UNDO BANNERS ── */}
        {pending.length > 0 && (
          <div className="mt-4 space-y-2">
            {pending.map((item) => {
              const seconds = Math.max(0, Math.ceil((item.executeAt - nowTs) / 1000));
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-extrabold text-amber-900">{item.label} — {seconds}s</p>
                  <button onClick={() => undoAction(item.id)} className="btn-tap rounded-xl bg-amber-500 px-3 py-2 text-xs font-extrabold text-white">
                    Deshacer
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {loadingOt ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-white border border-slate-200 p-10 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />
            <p className="text-sm font-semibold text-slate-500">Abriendo trabajo…</p>
          </div>
        ) : otError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-base font-extrabold text-red-700">No pude abrir este trabajo</p>
            <p className="mt-1 text-sm font-semibold text-red-600">{otError}</p>
            <button onClick={() => void loadOrderFromApi()} className="btn-tap mt-4 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-extrabold text-white">
              Reintentar
            </button>
          </div>
        ) : !ot ? (
          <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-8 text-center">
            <p className="text-base font-extrabold text-slate-900">Trabajo no encontrado</p>
            <Link href="/ordenes" className="btn-tap mt-4 inline-block rounded-2xl bg-slate-900 px-5 py-3 text-sm font-extrabold text-white">
              Volver a trabajos
            </Link>
          </div>
        ) : (
          <>
            <section className="mt-1 rounded-3xl border-2 border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Datos de cita</p>
                {ot.appointmentId ? (
                  <button
                    onClick={() => setEditingAppointment((v) => !v)}
                    className="btn-tap rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700"
                  >
                    {editingAppointment ? "Cancelar edición" : "Editar cita"}
                  </button>
                ) : null}
              </div>
              {editingAppointment ? (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" value={editClientName} onChange={(e) => setEditClientName(e.target.value)} placeholder="Cliente / empresa" />
                  <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Teléfono" />
                  <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="Email" />
                  <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" value={editPlate} onChange={(e) => setEditPlate(e.target.value.toUpperCase())} placeholder="Matrícula" />
                  <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold sm:col-span-2" value={editModel} onChange={(e) => setEditModel(e.target.value)} placeholder="Modelo vehículo" />
                  <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold sm:col-span-2" value={editWorkType} onChange={(e) => setEditWorkType(e.target.value)} placeholder="Motivo / trabajo" />
                  <input type="datetime-local" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" value={editStartAt} onChange={(e) => setEditStartAt(e.target.value)} />
                  <input type="datetime-local" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold" value={editEndAt} onChange={(e) => setEditEndAt(e.target.value)} />
                  <textarea className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold sm:col-span-2" rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notas" />
                  <button onClick={() => void saveAppointmentFromOt()} className="btn-tap rounded-xl bg-slate-900 px-4 py-2 text-sm font-extrabold text-white sm:col-span-2">
                    Guardar cambios de cita
                  </button>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <p className="text-sm font-semibold text-slate-700"><b>Fecha/hora:</b> {ot.appointmentStart ? formatDate(ot.appointmentStart) : "Sin cita asociada"}</p>
                  <p className="text-sm font-semibold text-slate-700"><b>Técnico:</b> {ot.technicianName || "Sin asignar"}</p>
                  <p className="text-sm font-semibold text-slate-700"><b>Cliente/Empresa:</b> {ot.clientName || "-"}</p>
                  <p className="text-sm font-semibold text-slate-700"><b>Teléfono:</b> {ot.clientPhone || "-"}</p>
                  <p className="text-sm font-semibold text-slate-700"><b>Email:</b> {ot.clientEmail || "-"}</p>
                  <p className="text-sm font-semibold text-slate-700"><b>Matrícula:</b> {ot.plate || "-"}</p>
                  <p className="text-sm font-semibold text-slate-700 sm:col-span-2"><b>Motivo:</b> {ot.appointmentWorkType || ot.title || "-"}</p>
                </div>
              )}
            </section>

            {/* ── CRONÓMETRO + EMPEZAR ── */}
            <section className="mt-4 rounded-3xl border-2 border-slate-200 bg-white p-5">
              {/* Timer display */}
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Tiempo en este trabajo</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className={`text-4xl font-black tabular-nums leading-none ${timeData.running ? "text-blue-600" : "text-slate-900"}`}>
                      {formatHMS(currentSeconds())}
                    </p>
                    {timeData.running && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-extrabold text-blue-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        EN CURSO
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className={`btn-tap shrink-0 flex items-center gap-2 rounded-2xl px-6 py-4 text-base font-extrabold text-white shadow-md transition-transform active:scale-95 ${
                    timeData.running
                      ? "bg-rose-500 shadow-rose-200"
                      : "shadow-emerald-200"
                  }`}
                  style={timeData.running ? {} : { background: "linear-gradient(135deg, #059669 0%, #10b981 100%)" }}
                  onClick={timeData.running ? stopTimer : startTimer}
                >
                  {timeData.running ? (
                    <>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                      Pausar
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      Empezar
                    </>
                  )}
                </button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                <div className="text-center">
                  <p className="text-2xl font-black text-slate-900">{photos.length}</p>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Fotos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-slate-900">{notes.length}</p>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Notas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-black text-slate-900">{(timeData.sessions ?? []).length}</p>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Sesiones</p>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <button
                  className={`btn-tap inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold text-white ${isMoveOpen ? "bg-slate-900" : "bg-slate-700"}`}
                  onClick={() => setIsMoveOpen((v) => !v)}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  Mover estado
                </button>
              </div>
            </section>

            {/* ── MOVER ESTADO — inline buttons ── */}
            {isMoveOpen && (
              <section className="mt-2 rounded-2xl border-2 border-slate-200 bg-white p-4">
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mb-3">Mover trabajo a:</p>
                {allowedNextStages.length === 0 ? (
                  <p className="text-sm font-semibold text-slate-500">No hay movimientos disponibles con tu rol.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allowedNextStages.map((s) => (
                      <button
                        key={s}
                        onClick={() => void changeStage(s)}
                        className="btn-tap rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-extrabold text-slate-800 hover:border-slate-400 hover:bg-white active:scale-95 transition-all"
                      >
                        {statusLabel(s)} →
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── TABS ── */}
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`btn-tap shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-extrabold transition-colors ${
                    activeTab === tab.key
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${
                      activeTab === tab.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── TAB: FOTOS ── */}
            {activeTab === "fotos" && (
              <section className="mt-3 rounded-3xl border-2 border-slate-200 bg-white p-4">
                {photos.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100">
                      <svg className="h-6 w-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>
                      </svg>
                    </div>
                    <p className="text-sm font-extrabold text-slate-900">Sin fotos todavía</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">Usa el botón Foto de arriba para añadir.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {photos.map((p) => (
                      <div key={p.id} className="group relative overflow-hidden rounded-2xl border border-slate-200">
                        <img src={p.dataUrl} alt="Foto OT" className="h-36 w-full object-cover" />
                        <div className="p-2">
                          <p className="text-xs font-extrabold text-slate-800">{p.tag}</p>
                          <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{formatDateShort(p.createdAt)}</p>
                        </div>
                        <button
                          onClick={() => deletePhoto(p.id)}
                          className="absolute right-2 top-2 rounded-full bg-slate-900/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[11px] font-semibold text-slate-400 text-center">Las fotos se guardan en este dispositivo.</p>
              </section>
            )}

            {/* ── TAB: MATERIAL ── */}
            {activeTab === "material" && (
              <section className="mt-3 rounded-3xl border-2 border-slate-200 bg-white p-4 space-y-3">
                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Registrar pieza o consumible</p>

                <select
                  className="w-full rounded-2xl border-2 border-slate-200 bg-white p-4 text-base font-semibold outline-none focus:border-amber-400"
                  value={consProd}
                  onChange={(e) => setConsProd(e.target.value)}
                >
                  <option value="">Elige una pieza…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — stock {p.stock}{p.unit}</option>
                  ))}
                </select>

                {consProd && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-sm font-extrabold text-emerald-800">
                      {products.find((p) => p.id === consProd)?.name ?? consProd}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    ref={consQtyRef}
                    className="w-24 shrink-0 rounded-2xl border-2 border-slate-200 bg-white p-4 text-base font-extrabold text-center outline-none focus:border-amber-400"
                    value={consQty}
                    onChange={(e) => setConsQty(e.target.value)}
                    inputMode="numeric"
                    placeholder="Ud."
                  />
                  <button
                    className="btn-tap flex-1 rounded-2xl bg-amber-500 p-4 text-base font-extrabold text-white shadow-sm active:scale-95 transition-transform"
                    onClick={consumeMaterial}
                  >
                    Guardar material
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="btn-tap flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-sm font-extrabold text-slate-700"
                    onClick={() => void startMaterialScan()}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" d="M4 6h.01M4 12h.01M4 18h.01M8 6h12M8 12h12M8 18h12"/>
                    </svg>
                    Escanear
                  </button>
                  <Link href="/inventario" className="btn-tap flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-sm font-extrabold text-slate-700">
                    Ver inventario
                  </Link>
                </div>
              </section>
            )}

            {/* ── TAB: NOTAS ── */}
            {activeTab === "notas" && (
              <section className="mt-3 rounded-3xl border-2 border-slate-200 bg-white p-4 space-y-3">
                <textarea
                  className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-base font-semibold outline-none focus:border-sky-400 focus:bg-white transition-colors"
                  placeholder="Escribe una nota sobre este trabajo…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                />
                <button
                  className="btn-tap w-full rounded-2xl bg-sky-500 p-4 text-base font-extrabold text-white shadow-sm disabled:opacity-40 active:scale-95 transition-transform"
                  disabled={!noteText.trim()}
                  onClick={addNote}
                >
                  Añadir nota
                </button>

                {notes.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center">
                    <p className="text-sm font-extrabold text-slate-500">Sin notas todavía</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {notes.map((n) => (
                      <div key={n.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="whitespace-pre-wrap text-sm font-semibold text-slate-800">{n.text}</p>
                        <p className="mt-2 text-[11px] font-semibold text-slate-400">
                          {[n.actorName, n.actorRole, formatDateShort(n.createdAt)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── TAB: ENTRADA DEL VEHÍCULO ── */}
            {activeTab === "entrada" && (
              <section className="mt-3 rounded-3xl border-2 border-slate-200 bg-white p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Kilómetros</label>
                    <input
                      className="mt-1.5 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-base font-semibold outline-none focus:border-blue-400 focus:bg-white"
                      placeholder="245000"
                      value={checklist.km}
                      onChange={(e) => updateChecklist({ km: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Combustible</label>
                    <select
                      className="mt-1.5 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-base font-semibold outline-none focus:border-blue-400 focus:bg-white"
                      value={checklist.fuel}
                      onChange={(e) => updateChecklist({ fuel: e.target.value as Checklist["fuel"] })}
                    >
                      <option value="Vacío">Vacío</option>
                      <option value="1/4">1/4</option>
                      <option value="1/2">1/2</option>
                      <option value="3/4">3/4</option>
                      <option value="Lleno">Lleno</option>
                    </select>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 space-y-3">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Objetos y documentos</p>
                  {[
                    { key: "hasKeys" as const, label: "Llaves" },
                    { key: "hasDocs" as const, label: "Documentación" },
                    { key: "hasTachoCard" as const, label: "Tarjeta tacógrafo" },
                    { key: "tachoIssue" as const, label: "Fallo de tacógrafo" },
                    { key: "damages" as const, label: "Daños visibles" },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 text-sm font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded"
                        checked={Boolean(checklist[key])}
                        onChange={(e) => updateChecklist({ [key]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                {checklist.damages && (
                  <div>
                    <label className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Descripción de daños</label>
                    <textarea
                      className="mt-1.5 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-base font-semibold outline-none focus:border-blue-400 focus:bg-white"
                      placeholder="Golpes, arañazos, etc."
                      value={checklist.damagesText}
                      onChange={(e) => updateChecklist({ damagesText: e.target.value })}
                      rows={3}
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-extrabold uppercase tracking-widest text-slate-500">Observaciones</label>
                  <textarea
                    className="mt-1.5 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-base font-semibold outline-none focus:border-blue-400 focus:bg-white"
                    placeholder="Ej: Trae aviso en pantalla, revisar cableado…"
                    value={checklist.extra}
                    onChange={(e) => updateChecklist({ extra: e.target.value })}
                    rows={3}
                  />
                </div>

                {checklist.updatedAt && (
                  <p className="text-[11px] font-semibold text-slate-400">
                    Actualizado: {formatDateShort(checklist.updatedAt)}
                  </p>
                )}
              </section>
            )}

            {/* ── TAB: HISTORIAL ── */}
            {activeTab === "historial" && (
              <section className="mt-3 rounded-3xl border-2 border-slate-200 bg-white p-4">
                {timeline.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
                    <p className="text-sm font-extrabold text-slate-500">Sin movimientos todavía</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {timeline.map((item, idx) => (
                      <div key={item.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-white text-xs font-extrabold ${
                            item.source === "note" ? "bg-sky-500" :
                            item.source === "session" ? "bg-emerald-500" :
                            item.source === "photo" ? "bg-violet-500" :
                            "bg-slate-600"
                          }`}>
                            {item.source === "note" ? "N" : item.source === "session" ? "T" : item.source === "photo" ? "F" : "A"}
                          </div>
                          {idx < timeline.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
                        </div>
                        <div className="min-w-0 flex-1 pb-4">
                          <p className="text-sm font-extrabold text-slate-900 leading-tight">{item.title}</p>
                          {item.subtitle && <p className="mt-0.5 text-sm font-semibold text-slate-600 leading-snug">{item.subtitle}</p>}
                          <p className="mt-1 text-[11px] font-semibold text-slate-400">
                            {[item.meta, formatDateShort(item.createdAt)].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ── TAB: MÁS ── */}
            {activeTab === "mas" && (
              <section className="mt-3 space-y-3">
                <div className="rounded-3xl border-2 border-slate-200 bg-white p-4">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mb-3">Presupuesto</p>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <p className="text-2xl font-black text-slate-900">{budgetTotal(budget).toFixed(2)} EUR</p>
                      <p className="text-xs font-semibold text-slate-500">Estado: {budget.status}</p>
                    </div>
                    {canEditBudget && (
                      <select
                        className="rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-extrabold text-slate-800"
                        value={budget.status}
                        onChange={(e) => setBudgetStatus(e.target.value as Budget["status"])}
                      >
                        <option value="BORRADOR">Borrador</option>
                        <option value="ENVIADO">Enviado</option>
                        <option value="APROBADO">Aprobado</option>
                        <option value="RECHAZADO">Rechazado</option>
                      </select>
                    )}
                  </div>
                  {canEditBudget && (
                    <button onClick={addBudgetLine} className="btn-tap w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-3 text-sm font-extrabold text-slate-800">
                      + Añadir línea
                    </button>
                  )}
                  {budget.lines.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {budget.lines.map((line) => (
                        <div key={line.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="grid grid-cols-[1fr_64px_80px] gap-2">
                            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" value={line.concept} onChange={(e) => updateLine(line.id, { concept: e.target.value })} disabled={!canEditBudget} placeholder="Concepto" />
                            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-center" value={String(line.qty)} onChange={(e) => updateLine(line.id, { qty: parseLocaleNumber(e.target.value) })} inputMode="decimal" disabled={!canEditBudget} />
                            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-right" value={String(line.price)} onChange={(e) => updateLine(line.id, { price: parseLocaleNumber(e.target.value) })} inputMode="decimal" disabled={!canEditBudget} />
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <p className="text-sm font-extrabold text-slate-700">{((line.qty || 0) * (line.price || 0)).toFixed(2)} EUR</p>
                            {canEditBudget && (
                              <button onClick={() => deleteLine(line.id)} className="btn-tap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-600">Borrar</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-3xl border-2 border-slate-200 bg-white p-4">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mb-3">Rol activo</p>
                  <RoleSelector />
                </div>
                <button
                  onClick={printBudget}
                  className="btn-tap w-full rounded-2xl border-2 border-slate-300 bg-white p-3 text-sm font-extrabold text-slate-800"
                >
                  Imprimir presupuesto
                </button>
                <article className="print-budget-a4 hidden print:block">
                  <header className="print-budget-head">
                    <h1>Talleres MALU</h1>
                    <p>Presupuesto de reparación</p>
                  </header>
                  <section className="print-budget-meta">
                    <p><b>OT:</b> #{ot.id}</p>
                    <p><b>Fecha:</b> {new Date().toLocaleDateString("es-ES")}</p>
                    <p><b>Cliente/Empresa:</b> {ot.clientName || "-"}</p>
                    <p><b>Teléfono:</b> {ot.clientPhone || "-"}</p>
                    <p><b>Email:</b> {ot.clientEmail || "-"}</p>
                    <p><b>Matrícula:</b> {ot.plate || "-"}</p>
                    <p><b>Vehículo:</b> {ot.vehicleModel || "-"}</p>
                    <p><b>Motivo:</b> {ot.appointmentWorkType || ot.title || "-"}</p>
                  </section>
                  <table className="print-budget-table">
                    <thead>
                      <tr><th>Concepto</th><th>Cantidad</th><th>Precio</th><th>Importe</th></tr>
                    </thead>
                    <tbody>
                      {budget.lines.map((line) => (
                        <tr key={`p-${line.id}`}>
                          <td>{line.concept || "-"}</td>
                          <td>{line.qty}</td>
                          <td>{line.price.toFixed(2)} EUR</td>
                          <td>{(line.qty * line.price).toFixed(2)} EUR</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(() => {
                    const subtotal = budgetTotal(budget);
                    const iva = subtotal * 0.21;
                    const total = subtotal + iva;
                    return (
                      <section className="print-budget-totals">
                        <p><b>Subtotal:</b> {subtotal.toFixed(2)} EUR</p>
                        <p><b>IVA (21%):</b> {iva.toFixed(2)} EUR</p>
                        <p><b>Total:</b> {total.toFixed(2)} EUR</p>
                      </section>
                    );
                  })()}
                  <footer className="print-budget-sign">
                    <div><p>Firma taller</p><div /></div>
                    <div><p>Firma cliente (aceptación)</p><div /></div>
                  </footer>
                </article>
              </section>
            )}
          </>
        )}
      </div>

      <style jsx global>{`
        @media print {
          .mobile-nav-safe > * { display: none !important; }
          .print-budget-a4 { display: block !important; margin: 0; color: #0f172a; font-family: Arial, sans-serif; }
          .print-budget-head { border-bottom: 2px solid #0b2a4a; padding-bottom: 10px; margin-bottom: 14px; }
          .print-budget-head h1 { margin: 0; font-size: 28px; color: #0b2a4a; }
          .print-budget-head p { margin: 2px 0 0; font-size: 13px; color: #475569; }
          .print-budget-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin-bottom: 14px; font-size: 12px; }
          .print-budget-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .print-budget-table th, .print-budget-table td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
          .print-budget-totals { margin-top: 14px; text-align: right; font-size: 12px; }
          .print-budget-totals p { margin: 3px 0; }
          .print-budget-sign { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
          .print-budget-sign p { font-size: 12px; margin: 0 0 30px; }
          .print-budget-sign div > div { border-top: 1px solid #334155; height: 1px; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      {/* ── MODAL: MOTIVO ── */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-base font-extrabold text-slate-900">Motivo requerido</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">¿Por qué vas a {reasonModal.label}?</p>
            <textarea
              className="mt-4 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-base font-semibold outline-none focus:border-blue-400 focus:bg-white"
              placeholder="Escribe el motivo…"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="mt-4 flex gap-3">
              <button
                className="btn-tap flex-1 rounded-2xl border-2 border-slate-200 bg-slate-50 py-3.5 text-sm font-extrabold text-slate-700"
                onClick={() => { setReasonModal(null); reasonModal.onConfirm(""); }}
              >
                Cancelar
              </button>
              <button
                className="btn-tap flex-1 rounded-2xl bg-slate-900 py-3.5 text-sm font-extrabold text-white disabled:opacity-40"
                disabled={!reasonInput.trim()}
                onClick={() => reasonModal.onConfirm(reasonInput.trim())}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ETIQUETA FOTO ── */}
      {photoTagModalFile && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-base font-extrabold text-slate-900">Etiqueta de la foto</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["Recepción", "Avería", "Reparación", "Entrega", "Material"] as Photo["tag"][]).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setPhotoTag(tag)}
                  className={`btn-tap rounded-2xl border-2 py-3 text-sm font-extrabold transition-colors ${
                    photoTag === tag
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <button
                className="btn-tap flex-1 rounded-2xl border-2 border-slate-200 bg-slate-50 py-3.5 text-sm font-extrabold text-slate-700"
                onClick={() => setPhotoTagModalFile(null)}
              >
                Cancelar
              </button>
              <button
                className="btn-tap flex-1 rounded-2xl bg-violet-600 py-3.5 text-sm font-extrabold text-white"
                onClick={() => {
                  const f = photoTagModalFile;
                  setPhotoTagModalFile(null);
                  void onPickPhoto(f, photoTag);
                }}
              >
                Añadir foto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ESCANEAR MATERIAL ── */}
      {materialScanOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/85 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-extrabold text-slate-900">Escanear pieza</p>
              <button
                onClick={() => { stopMaterialScan(); setMaterialScanOpen(false); }}
                className="btn-tap rounded-full border-2 border-slate-200 p-2 text-slate-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <video ref={materialVideoRef} className="h-52 w-full rounded-2xl bg-slate-900 object-cover" playsInline muted />
            {materialScanError && <p className="mt-2 text-sm font-semibold text-red-600">{materialScanError}</p>}
            {materialScanMessage && <p className="mt-2 text-sm font-semibold text-emerald-600">{materialScanMessage}</p>}
            <div className="mt-3 flex gap-2">
              <input
                className="flex-1 rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
                placeholder="Código manual…"
                value={materialScanCode}
                onChange={(e) => setMaterialScanCode(onlyDigits(e.target.value))}
              />
              <button
                onClick={() => selectMaterialByBarcode(materialScanCode)}
                className="btn-tap rounded-2xl bg-slate-900 px-4 py-3 text-sm font-extrabold text-white"
              >
                Buscar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-2xl px-5 py-3 shadow-2xl text-sm font-extrabold text-white transition-all ${
          toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"
        }`}>
          {toast.message}
        </div>
      )}

      <MobileNav />
    </main>
  );
}
