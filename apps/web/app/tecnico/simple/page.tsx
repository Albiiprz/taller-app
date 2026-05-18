'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MobileNav from "../../components/MobileNav";
import { Icon } from "../../components/ui/Icon";
import { useSession, type Role } from "../../components/useSession";
import {
  createWorkOrderNote,
  getWorkOrderTime,
  listWorkOrders,
  startWorkOrderTime,
  stopWorkOrderTime,
  updateWorkOrderStatus,
  type WorkOrderTime,
} from "../../core/ordersApi";
import { createHelpRequest, listOpenHelpRequests, resolveHelpRequestsByOrder } from "../../core/helpRequests";
import {
  canRoleMoveOt,
  filterOrdersForRoleDay,
  getAllowedNextStatuses,
  statusBadgeClass,
  statusLabel,
  type OtItem,
  type OtStatus,
} from "../../core/workflow";
import { trackUxEvent } from "../../core/uxMetrics";

type QueuedActionInput =
  | {
      type: "START_TIMER";
      orderId: string;
      actorRole: Role;
      actorName: string;
    }
  | {
      type: "STOP_TIMER";
      orderId: string;
      actorRole: Role;
      actorName: string;
    }
  | {
      type: "FINISH_TASK";
      orderId: string;
      toStatus: OtStatus;
      actorRole: Role;
      actorName: string;
    }
  | {
      type: "HELP";
      orderId: string;
      actorRole: Role;
      actorName: string;
      message: string;
    };

type QueuedAction = QueuedActionInput & {
  id: string;
};

type QuickChecklist = {
  safeChecked: boolean;
  photoChecked: boolean;
  materialChecked: boolean;
  updatedAt: string;
};

type StoredPhoto = {
  id: string;
  dataUrl: string;
  createdAt: string;
};

const STORAGE_QUEUE = "tech_simple_action_queue_v1";
const STORAGE_ONBOARDING = "tech_simple_onboarding_done_v1";
const STORAGE_QUICK_CHECKS = "tech_simple_quick_checks_v1";
const STORAGE_PHOTOS = "taller_photos_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readQueue(): QueuedAction[] {
  if (typeof window === "undefined") return [];
  const rows = safeParse<QueuedAction[]>(localStorage.getItem(STORAGE_QUEUE), []);
  return Array.isArray(rows) ? rows : [];
}

function writeQueue(rows: QueuedAction[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_QUEUE, JSON.stringify(rows.slice(0, 300)));
}

function enqueueAction(action: QueuedActionInput): number {
  const rows = readQueue();
  rows.push({
    ...action,
    id: `q_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
  } as QueuedAction);
  writeQueue(rows);
  return rows.length;
}

function defaultQuickChecklist(): QuickChecklist {
  return {
    safeChecked: false,
    photoChecked: false,
    materialChecked: false,
    updatedAt: "",
  };
}

function readQuickCheckMap(): Record<string, QuickChecklist> {
  if (typeof window === "undefined") return {};
  return safeParse<Record<string, QuickChecklist>>(localStorage.getItem(STORAGE_QUICK_CHECKS), {});
}

function writeQuickCheckMap(rows: Record<string, QuickChecklist>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_QUICK_CHECKS, JSON.stringify(rows));
}

function todayYmd() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function nextOperationalStatus(current: OtStatus): OtStatus | null {
  const next = getAllowedNextStatuses(current).find((s) => s !== current);
  return next ?? null;
}

function formatSecondsAsHm(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${hh}:${mm}h`;
}

function timeToHm(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function delayLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const mins = Math.floor((Date.now() - target) / 60000);
  if (mins <= 0) return `Hora objetivo ${timeToHm(iso)} · faltan ${Math.abs(mins)} min`;
  return `Hora objetivo ${timeToHm(iso)} · vas +${mins} min`;
}

function isOfflineError(err: unknown): boolean {
  return err instanceof Error && /No se pudo conectar con la API/i.test(err.message);
}

function playActionSound(strong = false) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = strong ? 1047 : 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch {
    // Audio no disponible.
  }
}

async function compressImage(file: File, maxW = 1280, quality = 0.72): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const node = new Image();
    node.onload = () => resolve(node);
    node.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    node.src = dataUrl;
  });

  const scale = Math.min(1, maxW / img.width);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No hay canvas");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function savePhotoToOrder(orderId: string, dataUrl: string) {
  const current = safeParse<Record<string, StoredPhoto[]>>(localStorage.getItem(STORAGE_PHOTOS), {});
  const nextPhoto: StoredPhoto = {
    id: String(Date.now()),
    dataUrl,
    createdAt: new Date().toISOString(),
  };
  const next: Record<string, StoredPhoto[]> = {
    ...current,
    [orderId]: [nextPhoto, ...(current[orderId] ?? [])],
  };
  localStorage.setItem(STORAGE_PHOTOS, JSON.stringify(next));
}

export default function TecnicoSimplePage() {
  const { activeUser, hasRole } = useSession();
  const canUse =
    hasRole("Técnico") || hasRole("Jefe de Taller") || hasRole("Administración");
  const activeRole = (activeUser?.roles?.[0] ?? "Técnico") as Role;
  const actorName = activeUser?.name ?? "Usuario";

  const [orders, setOrders] = useState<OtItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [timeById, setTimeById] = useState<Record<string, WorkOrderTime>>({});
  const [quickChecksByOrder, setQuickChecksByOrder] = useState<Record<string, QuickChecklist>>({});
  const [busy, setBusy] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [queueSize, setQueueSize] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [cameraBusy, setCameraBusy] = useState(false);
  const [startAt] = useState(Date.now());

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const tapLockRef = useRef<Record<string, number>>({});
  const syncingQueueRef = useRef(false);
  const selectedOrderIdRef = useRef("");

  selectedOrderIdRef.current = selectedOrderId;

  const visibleOrders = useMemo(() => {
    const base = filterOrdersForRoleDay(orders, activeRole, todayYmd())
      .filter((x) => x.stage !== "CERRADO" && x.stage !== "FACTURADO");
    if (!activeUser?.id) return base;
    return base.filter((x) => !x.assignedToUserId || x.assignedToUserId === activeUser.id);
  }, [orders, activeRole, activeUser?.id]);

  const visibleOrdersKey = useMemo(() => visibleOrders.map((x) => x.id).join("|"), [visibleOrders]);

  const selectedOrder = useMemo(
    () => visibleOrders.find((x) => x.id === selectedOrderId) ?? visibleOrders[0] ?? null,
    [visibleOrders, selectedOrderId],
  );

  const selectedQuickChecks = selectedOrder
    ? (quickChecksByOrder[selectedOrder.id] ?? defaultQuickChecklist())
    : defaultQuickChecklist();
  const checklistDoneCount = Number(selectedQuickChecks.safeChecked) + Number(selectedQuickChecks.photoChecked) + Number(selectedQuickChecks.materialChecked);
  const checklistReady = checklistDoneCount === 3;

  const onboardingCards = [
    {
      title: "1/3 · Empezar",
      text: "Elige tu OT de hoy y pulsa el botón grande para empezar.",
    },
    {
      title: "2/3 · Registrar",
      text: "Añade foto y revisa material con un toque para dejar trazabilidad.",
    },
    {
      title: "3/3 · Cerrar",
      text: "Marca las 3 comprobaciones y termina. Si te atascas, pide ayuda.",
    },
  ];

  function getLiveSeconds(time?: WorkOrderTime): number {
    if (!time) return 0;
    if (!time.running || !time.startedAt) return time.totalSeconds;
    const start = new Date(time.startedAt).getTime();
    if (Number.isNaN(start)) return time.totalSeconds;
    const extra = Math.max(0, Math.floor((nowTick - start) / 1000));
    return time.totalSeconds + extra;
  }

  const selectedTime = selectedOrder ? timeById[selectedOrder.id] : undefined;
  const selectedSeconds = getLiveSeconds(selectedTime);
  const dynamicAction: "start" | "pause" | "resume" = selectedTime?.running
    ? "pause"
    : selectedSeconds > 0
      ? "resume"
      : "start";

  const kpiClosedToday = useMemo(() => {
    return visibleOrders.filter((x) =>
      x.stage === "LISTO_ENTREGA" ||
      x.stage === "ENTREGADO" ||
      x.stage === "FACTURADO" ||
      x.stage === "CERRADO",
    ).length;
  }, [visibleOrders]);

  const kpiActiveSeconds = useMemo(() => {
    return visibleOrders.reduce((acc, ot) => acc + getLiveSeconds(timeById[ot.id]), 0);
  }, [visibleOrders, timeById, nowTick]);

  function setFeedback(strong = false) {
    if ("vibrate" in navigator) {
      navigator.vibrate(strong ? [100, 50, 100] : 45);
    }
    playActionSound(strong);
  }

  function isDoubleTapBlocked(key: string): boolean {
    const now = Date.now();
    const prev = tapLockRef.current[key] ?? 0;
    if (now - prev < 900) return true;
    tapLockRef.current[key] = now;
    return false;
  }

  function updateQuickChecks(orderId: string, patch: Partial<QuickChecklist>) {
    const current = quickChecksByOrder[orderId] ?? defaultQuickChecklist();
    const nextForOrder: QuickChecklist = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const next = { ...quickChecksByOrder, [orderId]: nextForOrder };
    setQuickChecksByOrder(next);
    writeQuickCheckMap(next);
  }

  async function loadOrders() {
    setError("");
    try {
      const rows = await listWorkOrders();
      setOrders(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar órdenes");
    } finally {
      setLoading(false);
    }
  }

  async function refreshOrderTime(otId: string) {
    try {
      const t = await getWorkOrderTime(otId);
      setTimeById((prev) => ({ ...prev, [otId]: t }));
    } catch {
      // Ignoramos si falla para no cortar la pantalla.
    }
  }

  async function executeQueuedAction(action: QueuedAction) {
    if (action.type === "START_TIMER") {
      await startWorkOrderTime({
        id: action.orderId,
        actorRole: action.actorRole,
        actorName: action.actorName,
      });
      await refreshOrderTime(action.orderId);
      return;
    }
    if (action.type === "STOP_TIMER") {
      await stopWorkOrderTime({
        id: action.orderId,
        actorRole: action.actorRole,
        actorName: action.actorName,
      });
      await refreshOrderTime(action.orderId);
      return;
    }
    if (action.type === "FINISH_TASK") {
      const updated = await updateWorkOrderStatus({
        id: action.orderId,
        toStatus: action.toStatus,
        actorRole: action.actorRole,
        actorName: action.actorName,
        reason: `Finalización rápida desde técnico a ${statusLabel(action.toStatus)}`,
        origin: "web",
      });
      setOrders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      resolveHelpRequestsByOrder(action.orderId);
      return;
    }
    await createWorkOrderNote({
      id: action.orderId,
      text: action.message,
      actorRole: action.actorRole,
      actorName: action.actorName,
    });
  }

  async function flushQueue(silent = false) {
    if (syncingQueueRef.current || !navigator.onLine) return;
    const pending = readQueue();
    setQueueSize(pending.length);
    if (pending.length === 0) return;

    syncingQueueRef.current = true;
    let processed = 0;
    const remaining = [...pending];

    while (remaining.length > 0) {
      try {
        await executeQueuedAction(remaining[0]);
        remaining.shift();
        processed += 1;
      } catch {
        break;
      }
    }

    writeQueue(remaining);
    setQueueSize(remaining.length);
    syncingQueueRef.current = false;

    if (processed > 0) {
      await loadOrders();
      if (!silent) {
        setOkMsg(`Sincronizado: ${processed} acción(es) pendientes.`);
      }
    }
  }

  function optimisticStart(orderId: string) {
    setTimeById((prev) => {
      const current = prev[orderId] ?? {
        totalSeconds: 0,
        running: false,
        startedAt: null,
        updatedAt: "",
      };
      return {
        ...prev,
        [orderId]: {
          ...current,
          running: true,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  function optimisticStop(orderId: string) {
    setTimeById((prev) => {
      const current = prev[orderId] ?? {
        totalSeconds: 0,
        running: false,
        startedAt: null,
        updatedAt: "",
      };
      if (!current.running || !current.startedAt) {
        return {
          ...prev,
          [orderId]: {
            ...current,
            running: false,
            startedAt: null,
            updatedAt: new Date().toISOString(),
          },
        };
      }
      const extra = Math.max(0, Math.floor((Date.now() - new Date(current.startedAt).getTime()) / 1000));
      return {
        ...prev,
        [orderId]: {
          ...current,
          totalSeconds: current.totalSeconds + extra,
          running: false,
          startedAt: null,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }

  async function runOrQueue(args: {
    actionKey: string;
      queuedAction: QueuedActionInput;
    successMsg: string;
    queuedMsg: string;
    run: () => Promise<void>;
    onQueued?: () => void;
  }) {
    if (busy || isDoubleTapBlocked(args.actionKey)) return;

    setBusy(true);
    setError("");
    setOkMsg("");
    setFeedback(false);

    const queueNow = () => {
      const nextSize = enqueueAction(args.queuedAction);
      setQueueSize(nextSize);
      args.onQueued?.();
      setOkMsg(args.queuedMsg);
    };

    if (!navigator.onLine) {
      queueNow();
      setBusy(false);
      return;
    }

    try {
      await args.run();
      setOkMsg(args.successMsg);
      setFeedback(true);
    } catch (e) {
      if (isOfflineError(e)) {
        queueNow();
      } else {
        setError(e instanceof Error ? e.message : "No pude hacer esa acción.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleMainAction() {
    if (!selectedOrder) return;
    const orderId = selectedOrder.id;

    if (dynamicAction === "pause") {
      await runOrQueue({
        actionKey: `pause_${orderId}`,
        queuedAction: {
          type: "STOP_TIMER",
          orderId,
          actorRole: activeRole,
          actorName,
        },
        successMsg: "Tiempo pausado.",
        queuedMsg: "Sin red: pausa guardada en cola.",
        run: async () => {
          await stopWorkOrderTime({
            id: orderId,
            actorRole: activeRole,
            actorName,
          });
          await refreshOrderTime(orderId);
        },
        onQueued: () => optimisticStop(orderId),
      });
      return;
    }

    await runOrQueue({
      actionKey: `${dynamicAction}_${orderId}`,
      queuedAction: {
        type: "START_TIMER",
        orderId,
        actorRole: activeRole,
        actorName,
      },
      successMsg: dynamicAction === "resume" ? "Tiempo reanudado." : "Tarea iniciada.",
      queuedMsg: dynamicAction === "resume" ? "Sin red: reanudación en cola." : "Sin red: inicio en cola.",
      run: async () => {
        await startWorkOrderTime({
          id: orderId,
          actorRole: activeRole,
          actorName,
        });
        await refreshOrderTime(orderId);
        trackUxEvent({
          name: dynamicAction === "resume" ? "tech_resume_task" : "tech_start_task",
          role: activeRole,
          ok: true,
          durationMs: Date.now() - startAt,
        });
      },
      onQueued: () => optimisticStart(orderId),
    });
  }

  async function finishTask() {
    if (!selectedOrder) return;

    if (
      !selectedQuickChecks.safeChecked ||
      !selectedQuickChecks.photoChecked ||
      !selectedQuickChecks.materialChecked
    ) {
      setError("Antes de terminar, marca vehículo, foto y material.");
      return;
    }

    const next = nextOperationalStatus(selectedOrder.stage);
    if (!next) {
      setError("No hay siguiente estado para finalizar.");
      return;
    }
    if (!canRoleMoveOt(activeRole, selectedOrder.stage, next)) {
      setError("Tu rol no puede finalizar esta tarea desde este estado.");
      return;
    }

    await runOrQueue({
      actionKey: `finish_${selectedOrder.id}`,
      queuedAction: {
        type: "FINISH_TASK",
        orderId: selectedOrder.id,
        toStatus: next,
        actorRole: activeRole,
        actorName,
      },
      successMsg: `Tarea finalizada. Estado: ${statusLabel(next)}.`,
      queuedMsg: "Sin red: finalización guardada en cola.",
      run: async () => {
        const updated = await updateWorkOrderStatus({
          id: selectedOrder.id,
          toStatus: next,
          actorRole: activeRole,
          actorName,
          reason: `Finalización rápida desde técnico a ${statusLabel(next)}`,
          origin: "web",
        });
        setOrders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        resolveHelpRequestsByOrder(selectedOrder.id);
      },
      onQueued: () => {
        setOrders((prev) => prev.map((x) => (x.id === selectedOrder.id ? { ...x, stage: next } : x)));
      },
    });
  }

  async function addQuickPhoto(file: File) {
    if (!selectedOrder || busy || cameraBusy) return;
    setCameraBusy(true);
    setError("");
    setOkMsg("");
    try {
      const compressed = await compressImage(file);
      savePhotoToOrder(selectedOrder.id, compressed);
      updateQuickChecks(selectedOrder.id, { photoChecked: true });
      setOkMsg("Foto añadida a la OT.");
      setFeedback(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude guardar la foto.");
    } finally {
      setCameraBusy(false);
    }
  }

  async function requestHelp() {
    if (!selectedOrder) return;

    const alreadyOpen = listOpenHelpRequests().some(
      (x) => x.workOrderId === selectedOrder.id && x.status === "OPEN",
    );
    if (alreadyOpen) {
      setOkMsg("Ya hay una petición de ayuda abierta para esta OT.");
      return;
    }

    const helpText = `AYUDA: ${actorName} solicita apoyo en OT #${selectedOrder.id} (${selectedOrder.plate}).`;
    createHelpRequest({
      workOrderId: selectedOrder.id,
      plate: selectedOrder.plate,
      technicianName: actorName,
      message: helpText,
    });

    await runOrQueue({
      actionKey: `help_${selectedOrder.id}`,
      queuedAction: {
        type: "HELP",
        orderId: selectedOrder.id,
        actorRole: activeRole,
        actorName,
        message: helpText,
      },
      successMsg: "Ayuda solicitada a Jefe/Oficina.",
      queuedMsg: "Sin red: ayuda registrada y pendiente de enviar.",
      run: async () => {
        await createWorkOrderNote({
          id: selectedOrder.id,
          text: helpText,
          actorRole: activeRole,
          actorName,
        });
      },
    });
  }

  useEffect(() => {
    if (!canUse) return;
    setQueueSize(readQueue().length);
    setQuickChecksByOrder(readQuickCheckMap());
    setNetworkOnline(navigator.onLine);
    const alreadyDone = localStorage.getItem(STORAGE_ONBOARDING) === "1";
    setShowOnboarding(!alreadyDone);
    void loadOrders();
    void flushQueue(true);
  }, [canUse]);

  useEffect(() => {
    const onOnline = () => {
      setNetworkOnline(true);
      void flushQueue();
    };
    const onOffline = () => setNetworkOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (visibleOrders.length === 0) {
      setSelectedOrderId("");
      return;
    }

    let cancelled = false;
    async function preloadTimes() {
      const rows = await Promise.all(
        visibleOrders.map(async (ot) => {
          try {
            const t = await getWorkOrderTime(ot.id);
            return [ot.id, t] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;

      const map: Record<string, WorkOrderTime> = {};
      rows.forEach((row) => {
        if (!row) return;
        map[row[0]] = row[1];
      });
      setTimeById((prev) => ({ ...prev, ...map }));

      const runningOrder = visibleOrders.find((ot) => map[ot.id]?.running);
      const currentSelected = selectedOrderIdRef.current;
      if (runningOrder && (!currentSelected || !map[currentSelected]?.running)) {
        setSelectedOrderId(runningOrder.id);
        return;
      }
      if (!currentSelected || !visibleOrders.some((x) => x.id === currentSelected)) {
        setSelectedOrderId(visibleOrders[0].id);
      }
    }

    void preloadTimes();
    return () => {
      cancelled = true;
    };
  }, [visibleOrdersKey]);

  useEffect(() => {
    const hasRunning = Object.values(timeById).some((x) => x.running);
    if (!hasRunning) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [timeById]);

  return (
    <main className="min-h-screen app-bg module-tech px-4 mobile-nav-safe pt-4">
      <section className="mobile-shell module-hero module-tech p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="module-kicker">Modo técnico</p>
            <h1 className="module-title mt-1 inline-flex items-center gap-2">
              <Icon name="play" className="h-6 w-6" />
              Mi trabajo ahora
            </h1>
          </div>
          <Link href="/ordenes" className="module-map-chip inline-flex min-h-0 items-center justify-center">
            Órdenes
          </Link>
        </div>
        <p className="module-copy mt-2 text-sm">
          Solo cuatro pasos: empezar, pausar, foto y cerrar.
        </p>
      </section>

      {!networkOnline && (
        <section className="mobile-shell surface-status mt-3 p-3 text-sm font-bold text-slate-700">
          Sin red: puedes seguir. Lo que hagas se enviará cuando vuelva internet.
        </section>
      )}

      {queueSize > 0 && (
        <section className="mobile-shell surface-status mt-3 p-3 text-sm font-bold text-slate-700">
          Pendiente de enviar: {queueSize} acción(es).
        </section>
      )}

      {!canUse ? (
        <section className="mobile-shell error-state mt-4">
          Esta pantalla no es para tu usuario.
        </section>
      ) : (
        <section className="mobile-shell mt-4 space-y-4">
          {loading ? (
            <div className="surface-content p-4 text-sm font-semibold text-slate-600">Buscando tus trabajos de hoy...</div>
          ) : visibleOrders.length === 0 ? (
            <div className="surface-content p-4">
              <div className="empty-state">Hoy no tienes nada pendiente.</div>
            </div>
          ) : (
            <>
              {selectedOrder && (
                <div className="surface-status p-4">
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">Ahora mismo</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900">{selectedOrder.plate}</p>
                  <p className="mt-1 text-base font-semibold text-slate-700">{selectedOrder.title}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-extrabold ${statusBadgeClass(selectedOrder.stage)}`}>
                      {statusLabel(selectedOrder.stage)}
                    </span>
                    {delayLabel(selectedOrder.scheduledEnd) && (
                      <span className="inline-flex rounded-full bg-slate-900 px-3 py-1.5 text-xs font-extrabold text-white">
                        {delayLabel(selectedOrder.scheduledEnd)}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="kpi-card">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Tiempo activo</p>
                      <p className="mt-1 text-xl font-extrabold text-slate-900">{formatSecondsAsHm(selectedSeconds)}</p>
                    </div>
                    <div className="kpi-card">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Cerradas hoy</p>
                      <p className="mt-1 text-xl font-extrabold text-slate-900">{kpiClosedToday}</p>
                    </div>
                  </div>
                </div>
              )}

              {visibleOrders.length > 1 && (
                <details className="surface-content p-3">
                  <summary className="cursor-pointer list-none text-sm font-extrabold text-slate-800">
                    Cambiar trabajo ({visibleOrders.length} hoy)
                  </summary>
                  <select
                    value={selectedOrder?.id ?? ""}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="mt-3 w-full rounded-xl border-2 border-slate-200 p-4 text-sm font-extrabold text-slate-900"
                  >
                    {visibleOrders.map((ot) => (
                      <option key={ot.id} value={ot.id}>
                        OT #{ot.id} · {ot.plate} · {statusLabel(ot.stage)}
                      </option>
                    ))}
                  </select>
                </details>
              )}

              {selectedOrder && !selectedQuickChecks.materialChecked && (
                <div className="surface-status border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-extrabold text-amber-900">Te falta revisar material</p>
                  <Link
                    href={`/ordenes/${selectedOrder.id}#material`}
                    data-tap
                    className="btn-tap cta-secondary mt-2 bg-amber-600 px-4 py-3 text-sm text-white"
                  >
                    Abrir material
                  </Link>
                </div>
              )}

              <div className="surface-action p-4">
                <button
                  onClick={() => void handleMainAction()}
                  disabled={!selectedOrder || busy}
                  className={
                    "btn-tap primary-cta cta-primary w-full px-4 disabled:opacity-40 " +
                    (dynamicAction === "pause" ? "bg-amber-600 shadow-[0_8px_20px_rgba(180,83,9,0.28)]" : "bg-slate-900 shadow-[0_10px_22px_rgba(15,23,42,0.28)]")
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon name={dynamicAction === "pause" ? "orders" : "play"} className="h-5 w-5" />
                    {dynamicAction === "pause"
                      ? "Pausar"
                      : dynamicAction === "resume"
                        ? "Reanudar"
                        : "Empezar"}
                  </span>
                </button>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={!selectedOrder || busy || cameraBusy}
                    className="btn-tap cta-secondary w-full text-base disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon name="new" className="h-4 w-4" />
                      Añadir foto
                    </span>
                  </button>

                  <Link
                    href={selectedOrder ? `/ordenes/${selectedOrder.id}#material` : "/ordenes"}
                    className="btn-tap cta-secondary flex items-center justify-center text-base"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon name="inventory" className="h-4 w-4" />
                      Material
                    </span>
                  </Link>

                  <button
                    onClick={() => void requestHelp()}
                    disabled={!selectedOrder || busy}
                    className="btn-tap cta-danger w-full text-base disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon name="alert" className="h-4 w-4" />
                      Pedir ayuda
                    </span>
                  </button>
                </div>

                <button
                  onClick={() => void finishTask()}
                  disabled={!selectedOrder || busy}
                  className="btn-tap mt-3 cta-secondary min-h-14 w-full rounded-2xl border-emerald-300 bg-emerald-50 px-4 py-4 text-base text-emerald-800 shadow-none disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon name="new" className="h-4 w-4" />
                    Finalizar
                  </span>
                </button>
              </div>

              <details className="surface-content p-3" open={!checklistReady}>
                <summary className="cursor-pointer list-none text-sm font-extrabold text-slate-800">
                  Antes de terminar ({checklistDoneCount}/3)
                </summary>
                <div className="mt-2 space-y-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={selectedQuickChecks.safeChecked}
                      onChange={(e) => selectedOrder && updateQuickChecks(selectedOrder.id, { safeChecked: e.target.checked })}
                    />
                    Vehículo revisado
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={selectedQuickChecks.photoChecked}
                      onChange={(e) => selectedOrder && updateQuickChecks(selectedOrder.id, { photoChecked: e.target.checked })}
                    />
                    Foto hecha
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={selectedQuickChecks.materialChecked}
                      onChange={(e) => selectedOrder && updateQuickChecks(selectedOrder.id, { materialChecked: e.target.checked })}
                    />
                    Material revisado
                  </label>
                </div>
              </details>
            </>
          )}

          {error && (
            <p className="error-state">
              {error}
            </p>
          )}
          {okMsg && (
            <p className="info-state border-emerald-200 bg-emerald-50 text-emerald-700">
              {okMsg}
            </p>
          )}
        </section>
      )}

      {showOnboarding && (
        <div className="fixed inset-0 z-[70] bg-slate-900/70 p-4">
          <div className="mx-auto mt-20 w-full max-w-md rounded-2xl border-2 border-slate-200 bg-white p-4">
            <p className="text-xs font-extrabold text-blue-700">Guía rápida (30 segundos)</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">{onboardingCards[onboardingStep].title}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-700">{onboardingCards[onboardingStep].text}</p>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                onClick={() => setOnboardingStep((s) => Math.max(0, s - 1))}
                disabled={onboardingStep === 0}
                className="min-h-12 rounded-xl border-2 border-slate-300 px-4 py-2 text-sm font-extrabold text-slate-700 disabled:opacity-40"
              >
                Atrás
              </button>

              {onboardingStep < onboardingCards.length - 1 ? (
                <button
                  onClick={() => setOnboardingStep((s) => Math.min(onboardingCards.length - 1, s + 1))}
                  className="min-h-12 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white"
                >
                  Siguiente
                </button>
              ) : (
                <button
                  onClick={() => {
                    localStorage.setItem(STORAGE_ONBOARDING, "1");
                    setShowOnboarding(false);
                  }}
                  className="min-h-12 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-extrabold text-white"
                >
                  Empezar a trabajar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void addQuickPhoto(file);
          }
          e.currentTarget.value = "";
        }}
      />

      <MobileNav />
    </main>
  );
}
