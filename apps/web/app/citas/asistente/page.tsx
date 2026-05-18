'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MobileNav from "../../components/MobileNav";
import { Icon } from "../../components/ui/Icon";
import InfoHint from "../../components/ui/InfoHint";
import { useSession } from "../../components/useSession";
import {
  createAppointment,
  getTechnicianAvailabilityRange,
  getTechniciansAvailabilityByDate,
  type AvailabilityDayDetail,
  type AvailabilityTechnicianDay,
} from "../../core/ordersApi";
import { semaphoreBadgeClass, semaphorePlainLabel } from "../../core/semaphore";
import { trackUxEvent } from "../../core/uxMetrics";

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type VoiceWizardStep =
  | "NAME"
  | "PLATE"
  | "PHONE"
  | "WORK"
  | "DURATION"
  | "DATE"
  | "TECHNICIAN"
  | "TIME"
  | "CONFIRM"
  | "DONE";

function todayLocalYmd(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDaysYmd(baseYmd: string, days: number): string {
  const d = new Date(`${baseYmd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cleanSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractPlateSpeechSegment(text: string): string {
  const normalized = normalizeText(text);
  const idxMatricula = normalized.lastIndexOf("matricula");
  const idxPlaca = normalized.lastIndexOf("placa");
  const idx = Math.max(idxMatricula, idxPlaca);
  if (idx < 0) return text;
  return text.slice(idx);
}

function normalizeSpelledPlate(text: string): string {
  const map: Record<string, string> = {
    cero: "0", uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
    a: "A", be: "B", b: "B", ce: "C", c: "C", de: "D", d: "D", e: "E", efe: "F", f: "F", ge: "G", g: "G",
    hache: "H", h: "H", i: "I", jota: "J", j: "J", ka: "K", k: "K", ele: "L", l: "L", eme: "M", m: "M",
    ene: "N", n: "N", enye: "N", eñe: "N", o: "O", pe: "P", p: "P", cu: "Q", q: "Q", erre: "R", r: "R",
    ese: "S", s: "S", te: "T", t: "T", u: "U", uve: "V", v: "V", w: "W", dobleu: "W", equis: "X", x: "X",
    ye: "Y", y: "Y", zeta: "Z", z: "Z", guion: "", guionbajo: "", barra: "", espacio: "",
  };
  const source = extractPlateSpeechSegment(text);
  return normalizeText(source)
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (map[token] !== undefined) return map[token];
      if (/^\d+$/.test(token)) return token;
      if (/^[a-z]{1,3}$/.test(token)) return token.toUpperCase();
      if (/^[a-z0-9]{4,10}$/.test(token)) return token.toUpperCase();
      return "";
    })
    .join("");
}

function parseDurationFromVoice(text: string): number | null {
  const normalized = normalizeText(text);
  const m = normalized.match(/(\d{2,3})\s*(min|minutos|minuto|hora|horas)/);
  if (!m) {
    const onlyNumber = normalized.match(/\b(30|60|90|120|180)\b/);
    if (!onlyNumber) return null;
    return Number(onlyNumber[1]);
  }
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return null;
  const mins = m[2].startsWith("hora") ? v * 60 : v;
  const allowed = [30, 60, 90, 120, 180];
  return allowed.includes(mins) ? mins : null;
}

function parseDateFromVoice(text: string, baseDate: string): string | null {
  const n = normalizeText(text);
  if (n.includes("pasado manana")) return addDaysYmd(baseDate, 2);
  if (n.includes("manana")) return addDaysYmd(baseDate, 1);
  if (n.includes("hoy")) return baseDate;
  const m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yy = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : new Date().getFullYear();
  if (!dd || !mm || mm > 12 || dd > 31) return null;
  const d = new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseNameFromVoice(text: string): string {
  const m = text.match(/(?:nombre|cliente)\s*(?:es|:)?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ\s]{3,70})/i);
  return cleanSpaces(m?.[1] ?? text);
}

function parsePhoneFromVoice(text: string): string | null {
  const m = text.match(/(\+?\d[\d\s-]{7,}\d)/);
  if (!m?.[1]) return null;
  const normalized = m[1].replace(/[^\d+]/g, "");
  return normalized.length >= 9 ? normalized : null;
}

function parsePlateFromVoice(text: string): string | null {
  const source = extractPlateSpeechSegment(text);
  const m = source.match(/\b([0-9]{4}\s*[A-Z]{3}|[A-Z]{1,2}\s*[0-9]{3,4}\s*[A-Z]{1,3})\b/i);
  if (m?.[1]) return m[1].replace(/[^A-Z0-9]/gi, "").toUpperCase();

  const directChunks = (source.toUpperCase().match(/[A-Z0-9]+/g) ?? [])
    .map((chunk) => chunk.replace(/[^A-Z0-9]/g, ""))
    .filter(Boolean);

  const candidates: string[] = [];
  for (let i = 0; i < directChunks.length; i += 1) {
    const one = directChunks[i];
    if (one) candidates.push(one);
    const two = `${directChunks[i] ?? ""}${directChunks[i + 1] ?? ""}`;
    if (two) candidates.push(two);
    const three = `${directChunks[i] ?? ""}${directChunks[i + 1] ?? ""}${directChunks[i + 2] ?? ""}`;
    if (three) candidates.push(three);
  }

  const raw = normalizeSpelledPlate(source);
  candidates.push(raw);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const modern = candidate.match(/(\d{4}[A-Z]{3})/);
    if (modern?.[1]) return modern[1];
    const legacy = candidate.match(/([A-Z]{1,2}\d{3,4}[A-Z]{1,3})/);
    if (legacy?.[1]) return legacy[1];
    const generic = candidate.match(/([A-Z0-9]{5,10})/);
    if (generic?.[1] && /[A-Z]/.test(generic[1]) && /\d/.test(generic[1])) return generic[1];
  }

  const modern = raw.match(/(\d{4}[A-Z]{3})/);
  if (modern?.[1]) return modern[1];
  const legacy = raw.match(/([A-Z]{1,2}\d{3,4}[A-Z]{1,3})/);
  if (legacy?.[1]) return legacy[1];
  return null;
}

function parseWorkTypeFromVoice(text: string): string {
  const m = text.match(/(?:trabajo|servicio|motivo|aver[ií]a|incidencia)\s*(?:es|:)?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s.,-]{3,120})/i);
  return cleanSpaces(m?.[1] ?? text);
}

function parseTimeFromVoice(text: string): { hour: number; minute: number } | null {
  const m = text.match(/(\d{1,2})(?:[:h\. ](\d{2}))?/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function hasTechnicianSlots(t: AvailabilityTechnicianDay) {
  return t.slots.morning.length + t.slots.afternoon.length > 0;
}

function isAffirmative(text: string) {
  const n = normalizeText(text);
  return n.includes("confirm") || n === "si" || n === "sí" || n === "ok" || n.includes("guardar");
}

function isNegative(text: string) {
  const n = normalizeText(text);
  return n.includes("no") || n.includes("cancel");
}

function statusClass(status: "GREEN" | "YELLOW" | "RED") {
  return semaphoreBadgeClass(status);
}

function speechErrorMessage(code?: string) {
  if (code === "not-allowed" || code === "service-not-allowed") {
    return "El micrófono está bloqueado. Actívalo y vuelve a probar.";
  }
  if (code === "audio-capture") {
    return "No encuentro ningún micrófono.";
  }
  if (code === "no-speech") {
    return "No he oído nada. Habla más cerca del micrófono.";
  }
  if (code === "network") {
    return "Se ha cortado la conexión mientras escuchaba.";
  }
  if (code === "aborted") {
    return "La escucha se ha detenido.";
  }
  return "No he podido entender bien el audio.";
}

export default function CitasAsistentePage() {
  const { hasRole } = useSession();
  const canCreate = hasRole("Administración") || hasRole("Oficina");

  const [step, setStep] = useState(1);
  const [voiceStep, setVoiceStep] = useState<VoiceWizardStep>("NAME");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [workType, setWorkType] = useState("Revisión tacógrafo");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState(60);

  const [selectedDate, setSelectedDate] = useState(todayLocalYmd());
  const [technicians, setTechnicians] = useState<AvailabilityTechnicianDay[]>([]);
  const [selectedTechId, setSelectedTechId] = useState("");
  const [rangeDays, setRangeDays] = useState<AvailabilityDayDetail[]>([]);
  const [dayDetail, setDayDetail] = useState<AvailabilityDayDetail | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ startAt: string; endAt: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [lastWhatsappUrl, setLastWhatsappUrl] = useState("");

  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceArmed, setVoiceArmed] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceMode, setVoiceMode] = useState(true);
  const [handsFreeMode, setHandsFreeMode] = useState(true);
  const [recognition, setRecognition] = useState<SpeechRecognitionLike | null>(null);
  const applyVoiceStepRef = useRef<(text: string) => Promise<void> | void>(() => {});
  const committedVoiceRef = useRef("");
  const turnFinalRef = useRef("");
  const turnInterimRef = useRef("");
  const autoListenTimerRef = useRef<number | null>(null);
  const [flowStartedAt] = useState(Date.now());

  const hasClientData = name.trim().length > 1 && phone.trim().length > 6;
  const availableTechnicians = useMemo(
    () => technicians.filter((t) => hasTechnicianSlots(t) && t.dayStatus !== "RED"),
    [technicians],
  );
  const selectedTechnician = useMemo(
    () => technicians.find((t) => t.technicianId === selectedTechId) ?? null,
    [technicians, selectedTechId],
  );
  const allDaySlots = useMemo(
    () => [...(dayDetail?.morningSlots ?? []), ...(dayDetail?.afternoonSlots ?? [])],
    [dayDetail],
  );
  const daySlotsSpeech = useMemo(() => {
    if (allDaySlots.length === 0) return "";
    const labels = allDaySlots.slice(0, 10).map((slot) => formatSlotTime(slot.startAt));
    if (allDaySlots.length > 10) labels.push("y más");
    return labels.join(", ");
  }, [allDaySlots]);

  const assistantPrompt = useMemo(() => {
    if (voiceStep === "NAME") return "Asistente: Nombre y apellidos del cliente.";
    if (voiceStep === "PLATE") return "Asistente: Matrícula del vehículo. Puedes decir sin matrícula.";
    if (voiceStep === "PHONE") return "Asistente: Teléfono del cliente.";
    if (voiceStep === "WORK") return "Asistente: Motivo del trabajo.";
    if (voiceStep === "DURATION") return "Asistente: Duración estimada en minutos. Ejemplo: 60 minutos.";
    if (voiceStep === "DATE") return "Asistente: Día de la cita. Puedes decir hoy, mañana o fecha 12/03.";
    if (voiceStep === "TECHNICIAN") {
      if (availableTechnicians.length === 0) {
        return `Asistente: No hay técnicos disponibles para ${selectedDate}. Di otra fecha.`;
      }
      return `Asistente: Técnicos disponibles para ${selectedDate}: ${availableTechnicians.map((t) => t.name).join(", ")}. ¿A quién asignamos?`;
    }
    if (voiceStep === "TIME") {
      if (!selectedTechnician) return "Asistente: Selecciona técnico.";
      if (allDaySlots.length === 0) {
        return `Asistente: ${selectedTechnician.name} no tiene huecos ese día. Elige otro técnico o fecha.`;
      }
      return `Asistente: Horas disponibles de ${selectedTechnician.name}: ${daySlotsSpeech}. ¿Qué hora reservamos?`;
    }
    if (voiceStep === "CONFIRM") {
      const summary = selectedSlot ? new Date(selectedSlot.startAt).toLocaleString("es-ES") : "sin hora";
      return `Asistente: Resumen. Cliente ${name}, matrícula ${plate || "sin matrícula"}, técnico ${selectedTechnician?.name ?? "-"}, ${summary}. ¿Confirmar cita?`;
    }
    return "Asistente: Cita creada correctamente.";
  }, [voiceStep, availableTechnicians, selectedDate, selectedTechnician, allDaySlots.length, daySlotsSpeech, selectedSlot, name, plate]);

  function speak(text: string) {
    if (!voiceMode || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    if (autoListenTimerRef.current) {
      window.clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "es-ES";
    utter.rate = 1;
    utter.onstart = () => {
      setIsSpeaking(true);
      recognition?.stop();
      setIsListening(false);
    };
    utter.onend = () => {
      setIsSpeaking(false);
      if (handsFreeMode && voiceSupported && voiceStep !== "DONE") {
        autoListenTimerRef.current = window.setTimeout(() => {
          void startListening();
        }, 900);
      }
    };
    synth.speak(utter);
  }

  async function loadTechniciansForDate(date: string): Promise<AvailabilityTechnicianDay[]> {
    setLoading(true);
    setError("");
    try {
      const rows = await getTechniciansAvailabilityByDate({
        date,
        durationMinutes: duration,
      });
      setTechnicians(rows);
      if (!selectedTechId && rows[0]) setSelectedTechId(rows[0].technicianId);
      return rows;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar técnicos");
      setTechnicians([]);
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function loadRangeForTech(techId: string, fromDate: string): Promise<AvailabilityDayDetail[]> {
    setLoading(true);
    setError("");
    try {
      const toDate = addDaysYmd(fromDate, 6);
      const days = await getTechnicianAvailabilityRange({
        technicianId: techId,
        from: fromDate,
        to: toDate,
        durationMinutes: duration,
      });
      setRangeDays(days);
      return days;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar disponibilidad por días");
      setRangeDays([]);
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function pickDay(date: string, techId: string = selectedTechId): Promise<AvailabilityDayDetail | null> {
    if (!techId) return null;
    setSelectedDate(date);
    setSelectedSlot(null);
    setLoading(true);
    setError("");
    try {
      const days = await getTechnicianAvailabilityRange({
        technicianId: techId,
        from: date,
        to: date,
        durationMinutes: duration,
      });
      const detail = days[0] ?? null;
      setDayDetail(detail);
      setStep(4);
      setVoiceStep("TIME");
      return detail;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar horas del día");
      setDayDetail(null);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function confirmAppointment() {
    if (!selectedSlot || !selectedTechId || !hasClientData) return;
    setSaving(true);
    setError("");
    setOkMsg("");
    setLastWhatsappUrl("");
    try {
      const res = await createAppointment({
        client: { name: name.trim(), phone: phone.trim() },
        vehicle: { plate: plate.trim() || undefined },
        technicianId: selectedTechId,
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
        durationMinutes: duration,
        workType: workType.trim(),
        notes: notes.trim() || undefined,
      });
      setOkMsg(`Cita confirmada (OT #${res.workOrder.id}).`);
      if (res.googleCalendar?.enabled && res.googleCalendar.synced) {
        setOkMsg((prev) => `${prev} Google Calendar sincronizado.`);
      } else if (res.googleCalendar?.enabled && !res.googleCalendar.synced) {
        setError(`La cita se guardó, pero Google Calendar falló: ${res.googleCalendar.error ?? "error desconocido"}`);
      }
      if (!res.whatsappAutoSent && res.whatsappUrl) {
        setLastWhatsappUrl(res.whatsappUrl);
        window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
      }
      setStep(6);
      setVoiceStep("DONE");
      trackUxEvent({
        name: "appointment_create",
        role: "Oficina",
        ok: true,
        durationMs: Date.now() - flowStartedAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar la cita");
      trackUxEvent({ name: "appointment_create", role: "Oficina", ok: false });
    } finally {
      setSaving(false);
    }
  }

  const applyVoiceStep = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    const n = normalizeText(t);
    setError("");
    setNotes((prev) => (prev ? `${prev}\n[Audio] ${t}` : `[Audio] ${t}`));

    if (voiceStep === "NAME") {
      const parsed = parseNameFromVoice(t);
      if (parsed.length < 3) {
        setVoiceStatus("No entendí el nombre. Repítelo con nombre y apellidos.");
        return;
      }
      setName(parsed);
      setStep(1);
      setVoiceStep("PLATE");
      setVoiceStatus(`Nombre guardado: ${parsed}.`);
      return;
    }

    if (voiceStep === "PLATE") {
      if (n.includes("sin matricula") || n.includes("sin placa") || n.includes("no tengo matricula")) {
        setPlate("");
        setVoiceStep("PHONE");
        setVoiceStatus("Matrícula vacía guardada.");
        return;
      }
      const parsed = parsePlateFromVoice(t);
      if (!parsed) {
        setVoiceStatus("No entendí la matrícula. Ejemplo: 1234 ABC.");
        return;
      }
      setPlate(parsed);
      setStep(1);
      setVoiceStep("PHONE");
      setVoiceStatus(`Matrícula guardada: ${parsed}.`);
      return;
    }

    if (voiceStep === "PHONE") {
      const parsed = parsePhoneFromVoice(t);
      if (!parsed) {
        setVoiceStatus("No entendí el teléfono. Dilo completo con prefijo si aplica.");
        return;
      }
      setPhone(parsed);
      setStep(1);
      setVoiceStep("WORK");
      setVoiceStatus(`Teléfono guardado: ${parsed}.`);
      return;
    }

    if (voiceStep === "WORK") {
      const parsed = parseWorkTypeFromVoice(t);
      if (parsed.length < 3) {
        setVoiceStatus("No entendí el motivo. Dime el trabajo a realizar.");
        return;
      }
      setWorkType(parsed);
      setStep(1);
      setVoiceStep("DURATION");
      setVoiceStatus(`Motivo guardado: ${parsed}.`);
      return;
    }

    if (voiceStep === "DURATION") {
      const parsed = parseDurationFromVoice(t);
      if (!parsed) {
        setVoiceStatus("Duración no válida. Usa 30, 60, 90, 120 o 180 minutos.");
        return;
      }
      setDuration(parsed);
      setStep(1);
      setVoiceStep("DATE");
      setVoiceStatus(`Duración guardada: ${parsed} minutos.`);
      return;
    }

    if (voiceStep === "DATE") {
      const parsedDate = parseDateFromVoice(t, todayLocalYmd());
      if (!parsedDate) {
        setVoiceStatus("No entendí la fecha. Dila como hoy, mañana o 12/03.");
        return;
      }
      setSelectedDate(parsedDate);
      setSelectedTechId("");
      setDayDetail(null);
      setSelectedSlot(null);
      const rows = await loadTechniciansForDate(parsedDate);
      const available = rows.filter((row) => hasTechnicianSlots(row) && row.dayStatus !== "RED");
      if (available.length === 0) {
        setVoiceStatus(`No hay técnicos disponibles el ${parsedDate}. Elige otra fecha.`);
        return;
      }
      setStep(2);
      setVoiceStep("TECHNICIAN");
      setVoiceStatus(`Fecha guardada: ${parsedDate}.`);
      return;
    }

    if (voiceStep === "TECHNICIAN") {
      const source = availableTechnicians.length > 0 ? availableTechnicians : technicians;
      if (source.length === 0) {
        setVoiceStep("DATE");
        setStep(1);
        setVoiceStatus("No tengo técnicos para esa fecha. Elige otra fecha.");
        return;
      }
      const picked = source.find((row) => {
        const normalizedName = normalizeText(row.name);
        return normalizedName.includes(n) || n.includes(normalizedName);
      });
      if (!picked) {
        setVoiceStatus(`No encontré ese técnico. Disponibles: ${source.map((row) => row.name).join(", ")}.`);
        return;
      }
      setSelectedTechId(picked.technicianId);
      setStep(3);
      const detail = await pickDay(selectedDate, picked.technicianId);
      const slots = [...(detail?.morningSlots ?? []), ...(detail?.afternoonSlots ?? [])];
      if (!detail || slots.length === 0) {
        setVoiceStatus(`${picked.name} no tiene huecos ese día. Elige otro técnico o otra fecha.`);
        setVoiceStep("TECHNICIAN");
        setStep(2);
        return;
      }
      setStep(4);
      setVoiceStep("TIME");
      setVoiceStatus(`Técnico guardado: ${picked.name}.`);
      return;
    }

    if (voiceStep === "TIME") {
      const parsed = parseTimeFromVoice(t);
      if (!parsed) {
        setVoiceStatus("No entendí la hora. Dila como 10:30.");
        return;
      }
      const picked = allDaySlots.find((s) => {
        const d = new Date(s.startAt);
        return d.getHours() === parsed.hour && d.getMinutes() === parsed.minute;
      });
      if (!picked) {
        setVoiceStatus(`Esa hora no está libre. Horas disponibles: ${daySlotsSpeech || "sin huecos"}.`);
        return;
      }
      setSelectedSlot(picked);
      setStep(5);
      setVoiceStep("CONFIRM");
      setVoiceStatus(`Hora guardada: ${formatSlotTime(picked.startAt)}.`);
      return;
    }

    if (voiceStep === "CONFIRM") {
      if (isAffirmative(n)) {
        await confirmAppointment();
        return;
      }
      if (isNegative(n)) {
        setVoiceStep("TIME");
        setStep(4);
        setVoiceStatus("Cita no confirmada. Elige otra hora.");
        return;
      }
      setVoiceStatus("Indica confirmar o cancelar.");
    }
  }, [
    voiceStep,
    technicians,
    availableTechnicians,
    selectedDate,
    daySlotsSpeech,
    allDaySlots,
    loadTechniciansForDate,
    pickDay,
  ]);

  async function ensureMicrophonePermission() {
    if (typeof navigator === "undefined") return false;
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }

  async function activateHandsFree() {
    const ok = await ensureMicrophonePermission();
    if (!ok) {
      setVoiceArmed(false);
      setVoiceStatus("Micrófono bloqueado. Permítelo en el navegador y pulsa 'Activar manos libres'.");
      return;
    }
    setVoiceArmed(true);
    setVoiceStatus("Asistente manos libres activo.");
    if (!isSpeaking && !isListening && voiceMode) {
      speak(assistantPrompt);
    }
  }

  async function startListening() {
    if (!voiceSupported || !recognition || isSpeaking) return;
    if (isListening) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) {
        if (handsFreeMode && voiceSupported && voiceStep !== "DONE") {
          if (autoListenTimerRef.current) {
            window.clearTimeout(autoListenTimerRef.current);
          }
          autoListenTimerRef.current = window.setTimeout(() => {
            void startListening();
          }, 350);
        }
        return;
      }
    }
    if (!voiceArmed) {
      const ok = await ensureMicrophonePermission();
      if (!ok) {
        setIsListening(false);
        setVoiceStatus("No se pudo acceder al micrófono. Pulsa 'Activar manos libres'.");
        return;
      }
      setVoiceArmed(true);
    }
    turnFinalRef.current = "";
    turnInterimRef.current = "";
    setVoiceStatus("Escuchando respuesta...");
    setIsListening(true);
    try {
      recognition.start();
    } catch (e) {
      setIsListening(false);
      setVoiceStatus(e instanceof Error ? e.message : "No se pudo iniciar el reconocimiento.");
    }
  }

  function stopListening() {
    recognition?.stop();
    setIsListening(false);
    setVoiceStatus("Escucha detenida.");
  }

  useEffect(() => {
    applyVoiceStepRef.current = applyVoiceStep;
  }, [applyVoiceStep]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ctor = (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition
      ?? (window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (!ctor) {
      setVoiceSupported(false);
      return;
    }
    const recog = new ctor();
    recog.lang = "es-ES";
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recog.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = cleanSpaces(event.results[i][0].transcript ?? "");
        if (!chunk) continue;
        if (event.results[i].isFinal) {
          turnFinalRef.current = cleanSpaces(`${turnFinalRef.current} ${chunk}`);
        } else {
          interim = cleanSpaces(`${interim} ${chunk}`);
        }
      }
      turnInterimRef.current = interim;
      const preview = cleanSpaces(`${turnFinalRef.current} ${turnInterimRef.current}`);
      setVoiceText(preview);
    };
    recog.onerror = (event) => {
      setIsListening(false);
      if (event.error === "not-allowed") {
        setVoiceStatus("El navegador bloqueó el micro. Pulsa 'Activar manos libres' para reactivar.");
        setVoiceArmed(false);
      } else {
        setVoiceStatus(speechErrorMessage(event.error));
      }
    };
    recog.onend = () => {
      setIsListening(false);
      const answer = cleanSpaces(turnFinalRef.current || turnInterimRef.current);
      turnFinalRef.current = "";
      turnInterimRef.current = "";
      if (answer) {
        committedVoiceRef.current = cleanSpaces(`${committedVoiceRef.current} ${answer}`);
        setVoiceText(answer);
        void applyVoiceStepRef.current(answer);
      } else {
        setVoiceText("");
      }
      if (handsFreeMode && voiceSupported && voiceStep !== "DONE") {
        if (autoListenTimerRef.current) {
          window.clearTimeout(autoListenTimerRef.current);
        }
        autoListenTimerRef.current = window.setTimeout(() => {
          void startListening();
        }, 450);
      }
    };
    setRecognition(recog);
    setVoiceSupported(true);
    return () => {
      recog.stop();
      if (autoListenTimerRef.current) {
        window.clearTimeout(autoListenTimerRef.current);
        autoListenTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (step >= 2) void loadTechniciansForDate(selectedDate);
  }, [duration, step, selectedDate]);

  useEffect(() => {
    if (step >= 3 && selectedTechId) void loadRangeForTech(selectedTechId, selectedDate);
  }, [selectedTechId, selectedDate, duration, step]);

  useEffect(() => {
    speak(assistantPrompt);
  }, [assistantPrompt]);

  useEffect(() => {
    if (!voiceSupported || !recognition || voiceArmed || !handsFreeMode) return;
    void activateHandsFree();
  }, [voiceSupported, recognition, voiceArmed, handsFreeMode]);

  useEffect(() => {
    if (!voiceSupported || !handsFreeMode || voiceStep === "DONE") return;
    if (isListening || isSpeaking) return;
    if (autoListenTimerRef.current) {
      window.clearTimeout(autoListenTimerRef.current);
    }
    autoListenTimerRef.current = window.setTimeout(() => {
      void startListening();
    }, 700);
  }, [assistantPrompt, voiceSupported, handsFreeMode, voiceStep, isListening, isSpeaking]);

  return (
    <main className="min-h-screen app-bg module-office px-4 pt-4 mobile-nav-safe">
      <section className="module-hero module-office mx-auto w-full max-w-4xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2">
            <h1 className="module-title inline-flex items-center gap-2">
              <Icon name="new" className="h-6 w-6" />
              Asistente de cita
            </h1>
            <InfoHint text="Crea citas rápido por voz o paso a paso." />
          </div>
          <Link href="/citas/nueva" className="module-map-chip">Modo normal</Link>
        </div>
        <p className="mt-2 surface-status p-3 text-sm font-extrabold text-blue-900">
          {assistantPrompt}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <InfoHint text="El asistente pregunta y avanza solo." />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <button
            onClick={() => void activateHandsFree()}
            disabled={!voiceSupported || voiceArmed}
            className="cta-primary p-2 text-xs disabled:opacity-40"
          >
            {voiceArmed ? "Manos libres activo" : "Activar manos libres"}
          </button>
          <button onClick={() => stopListening()} disabled={!isListening} className="cta-secondary p-2 text-xs disabled:opacity-40">
            Detener escucha
          </button>
          <button onClick={() => setVoiceMode((v) => !v)} className="cta-secondary p-2 text-xs">
            Voz asistente: {voiceMode ? "ON" : "OFF"}
          </button>
          <button onClick={() => setHandsFreeMode((v) => !v)} className="cta-secondary p-2 text-xs">
            Manos libres: {handsFreeMode ? "ON" : "OFF"}
          </button>
          <button onClick={() => setVoiceText("")} className="cta-secondary p-2 text-xs">
            Limpiar texto
          </button>
        </div>
        <textarea className="mt-2 w-full rounded-xl border-2 border-slate-200 p-2 text-xs font-semibold text-slate-800" rows={3} value={voiceText} onChange={(e) => setVoiceText(e.target.value)} placeholder={voiceSupported ? "Transcripción de voz..." : "Navegador sin reconocimiento de voz"} />
        {voiceStatus && <p className="mt-1 text-xs font-semibold text-slate-600">{voiceStatus}</p>}
      </section>

      {!canCreate ? (
        <section className="mx-auto mt-4 w-full max-w-4xl rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          No tienes permiso para crear citas.
        </section>
      ) : (
        <section className="mx-auto mt-4 w-full max-w-4xl surface-content p-4">
          {step === 1 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="Nombre cliente*" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="Teléfono*" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="Matrícula" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
              <select className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
                <option value={180}>180 min</option>
              </select>
              <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold sm:col-span-2" placeholder="Motivo / trabajo" value={workType} onChange={(e) => setWorkType(e.target.value)} />
              <textarea className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold sm:col-span-2" rows={3} placeholder="Notas opcionales" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <button
                onClick={() => {
                  setStep(2);
                  setVoiceStep("TECHNICIAN");
                }}
                disabled={!hasClientData || workType.trim().length < 3}
                className="rounded-xl bg-blue-700 p-3 text-sm font-extrabold text-white disabled:opacity-40 sm:col-span-2"
              >
                Continuar: elegir técnico
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-xs font-semibold text-slate-600">Fecha base de búsqueda</p>
              <input type="date" className="mt-1 rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              <div className="mt-3 space-y-2">
                {loading && <p className="text-sm font-semibold text-slate-500">Cargando técnicos...</p>}
                {technicians.map((t) => (
                  <button
                    key={t.technicianId}
                    onClick={() => {
                      setSelectedTechId(t.technicianId);
                      setStep(3);
                      setVoiceStep("DATE");
                    }}
                    className={`w-full rounded-xl border-2 p-3 text-left ${statusClass(t.dayStatus)}`}
                  >
                    <p className="text-sm font-extrabold">{t.name}</p>
                    <p className="text-xs font-semibold">Estado en fecha seleccionada: {semaphorePlainLabel(t.dayStatus)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <p className="text-sm font-extrabold text-slate-900">Días disponibles (7 días)</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {rangeDays.map((d) => (
                  <button key={d.date} onClick={() => void pickDay(d.date)} className={`rounded-xl border-2 p-3 text-left ${statusClass(d.status)}`}>
                    <p className="text-xs font-extrabold">{new Date(`${d.date}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "2-digit" })}</p>
                    <p className="text-xs font-semibold">{d.status}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <article className="rounded-xl border-2 border-slate-200 p-3">
                <h3 className="text-sm font-extrabold text-slate-800">Mañana</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(dayDetail?.morningSlots ?? []).map((s) => {
                    const active = selectedSlot?.startAt === s.startAt;
                    const label = new Date(s.startAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <button key={s.startAt} onClick={() => setSelectedSlot(s)} className={`rounded-lg border-2 px-3 py-2 text-xs font-extrabold ${active ? "border-blue-600 bg-blue-600 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </article>
              <article className="rounded-xl border-2 border-slate-200 p-3">
                <h3 className="text-sm font-extrabold text-slate-800">Tarde</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(dayDetail?.afternoonSlots ?? []).map((s) => {
                    const active = selectedSlot?.startAt === s.startAt;
                    const label = new Date(s.startAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <button key={s.startAt} onClick={() => setSelectedSlot(s)} className={`rounded-lg border-2 px-3 py-2 text-xs font-extrabold ${active ? "border-blue-600 bg-blue-600 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </article>
              <button
                onClick={() => {
                  setStep(5);
                  setVoiceStep("CONFIRM");
                }}
                disabled={!selectedSlot}
                className="rounded-xl bg-blue-700 p-3 text-sm font-extrabold text-white disabled:opacity-40 md:col-span-2"
              >
                Continuar: ver resumen
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold text-slate-700">
                <p><b>Cliente:</b> {name}</p>
                <p><b>Teléfono:</b> {phone}</p>
                <p><b>Matrícula:</b> {plate || "-"}</p>
                <p><b>Trabajo:</b> {workType}</p>
                <p><b>Duración:</b> {duration} min</p>
                <p><b>Fecha/hora:</b> {selectedSlot ? new Date(selectedSlot.startAt).toLocaleString("es-ES") : "-"}</p>
              </div>
              <button onClick={() => void confirmAppointment()} disabled={saving || !selectedSlot} className="w-full rounded-xl bg-emerald-700 p-3 text-sm font-extrabold text-white disabled:opacity-40">
                {saving ? "Confirmando..." : "Confirmar cita"}
              </button>
            </div>
          )}

          {step === 6 && okMsg && (
            <div className="space-y-3">
              <p className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm font-extrabold text-emerald-800">
                {okMsg}
              </p>
              {lastWhatsappUrl && (
                <a href={lastWhatsappUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-extrabold text-emerald-800">
                  <Icon name="alert" className="h-4 w-4" />
                  Abrir WhatsApp manualmente
                </a>
              )}
              <Link href="/citas/nueva" className="inline-flex w-full items-center justify-center rounded-xl border-2 border-slate-300 bg-white p-3 text-sm font-extrabold text-slate-800">
                Crear otra cita
              </Link>
            </div>
          )}

          {error && <p className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        </section>
      )}

      <MobileNav />
    </main>
  );
}
