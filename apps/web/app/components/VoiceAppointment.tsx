'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Parsed = {
  clientName: string;
  phone: string;
  plate: string;
  workType: string;
  date: string;
  time: string;
  notes: string;
};

const MONTH: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};
const DAY_NAME = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WORK_KW: Array<[string, string]> = [
  ["cambio de aceite", "Cambio de aceite"],
  ["cambio aceite", "Cambio de aceite"],
  ["aceite", "Cambio de aceite"],
  ["itv", "Preparación ITV"],
  ["tacógrafo", "Revisión tacógrafo"],
  ["tacografo", "Revisión tacógrafo"],
  ["neumáticos", "Cambio de neumáticos"],
  ["neumaticos", "Cambio de neumáticos"],
  ["ruedas", "Cambio de neumáticos"],
  ["frenos", "Revisión de frenos"],
  ["embrague", "Reparación de embrague"],
  ["distribución", "Cambio de distribución"],
  ["distribucion", "Cambio de distribución"],
  ["batería", "Cambio de batería"],
  ["bateria", "Cambio de batería"],
  ["diagnóstico", "Diagnóstico"],
  ["diagnostico", "Diagnóstico"],
  ["revisión", "Revisión general"],
  ["revision", "Revisión general"],
];

function todayLocalYmd(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function parseVoice(raw: string): Parsed {
  let text = raw.toLowerCase();

  // Phone: 9-digit Spanish number
  const phoneM = text.match(/\b([6-9]\d{8})\b/);
  const phone = phoneM ? phoneM[1] : "";
  if (phone) text = text.replace(phone, " ");

  // Plate: new format (4 digits + 3 letters) or old
  const plateM = raw.match(/\b(\d{4}[A-Z]{3})\b/i) ?? raw.match(/\b([A-Z]{1,2}\s?\d{4}\s?[A-Z]{2})\b/i);
  const plate = plateM ? plateM[1].replace(/\s/g, "").toUpperCase() : "";
  if (plate) text = text.replace(plate.toLowerCase(), " ");

  // Time
  const timeM = text.match(/a las (\d{1,2})(?:[:\s](\d{2}))?\s*(de la tarde|de la noche|de la ma[ñn]ana)?/);
  let time = "";
  if (timeM) {
    let h = parseInt(timeM[1]);
    const m = timeM[2] ? parseInt(timeM[2]) : 0;
    const period = timeM[3] ?? "";
    if ((period.includes("tarde") || period.includes("noche")) && h < 12) h += 12;
    time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    text = text.replace(timeM[0], " ");
  }

  // Date
  const today = new Date();
  let date = "";
  if (/pasado ma[ñn]ana/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 2);
    date = d.toISOString().slice(0, 10);
    text = text.replace(/pasado ma[ñn]ana/, " ");
  } else if (/ma[ñn]ana/.test(text)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    date = d.toISOString().slice(0, 10);
    text = text.replace(/ma[ñn]ana/, " ");
  } else {
    for (let i = 0; i < DAY_NAME.length; i++) {
      const norm = DAY_NAME[i].normalize("NFD").replace(/[̀-ͯ]/g, "");
      const pat = new RegExp(`\\b(${DAY_NAME[i]}|${norm})\\b`);
      if (pat.test(text)) {
        const d = new Date(today);
        let diff = i - d.getDay();
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
        date = d.toISOString().slice(0, 10);
        text = text.replace(pat, " ");
        break;
      }
    }
    if (!date) {
      const explM = text.match(/(?:el\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
      if (explM) {
        const d = new Date(today.getFullYear(), MONTH[explM[2]], parseInt(explM[1]));
        if (d < today) d.setFullYear(d.getFullYear() + 1);
        date = d.toISOString().slice(0, 10);
        text = text.replace(explM[0], " ");
      }
    }
  }
  if (!date) date = todayLocalYmd();

  // Work type
  let workType = "";
  for (const [kw, label] of WORK_KW) {
    const kwNorm = kw.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const pat = new RegExp(`\\b(${kw}|${kwNorm})\\b`);
    if (pat.test(text)) {
      workType = label;
      text = text.replace(pat, " ");
      break;
    }
  }

  // Client name: after "para", "cliente", "de"
  let clientName = "";
  const nameM = text.match(/(?:para|cliente|de)\s+([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){0,3})/i);
  if (nameM) {
    clientName = nameM[1].split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    text = text.replace(nameM[0], " ");
  }

  const notes = text.replace(/\s+/g, " ").trim().replace(/^[,.\s]+|[,.\s]+$/g, "");

  return { clientName, phone, plate, workType, date, time, notes };
}

type Props = { className?: string };

export default function VoiceAppointment({ className = "" }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "listening" | "confirm">("idle");
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);

  const supported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const stopListening = useCallback(() => {
    recogRef.current?.stop();
    recogRef.current = null;
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  function startListening() {
    setError("");
    setTranscript("");
    const SR = (window.SpeechRecognition ?? (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition);
    if (!SR) { setError("Tu navegador no soporta reconocimiento de voz."); return; }
    const r = new SR();
    r.lang = "es-ES";
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      const t = Array.from(e.results).map((res) => res[0].transcript).join(" ");
      setTranscript(t);
    };
    r.onerror = (e) => setError(`Error de micrófono: ${e.error}`);
    r.onend = () => {
      setTranscript((t) => {
        if (t.trim().length > 3) {
          setParsed(parseVoice(t));
          setPhase("confirm");
        } else {
          setPhase("idle");
        }
        return t;
      });
    };
    r.start();
    recogRef.current = r;
    setPhase("listening");
  }

  function confirm() {
    if (!parsed) return;
    const p = new URLSearchParams();
    if (parsed.clientName) p.set("nombre", parsed.clientName);
    if (parsed.phone) p.set("telefono", parsed.phone);
    if (parsed.plate) p.set("matricula", parsed.plate);
    if (parsed.workType) p.set("trabajo", parsed.workType);
    if (parsed.date) p.set("fecha", parsed.date);
    if (parsed.time) p.set("hora", parsed.time);
    if (parsed.notes) p.set("notas", parsed.notes);
    setPhase("idle");
    router.push(`/citas/nueva?${p.toString()}`);
  }

  if (!supported) return null;

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={phase === "idle" ? startListening : undefined}
        className={`btn-tap fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all ${
          phase === "listening"
            ? "animate-pulse bg-rose-500 text-white"
            : "bg-[#0b2a4a] text-white"
        } ${className}`}
        aria-label="Dictar cita por voz"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 10a7 7 0 0 1-14 0M12 19v4M8 23h8" />
        </svg>
      </button>

      {/* Modal escuchando */}
      {phase === "listening" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 animate-pulse items-center justify-center rounded-full bg-rose-100">
                <svg className="h-5 w-5 text-rose-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z" />
                  <path d="M19 10a7 7 0 0 1-14 0M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <p className="text-base font-extrabold text-slate-900">Escuchando…</p>
                <p className="text-xs font-semibold text-slate-500">Di: &quot;Para Juan López, matrícula 1234ABC, cambio de aceite mañana a las 10&quot;</p>
              </div>
            </div>
            {transcript && (
              <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700 italic">&quot;{transcript}&quot;</p>
            )}
            <button
              type="button"
              onClick={() => { stopListening(); setPhase("idle"); }}
              className="btn-tap mt-4 w-full rounded-2xl border-2 border-slate-200 py-3 text-sm font-extrabold text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal confirmación */}
      {phase === "confirm" && parsed && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-base font-extrabold text-slate-900">Confirma la cita</p>
            <p className="mt-1 text-xs font-semibold text-slate-500 italic">&quot;{transcript}&quot;</p>
            <div className="mt-4 space-y-2">
              {[
                { label: "Cliente", key: "clientName" as const, placeholder: "Nombre del cliente" },
                { label: "Teléfono", key: "phone" as const, placeholder: "Teléfono" },
                { label: "Matrícula", key: "plate" as const, placeholder: "1234ABC" },
                { label: "Trabajo", key: "workType" as const, placeholder: "Tipo de trabajo" },
                { label: "Fecha", key: "date" as const, placeholder: "YYYY-MM-DD", type: "date" },
                { label: "Hora", key: "time" as const, placeholder: "HH:MM", type: "time" },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-extrabold text-slate-500">{label}</span>
                  <input
                    type={type ?? "text"}
                    className={`flex-1 rounded-xl border-2 px-3 py-2 text-sm font-semibold outline-none ${
                      parsed[key] ? "border-emerald-300 bg-emerald-50 text-slate-900" : "border-amber-300 bg-amber-50 text-slate-500"
                    }`}
                    value={parsed[key]}
                    placeholder={placeholder}
                    onChange={(e) => setParsed((p) => p ? { ...p, [key]: e.target.value } : p)}
                  />
                </div>
              ))}
            </div>
            {error && <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => { setPhase("idle"); setParsed(null); }}
                className="btn-tap flex-1 rounded-2xl border-2 border-slate-200 py-3 text-sm font-extrabold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirm}
                className="btn-tap flex-1 rounded-2xl bg-[#0b2a4a] py-3 text-sm font-extrabold text-white"
              >
                Abrir formulario →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
