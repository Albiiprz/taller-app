'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import MobileNav from "../../components/MobileNav";
import { Icon } from "../../components/ui/Icon";
import { getAppointment, listUsers, updateAppointment } from "../../core/ordersApi";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function EditarCitaPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [lastWhatsappUrl, setLastWhatsappUrl] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [model, setModel] = useState("");
  const [workType, setWorkType] = useState("");
  const [notes, setNotes] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "CANCELLED" | "DRAFT">("DRAFT");
  const [technicianId, setTechnicianId] = useState("");
  const [technicianOptions, setTechnicianOptions] = useState<Array<{ id: string; name: string }>>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const appt = await getAppointment({ id });
      setStatus(appt.status);
      setName(appt.client.name ?? "");
      setPhone(appt.client.phone ?? "");
      setEmail(appt.client.email ?? "");
      setCompany(appt.client.company ?? "");
      setPlate(appt.vehicle.plate ?? "");
      setVin(appt.vehicle.vin ?? "");
      setModel(appt.vehicle.model ?? "");
      setWorkType(appt.workType ?? "");
      setNotes(appt.notes ?? "");
      setStartAt(appt.startAt ? toLocalInput(appt.startAt) : "");
      setEndAt(appt.endAt ? toLocalInput(appt.endAt) : "");
      setTechnicianId(appt.technicianId ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude abrir esta cita.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    listUsers({ role: "TECNICO" })
      .then((users) => setTechnicianOptions(users.map((u) => ({ id: String(u.id), name: u.name }))))
      .catch(() => setTechnicianOptions([]));
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setOkMsg("");
    setLastWhatsappUrl("");
    try {
      const res = await updateAppointment({
        id,
        client: {
          name: name || undefined,
          phone: phone || undefined,
          email: email || undefined,
          company: company || undefined,
        },
        vehicle: {
          plate: plate || undefined,
          vin: vin || undefined,
          model: model || undefined,
        },
        workType: workType || undefined,
        notes,
        technicianId: technicianId || undefined,
        startAt: startAt ? new Date(startAt).toISOString() : undefined,
        endAt: endAt ? new Date(endAt).toISOString() : undefined,
      });
      setOkMsg(res.whatsappAutoSent ? "Cita actualizada y WhatsApp enviado automáticamente." : "Cita actualizada.");
      if (res.googleCalendar?.enabled && res.googleCalendar.synced) {
        setOkMsg((prev) => `${prev} Google Calendar sincronizado.`);
      } else if (res.googleCalendar?.enabled && !res.googleCalendar.synced) {
        setError(`La cita está guardada, pero no se pudo pasar a Google Calendar: ${res.googleCalendar.error ?? "motivo desconocido"}`);
      }
      if (res.whatsappUrl) {
        setLastWhatsappUrl(res.whatsappUrl);
        window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen app-bg module-office px-4 pt-4 mobile-nav-safe">
      <section className="module-hero module-office mx-auto w-full max-w-4xl p-4">
        <div className="flex items-center justify-between">
          <h1 className="module-title inline-flex items-center gap-2">
            <Icon name="orders" className="h-6 w-6" />
            Editar cita #{id}
          </h1>
          <Link href="/calendario" className="module-map-chip inline-flex min-h-0 items-center justify-center">Volver</Link>
        </div>
        <p className="module-copy mt-2 text-sm">Puedes completar o corregir esta cita sin empezar de cero.</p>
        <p className="mt-2 text-xs font-extrabold text-slate-600">Estado: {status}</p>
      </section>

      <section className="surface-content mx-auto mt-4 w-full max-w-4xl p-4">
        {loading ? (
          <p className="text-sm font-semibold text-slate-600">Abriendo cita...</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="Empresa" value={company} onChange={(e) => setCompany(e.target.value)} />
            <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="Matrícula" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
            <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="VIN" value={vin} onChange={(e) => setVin(e.target.value)} />
            <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" placeholder="Modelo" value={model} onChange={(e) => setModel(e.target.value)} />
            <select className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold sm:col-span-2" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">Selecciona técnico</option>
              {technicianOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold sm:col-span-2" placeholder="Trabajo" value={workType} onChange={(e) => setWorkType(e.target.value)} />
            <input type="datetime-local" className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            <input type="datetime-local" className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            <textarea className="rounded-xl border-2 border-slate-200 p-3 text-sm font-semibold sm:col-span-2" rows={4} placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        )}

        {error && <p className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        {okMsg && <p className="mt-3 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{okMsg}</p>}
        {lastWhatsappUrl && (
          <a
            href={lastWhatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-extrabold text-emerald-800"
          >
            <Icon name="alert" className="h-4 w-4" />
            Abrir WhatsApp ahora
          </a>
        )}

        <button
          onClick={() => void save()}
          disabled={loading || saving}
          className="mt-4 cta-primary inline-flex w-full items-center justify-center gap-2 p-3 text-sm disabled:opacity-40"
        >
          <Icon name="new" className="h-4 w-4" />
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </section>

      <MobileNav />
    </main>
  );
}
