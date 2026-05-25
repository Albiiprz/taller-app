'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MobileNav from "../../components/MobileNav";
import InfoHint from "../../components/ui/InfoHint";
import { Icon } from "../../components/ui/Icon";
import { useSession } from "../../components/useSession";
import {
  createAppointment,
  createAppointmentDraft,
  getTechnicianAvailabilityRange,
  getTechniciansAvailabilityByDate,
  searchClients,
  type AvailabilityTechnicianDay,
  type ClientSummary,
} from "../../core/ordersApi";
import { semaphoreBadgeClass, semaphorePlainLabel } from "../../core/semaphore";
import { trackUxEvent } from "../../core/uxMetrics";
type QuickHistoryItem = { name: string; phone: string; plate: string; email?: string; company?: string };
type Step = 1 | 2 | 3 | 4 | 5;
const QUICK_HISTORY_KEY = "taller_quick_clients_v1";

function todayLocalYmd(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function statusClass(status: "GREEN" | "YELLOW" | "RED") {
  return semaphoreBadgeClass(status);
}

function StepPill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`rounded-2xl border-2 px-3 py-2 text-center text-xs font-extrabold ${active ? "border-blue-700 bg-blue-700 text-white" : done ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"}`}>
      {label}
    </div>
  );
}

function slotLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function NuevaCitaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasRole, activeUser } = useSession();
  const canCreate = hasRole("Administración") || hasRole("Oficina");
  const activeRole = activeUser?.roles?.[0] ?? "Oficina";

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(() => searchParams.get("nombre") ?? "");
  const [phone, setPhone] = useState(() => searchParams.get("telefono") ?? "");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [plate, setPlate] = useState(() => searchParams.get("matricula") ?? "");
  const [vin, setVin] = useState("");
  const [model, setModel] = useState("");
  const [workType, setWorkType] = useState(() => searchParams.get("trabajo") ?? "Revisión tacógrafo");
  const [notes, setNotes] = useState(() => searchParams.get("notas") ?? "");
  const [duration, setDuration] = useState(60);
  const [date, setDate] = useState(() => searchParams.get("fecha") ?? todayLocalYmd());
  const [technicians, setTechnicians] = useState<AvailabilityTechnicianDay[]>([]);
  const [selectedTechId, setSelectedTechId] = useState("");
  const [dayStatus, setDayStatus] = useState<"GREEN" | "YELLOW" | "RED">("RED");
  const [morningSlots, setMorningSlots] = useState<Array<{ startAt: string; endAt: string }>>([]);
  const [afternoonSlots, setAfternoonSlots] = useState<Array<{ startAt: string; endAt: string }>>([]);
  const [selectedSlot, setSelectedSlot] = useState<{ startAt: string; endAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [lastWhatsappUrl, setLastWhatsappUrl] = useState("");
  const [formStartedAt] = useState(Date.now());
  const [quickHistory, setQuickHistory] = useState<QuickHistoryItem[]>([]);
  const [clientSuggestions, setClientSuggestions] = useState<ClientSummary[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [plateScanOpen, setPlateScanOpen] = useState(false);
  const [plateScanError, setPlateScanError] = useState("");
  const [plateScanMessage, setPlateScanMessage] = useState("");
  const plateVideoRef = useRef<HTMLVideoElement | null>(null);
  const plateStreamRef = useRef<MediaStream | null>(null);
  const plateScanTimerRef = useRef<number | null>(null);

  const hasClient = name.trim().length > 1 && phone.trim().length > 5;
  const canDraft = canCreate && Boolean(name.trim() || phone.trim() || plate.trim() || workType.trim() || notes.trim());
  const canSave = canCreate && hasClient && !!selectedTechId && !!selectedSlot && workType.trim().length > 2;

  useEffect(() => {
    const raw = localStorage.getItem(QUICK_HISTORY_KEY);
    if (!raw) return;
    try {
      const rows = JSON.parse(raw) as QuickHistoryItem[];
      if (Array.isArray(rows)) setQuickHistory(rows);
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    return () => {
      stopPlateScan();
    };
  }, []);

  useEffect(() => {
    if (!name.trim()) return;
    const match = quickHistory.find((row) => row.name.toLowerCase() === name.trim().toLowerCase());
    if (!match) return;
    if (!phone.trim() && match.phone) setPhone(match.phone);
    if (!email.trim() && match.email) setEmail(match.email);
    if (!company.trim() && match.company) setCompany(match.company);
    if (!plate.trim() && match.plate) setPlate(match.plate);
  }, [name, quickHistory, phone, email, company, plate]);

  function handleNameChange(val: string) {
    setName(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (val.trim().length < 2) { setClientSuggestions([]); setShowSuggestions(false); return; }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchClients(val);
        setClientSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch { /* silencioso */ }
    }, 300);
  }

  function applyClientSuggestion(c: ClientSummary) {
    setName(c.name);
    if (c.phone) setPhone(c.phone);
    if (c.email) setEmail(c.email);
    if (c.company) setCompany(c.company);
    if (c.plates[0]) setPlate(c.plates[0]);
    if (c.models[0]) setModel(c.models[0]);
    setShowSuggestions(false);
    setClientSuggestions([]);
  }

  async function loadAvailability() {
    setError("");
    setLoading(true);
    setSelectedSlot(null);
    setMorningSlots([]);
    setAfternoonSlots([]);
    try {
      const rows = await getTechniciansAvailabilityByDate({
        date,
        durationMinutes: duration,
      });
      setTechnicians(rows);
      if (!selectedTechId && rows[0]) setSelectedTechId(rows[0].technicianId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude mirar los huecos libres.");
      setTechnicians([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAvailability();
  }, [date, duration]);

  useEffect(() => {
    async function loadTechDay() {
      if (!selectedTechId) return;
      try {
        const days = await getTechnicianAvailabilityRange({
          technicianId: selectedTechId,
          from: date,
          to: date,
          durationMinutes: duration,
        });
        const day = days[0];
      if (!day) return;
      setDayStatus(day.status);
      setMorningSlots(day.morningSlots);
      setAfternoonSlots(day.afternoonSlots);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude cargar las horas libres de ese día.");
      setDayStatus("RED");
      setMorningSlots([]);
      setAfternoonSlots([]);
      }
    }
    void loadTechDay();
  }, [selectedTechId, date, duration]);

  async function saveAppointment() {
    if (!canSave || !selectedSlot) return;
    setSaving(true);
    setError("");
    setOkMsg("");
    setLastWhatsappUrl("");
    try {
      const res = await createAppointment({
        client: {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          company: company.trim() || undefined,
        },
        vehicle: {
          plate: plate.trim() || undefined,
          vin: vin.trim() || undefined,
          model: model.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        technicianId: selectedTechId,
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
        durationMinutes: duration,
        workType: workType.trim(),
        notes: notes.trim() || undefined,
      });
      setOkMsg(
        res.whatsappAutoSent
          ? `Cita guardada. Trabajo #${res.workOrder.id} creado y WhatsApp enviado.`
          : `Cita guardada. Trabajo #${res.workOrder.id} creado.`,
      );
      trackUxEvent({
        name: "appointment_create",
        role: activeRole,
        ok: true,
        durationMs: Date.now() - formStartedAt,
      });
      if (res.googleCalendar?.enabled && !res.googleCalendar.synced) {
        setError(`La cita está guardada, pero no se pudo pasar a Google Calendar: ${res.googleCalendar.error ?? "motivo desconocido"}`);
      }
      if (!res.whatsappAutoSent && res.whatsappUrl) {
        setLastWhatsappUrl(res.whatsappUrl);
        window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
      }
      saveQuickHistory({ name, phone, plate, email, company });
      setStep(5);
      await loadAvailability();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude guardar la cita.");
      trackUxEvent({ name: "appointment_create", role: activeRole, ok: false });
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (!canDraft) return;
    setSaving(true);
    setError("");
    setOkMsg("");
    try {
      const res = await createAppointmentDraft({
        client: {
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          company: company.trim() || undefined,
        },
        vehicle: {
          plate: plate.trim() || undefined,
          vin: vin.trim() || undefined,
          model: model.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        workType: workType.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      saveQuickHistory({ name, phone, plate, email, company });
      setOkMsg(`Borrador guardado. Cita #${res.appointment.id}.`);
      router.push(`/citas/${res.appointment.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude guardar el borrador.");
    } finally {
      setSaving(false);
    }
  }

  function saveQuickHistory(item: QuickHistoryItem) {
    const normalized: QuickHistoryItem = {
      name: item.name.trim(),
      phone: item.phone.trim(),
      plate: item.plate.trim().toUpperCase(),
      email: item.email?.trim() || "",
      company: item.company?.trim() || "",
    };
    if (!normalized.name || !normalized.phone) return;
    const base = quickHistory.filter((x) => x.phone !== normalized.phone && x.name.toLowerCase() !== normalized.name.toLowerCase());
    const next = [normalized, ...base].slice(0, 60);
    setQuickHistory(next);
    localStorage.setItem(QUICK_HISTORY_KEY, JSON.stringify(next));
  }

  function stopPlateScan() {
    if (plateScanTimerRef.current) {
      window.clearInterval(plateScanTimerRef.current);
      plateScanTimerRef.current = null;
    }
    if (plateStreamRef.current) {
      plateStreamRef.current.getTracks().forEach((track) => track.stop());
      plateStreamRef.current = null;
    }
  }

  function applyScannedPlate(raw: string) {
    const plateRaw = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (!plateRaw) return;
    setPlate(plateRaw);
    setPlateScanMessage(`Matrícula detectada: ${plateRaw}`);
    stopPlateScan();
    setPlateScanOpen(false);
  }

  async function startPlateScan() {
    setPlateScanError("");
    setPlateScanMessage("");
    setPlateScanOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      plateStreamRef.current = stream;
      if (plateVideoRef.current) {
        plateVideoRef.current.srcObject = stream;
        await plateVideoRef.current.play();
      }
    } catch (e) {
      setPlateScanError(e instanceof Error ? e.message : "No pude abrir la cámara.");
      return;
    }

    if (!window.BarcodeDetector) {
      setPlateScanError("Este navegador no deja escanear. Escribe la matrícula o prueba Chrome móvil.");
      return;
    }

    const detector = new window.BarcodeDetector({ formats: ["code_39", "code_128", "ean_13", "ean_8"] });

    plateScanTimerRef.current = window.setInterval(async () => {
      if (!plateVideoRef.current) return;
      try {
        const found = await detector.detect(plateVideoRef.current);
        const raw = found.find((x) => x.rawValue)?.rawValue ?? "";
        if (!raw) return;
        applyScannedPlate(raw);
      } catch {
        // keep scanning
      }
    }, 350);
  }

  const techMap = useMemo(() => {
    const map = new Map<string, AvailabilityTechnicianDay>();
    technicians.forEach((t) => map.set(t.technicianId, t));
    return map;
  }, [technicians]);

  function goNext() {
    setError("");
    if (step === 1 && !hasClient) {
      setError("Falta el nombre o el teléfono.");
      return;
    }
    if (step === 3 && (!selectedTechId || workType.trim().length < 3)) {
      setError("Elige quién lo hará y qué trabajo es.");
      return;
    }
    if (step === 4 && !selectedSlot) {
      setError("Elige una hora libre.");
      return;
    }
    setStep((prev) => Math.min(5, prev + 1) as Step);
  }

  function goBack() {
    setError("");
    setStep((prev) => Math.max(1, prev - 1) as Step);
  }

  const stepDone = {
    1: hasClient,
    2: Boolean(plate || model || vin || notes),
    3: Boolean(selectedTechId && workType.trim().length > 2),
    4: Boolean(selectedSlot),
    5: Boolean(okMsg),
  } as const;

  return (
    <main className="min-h-screen app-bg module-office px-4 mobile-nav-safe pt-4">
      {!canCreate ? (
        <section className="mx-auto mt-4 w-full max-w-5xl rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          No tienes permiso para crear citas.
        </section>
      ) : (
        <>
          <section className="mx-auto mt-4 flex w-full max-w-5xl items-center gap-2">
            <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
              <StepPill active={step === 1} done={stepDone[1]} label="1 Cliente" />
              <StepPill active={step === 2} done={stepDone[2]} label="2 Vehículo" />
              <StepPill active={step === 3} done={stepDone[3]} label="3 Técnico" />
              <StepPill active={step === 4} done={stepDone[4]} label="4 Hueco" />
              <StepPill active={step === 5} done={stepDone[5]} label="5 Confirmar" />
            </div>
            <button
              type="button"
              onClick={() => router.push("/calendario")}
              title="Cancelar y cerrar"
              className="ml-2 flex-shrink-0 rounded-2xl border-2 border-slate-200 bg-white p-2 text-slate-500 hover:border-red-300 hover:text-red-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </section>

          <section className="surface-content mx-auto mt-4 w-full max-w-5xl p-4">
            {step === 1 && (
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Paso 1. Cliente</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">Con el nombre y el teléfono ya puedes seguir.</p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="relative sm:col-span-2">
                    <input
                      className="w-full rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold"
                      placeholder="Nombre y apellidos*"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                      autoComplete="off"
                    />
                    {showSuggestions && clientSuggestions.length > 0 && (
                      <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-2xl border-2 border-slate-200 bg-white shadow-xl">
                        {clientSuggestions.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="w-full px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
                              onMouseDown={() => applyClientSuggestion(c)}
                            >
                              <p className="text-sm font-extrabold text-slate-900">{c.name}{c.company ? ` — ${c.company}` : ""}</p>
                              <p className="text-xs font-semibold text-slate-500">
                                {[c.phone, c.plates.join(", ")].filter(Boolean).join(" · ")}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold" placeholder="Teléfono*" value={phone} onChange={(e) => setPhone(e.target.value)} list="client-phone-suggestions" />
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold" placeholder="Empresa" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Paso 2. Vehículo</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">Si ahora no tienes todos los datos, sigue y lo completas luego.</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid grid-cols-[1fr_auto] gap-2 sm:col-span-2">
                    <input className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold" placeholder="Matrícula" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} list="plate-suggestions" />
                    <button onClick={() => void startPlateScan()} type="button" className="rounded-2xl border-2 border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-800">
                      Escanear
                    </button>
                  </div>
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold" placeholder="Modelo" value={model} onChange={(e) => setModel(e.target.value)} />
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold" placeholder="VIN" value={vin} onChange={(e) => setVin(e.target.value)} />
                  <textarea className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold sm:col-span-2" placeholder="Notas del vehículo" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Paso 3. Técnico y trabajo</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">Elige quién lo hará y cuánto suele tardar.</p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold sm:col-span-2" placeholder="Trabajo a realizar" value={workType} onChange={(e) => setWorkType(e.target.value)} />
                  <select className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    <option value={30}>30 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                    <option value={180}>180 min</option>
                  </select>
                  <input type="date" className="rounded-2xl border-2 border-slate-200 p-4 text-base font-semibold" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>

                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-slate-900">Técnicos disponibles</h3>
                    <InfoHint text="Verde bien, amarillo justo, rojo sin hueco." />
                  </div>
                  {loading ? (
                    <div className="mt-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">Mirando quién está disponible...</div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {technicians.map((t) => (
                        <button key={t.technicianId} onClick={() => setSelectedTechId(t.technicianId)} className={`rounded-2xl border-2 p-4 text-left ${selectedTechId === t.technicianId ? "border-blue-500 bg-blue-50" : statusClass(t.dayStatus)}`}>
                          <p className="text-base font-extrabold">{t.name}</p>
                          <p className="mt-1 text-sm font-semibold">{semaphorePlainLabel(t.dayStatus)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Paso 4. Elegir hueco</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">Solo verás horas libres. Lo demás ya está ocupado.</p>

                <div className="mt-4 flex items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${statusClass(dayStatus)}`}>{semaphorePlainLabel(dayStatus)}</span>
                  {selectedTechId && techMap.get(selectedTechId) ? <span className="text-sm font-semibold text-slate-600">Técnico: {techMap.get(selectedTechId)?.name}</span> : null}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <article className="rounded-2xl border-2 border-slate-200 p-4">
                    <h3 className="text-sm font-extrabold text-slate-900">Mañana</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {morningSlots.length === 0 ? <span className="text-sm font-semibold text-slate-500">Sin huecos por la mañana.</span> : null}
                      {morningSlots.map((s) => {
                        const active = selectedSlot?.startAt === s.startAt;
                        return (
                          <button key={s.startAt} onClick={() => setSelectedSlot(s)} className={`min-h-[48px] rounded-xl border-2 px-4 py-2 text-sm font-extrabold ${active ? "border-blue-700 bg-blue-700 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
                            {slotLabel(s.startAt)}
                          </button>
                        );
                      })}
                    </div>
                  </article>

                  <article className="rounded-2xl border-2 border-slate-200 p-4">
                    <h3 className="text-sm font-extrabold text-slate-900">Tarde</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {afternoonSlots.length === 0 ? <span className="text-sm font-semibold text-slate-500">Sin huecos por la tarde.</span> : null}
                      {afternoonSlots.map((s) => {
                        const active = selectedSlot?.startAt === s.startAt;
                        return (
                          <button key={s.startAt} onClick={() => setSelectedSlot(s)} className={`min-h-[48px] rounded-xl border-2 px-4 py-2 text-sm font-extrabold ${active ? "border-blue-700 bg-blue-700 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
                            {slotLabel(s.startAt)}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                </div>
              </div>
            )}

            {step === 5 && (
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Paso 5. Confirmar</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">Revisa el resumen y confirma la cita.</p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <article className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Cliente</p>
                    <p className="mt-1 text-base font-extrabold text-slate-900">{name || "Sin nombre"}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{phone || "Sin teléfono"}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{company || "Sin empresa"}</p>
                  </article>
                  <article className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Vehículo</p>
                    <p className="mt-1 text-base font-extrabold text-slate-900">{plate || "Sin matrícula"}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{model || "Modelo sin indicar"}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{vin || "VIN sin indicar"}</p>
                  </article>
                  <article className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Trabajo</p>
                    <p className="mt-1 text-base font-extrabold text-slate-900">{workType}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">Duración estimada: {duration} min</p>
                  </article>
                  <article className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Reserva</p>
                    <p className="mt-1 text-base font-extrabold text-slate-900">{techMap.get(selectedTechId)?.name || "Sin técnico"}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{selectedSlot ? `${new Date(selectedSlot.startAt).toLocaleDateString("es-ES")} · ${slotLabel(selectedSlot.startAt)}` : "Sin hora"}</p>
                  </article>
                </div>

                {notes.trim() ? (
                  <article className="mt-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Notas</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-700">{notes}</p>
                  </article>
                ) : null}
              </div>
            )}

            {error ? <p className="mt-4 rounded-2xl border-2 border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
            {okMsg ? <p className="mt-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{okMsg}</p> : null}
            {lastWhatsappUrl ? (
              <a href={lastWhatsappUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-extrabold text-emerald-800">
                <Icon name="alert" className="h-4 w-4" />
                Abrir WhatsApp ahora
              </a>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
              <div className="flex gap-2">
                <button onClick={() => goBack()} disabled={step === 1 || saving} className="rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 disabled:opacity-40">
                  Atrás
                </button>
                {step < 5 ? (
                  <button onClick={() => goNext()} disabled={saving} className="cta-primary px-4 py-3 text-sm disabled:opacity-40">
                    Siguiente
                  </button>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={() => void saveDraft()} disabled={!canDraft || saving} className="rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 disabled:opacity-40">
                  Guardar borrador
                </button>
                <button onClick={() => void saveAppointment()} disabled={!canSave || saving} className="cta-primary px-4 py-3 text-sm disabled:opacity-40">
                  {saving ? "Guardando..." : "Confirmar cita"}
                </button>
              </div>
            </div>
          </section>

          <datalist id="client-name-suggestions">
            {quickHistory.map((row) => (
              <option key={`n_${row.phone}_${row.name}`} value={row.name} />
            ))}
          </datalist>
          <datalist id="client-phone-suggestions">
            {quickHistory.map((row) => (
              <option key={`p_${row.phone}`} value={row.phone} />
            ))}
          </datalist>
          <datalist id="plate-suggestions">
            {quickHistory.filter((row) => row.plate).map((row) => (
              <option key={`m_${row.plate}`} value={row.plate} />
            ))}
          </datalist>

          {plateScanOpen && (
            <section className="fixed inset-0 z-[60] bg-slate-900/85 p-4">
              <article className="mx-auto w-full max-w-lg rounded-3xl border-2 border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">Escanear matrícula</h2>
                  <button onClick={() => { stopPlateScan(); setPlateScanOpen(false); }} className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-800">Cerrar</button>
                </div>
                <video ref={plateVideoRef} className="mt-3 h-56 w-full rounded-2xl border-2 border-slate-200 bg-black object-cover" muted playsInline />
                {plateScanMessage ? <p className="mt-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-2 text-xs font-semibold text-emerald-800">{plateScanMessage}</p> : null}
                {plateScanError ? <p className="mt-2 rounded-xl border-2 border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">{plateScanError}</p> : null}
              </article>
            </section>
          )}
        </>
      )}

      <MobileNav />
    </main>
  );
}

export default function NuevaCitaPage() {
  return (
    <Suspense>
      <NuevaCitaForm />
    </Suspense>
  );
}
