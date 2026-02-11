'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import MobileNav from "../components/MobileNav";
import { useSession } from "../components/useSession";
import {
  Appointment,
  availableSlotsForTech,
  getTechUsers,
  loadAppointments,
  loadDayOff,
  loadOTs,
  minutesToHHMM,
  nextOtId,
  saveAppointments,
  saveOTs,
  toYMD,
} from "../components/scheduleStore";

function uid() {
  return "a_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}

export default function InicioPage() {
  const { users, activeUser, hasRole } = useSession();

  const canBook =
    hasRole("Administración") || hasRole("Oficina");

  const isAdmin = hasRole("Administración");

  // Calendario ultra simple: hoy + 14 días
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => {
    const out: { label: string; ymd: string }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ymd = toYMD(d);
      const label = d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "2-digit" });
      out.push({ label, ymd });
    }
    return out;
  }, []);

  const techs = useMemo(() => getTechUsers(users), [users]);

  const [date, setDate] = useState<string>(days[0]?.ymd ?? toYMD(new Date()));
  const [techUserId, setTechUserId] = useState<string>("");
  const [durationMin, setDurationMin] = useState<number>(60);
  const [slotMin, setSlotMin] = useState<number | null>(null);

  // Datos cliente (mínimos)
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [notes, setNotes] = useState("");

  const appointments = useMemo(() => loadAppointments(), [date, techUserId, durationMin]);
  const dayoff = useMemo(() => loadDayOff(), [date]);

  const selectedTech = useMemo(
    () => techs.find(t => t.id === techUserId) ?? techs[0],
    [techs, techUserId]
  );

  const slots = useMemo(() => {
    const tid = (techUserId || selectedTech?.id || "");
    if (!tid) return [];
    return availableSlotsForTech({
      date,
      techUserId: tid,
      durationMin,
      appointments: loadAppointments(),
      dayoff: loadDayOff(),
    });
  }, [date, techUserId, durationMin, selectedTech?.id]);

  function resetForm() {
    setSlotMin(null);
    setClientName("");
    setClientPhone("");
    setVehiclePlate("");
    setNotes("");
  }

  function book() {
    if (!canBook) {
      alert("⛔ Solo Oficina o Administración pueden agendar citas.");
      return;
    }

    const tid = (techUserId || selectedTech?.id || "");
    if (!tid) return alert("Elige técnico");
    if (slotMin === null) return alert("Elige una hora");
    if (!clientName.trim()) return alert("Falta nombre cliente");
    if (!clientPhone.trim()) return alert("Falta teléfono");
    if (!vehiclePlate.trim()) return alert("Falta matrícula");

    // 1) crear OT "sin empezar"
    const ots = loadOTs();
    const newId = nextOtId(ots);

    // Estado inicial: lo dejamos en "Diagnóstico" para que aparezca en el Kanban actual.
    // (Luego crearemos una columna "Citas" si quieres).
    const ot = {
      id: newId,
      title: "Cita programada",
      plate: vehiclePlate.trim().toUpperCase(),
      description: notes.trim() || "",
      priority: "Normal",
      state: "Diagnóstico",
      assignedToUserId: tid,
      scheduledDate: date,
      scheduledStartMin: slotMin,
      scheduledDurationMin: durationMin,
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      createdAt: new Date().toISOString(),
    };

    saveOTs([ot, ...ots]);

    // 2) crear cita
    const app: Appointment = {
      id: uid(),
      date,
      startMin: slotMin,
      durationMin,
      techUserId: tid,
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      vehiclePlate: vehiclePlate.trim().toUpperCase(),
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      otId: newId,
    };

    const all = loadAppointments();
    saveAppointments([app, ...all]);

    alert(`✅ Cita creada y OT #${newId} asignada`);
    resetForm();
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <header className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Inicio</h1>
            <p className="mt-1 text-sm text-gray-600">
              {activeUser ? (
                <>
                  Hola, <b>{activeUser.name}</b> — {(activeUser.roles ?? []).join(", ")}
                </>
              ) : (
                <>Sin sesión — ve a <Link className="text-blue-600 font-semibold" href="/login">/login</Link></>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                href="/ajustes/usuarios"
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800"
              >
                Usuarios
              </Link>
            )}
            <Link
              href="/perfil"
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800"
            >
              Perfil
            </Link>
          </div>
        </div>
      </header>

      {/* BLOQUE 1: Agendar cita (para Oficina/Admin) */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Agendar cita</h2>
        <p className="mt-1 text-sm text-gray-600">
          Selecciona día → técnico → hora libre → datos cliente → OK.
        </p>

        {!canBook && (
          <div className="mt-3 rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800">
            ⛔ Tu rol solo puede ver el resumen. Para agendar necesitas Oficina o Administración.
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-600">Día</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {days.map(d => (
              <button
                key={d.ymd}
                className={
                  "rounded-xl border px-3 py-2 text-xs font-semibold " +
                  (date === d.ymd ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-800")
                }
                onClick={() => { setDate(d.ymd); setSlotMin(null); }}
                disabled={!canBook}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-gray-600">Técnico</p>
            <select
              className="mt-2 w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
              value={techUserId}
              onChange={(e) => { setTechUserId(e.target.value); setSlotMin(null); }}
              disabled={!canBook}
            >
              <option value="">(Auto: primero disponible)</option>
              {techs.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">Si no eliges, se usa el primero disponible.</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-600">Duración</p>
            <select
              className="mt-2 w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
              value={String(durationMin)}
              onChange={(e) => { setDurationMin(parseInt(e.target.value, 10)); setSlotMin(null); }}
              disabled={!canBook}
            >
              <option value="30">30 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
              <option value="120">120 min</option>
            </select>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-600">Horas disponibles</p>

          {slots.length === 0 ? (
            <div className="mt-2 rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">
              No hay horas libres (o el técnico está de vacaciones).
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {slots.map(min => (
                <button
                  key={min}
                  className={
                    "rounded-xl border px-3 py-2 text-xs font-semibold " +
                    (slotMin === min ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-800")
                  }
                  onClick={() => setSlotMin(min)}
                  disabled={!canBook}
                >
                  {minutesToHHMM(min)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            placeholder="Nombre cliente"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            disabled={!canBook}
          />
          <input
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400"
            placeholder="Teléfono"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            disabled={!canBook}
            inputMode="tel"
          />
          <input
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400 sm:col-span-2"
            placeholder="Matrícula"
            value={vehiclePlate}
            onChange={(e) => setVehiclePlate(e.target.value)}
            disabled={!canBook}
          />
          <textarea
            className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-base outline-none focus:border-blue-400 sm:col-span-2"
            placeholder="Notas (opcional)"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canBook}
          />
        </div>

        <button
          className="mt-4 w-full rounded-2xl bg-gray-900 p-4 text-base font-semibold text-white disabled:opacity-40 active:scale-[0.99]"
          onClick={book}
          disabled={!canBook}
        >
          OK — Crear cita y OT
        </button>

        <p className="mt-2 text-xs text-gray-400">
          (MVP) Se crea una OT en estado inicial para que aparezca en Taller.
        </p>
      </section>

      {/* BLOQUE 2: accesos rápidos */}
      <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Accesos</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href="/taller" className="rounded-2xl border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-900">
            Ver Taller
            <p className="mt-1 text-xs text-gray-500">Órdenes por estado</p>
          </Link>
          <Link href="/inventario" className="rounded-2xl border border-gray-200 bg-white p-4 text-sm font-semibold text-gray-900">
            Inventario
            <p className="mt-1 text-xs text-gray-500">Stock y movimientos</p>
          </Link>
        </div>
      </section>

      <MobileNav />
    </main>
  );
}
