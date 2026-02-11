'use client';

import Link from "next/link";
import { useState } from "react";
import MobileNav from "./components/MobileNav";
import RoleSwitcher, { Role } from "./components/RoleSwitcher";

function badgeClass(status: string) {
  if (status === "En reparación") return "bg-orange-100 text-orange-700";
  if (status === "Recepción") return "bg-blue-100 text-blue-700";
  if (status === "Diagnóstico") return "bg-purple-100 text-purple-700";
  if (status === "Listo") return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-700";
}

export default function Home() {
  const [role, setRole] = useState<Role>("OFICINA");

  const roleLabel =
    role === "ADMINISTRACION" ? "Administración" :
    role === "OFICINA" ? "Oficina" :
    role === "JEFE_TALLER" ? "Jefe/a de Taller" :
    role === "TECNICO" ? "Técnico/a" :
    role === "CONTABILIDAD" ? "Contabilidad" : "Inventario";

  return (
    <main className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Panel del Taller</h1>
            <p className="text-sm text-gray-500">
              Vista: <span className="font-medium text-gray-700">{roleLabel}</span>
            </p>
          </div>

          <RoleSwitcher onChange={setRole} />
        </div>
      </header>

      {/* Acción principal por rol */}
      {role === "OFICINA" && (
        <Link
          href="/ordenes/nueva"
          className="block w-full rounded-2xl bg-blue-600 px-4 py-5 text-center text-lg font-semibold text-white shadow-md active:scale-[0.98]"
        >
          + Registrar entrada / Nueva OT
        </Link>
      )}

      {role === "TECNICO" && (
        <Link
          href="/ordenes"
          className="block w-full rounded-2xl bg-blue-600 px-4 py-5 text-center text-lg font-semibold text-white shadow-md active:scale-[0.98]"
        >
          Ver mis órdenes de hoy
        </Link>
      )}

      {role === "JEFE_TALLER" && (
        <Link
          href="/ordenes"
          className="block w-full rounded-2xl bg-blue-600 px-4 py-5 text-center text-lg font-semibold text-white shadow-md active:scale-[0.98]"
        >
          Abrir tablero del taller
        </Link>
      )}

      {role === "INVENTARIO" && (
        <button
          className="block w-full rounded-2xl bg-blue-600 px-4 py-5 text-center text-lg font-semibold text-white shadow-md active:scale-[0.98]"
        >
          Escanear producto (próximamente)
        </button>
      )}

      {role === "CONTABILIDAD" && (
        <button
          className="block w-full rounded-2xl bg-blue-600 px-4 py-5 text-center text-lg font-semibold text-white shadow-md active:scale-[0.98]"
        >
          Ver facturas pendientes (próximamente)
        </button>
      )}

      {role === "ADMINISTRACION" && (
        <button
          className="block w-full rounded-2xl bg-blue-600 px-4 py-5 text-center text-lg font-semibold text-white shadow-md active:scale-[0.98]"
        >
          Ver resumen del mes (próximamente)
        </button>
      )}

      <section className="mt-8 space-y-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-800">Alertas</h2>
            <span className="text-xs text-gray-400">Importante</span>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-gray-700">📌 Presupuestos sin respuesta</span>
              <span className="font-semibold text-gray-800">3</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-gray-700">⚠️ Stock bajo</span>
              <span className="font-semibold text-gray-800">5</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-gray-700">⏰ OTs retrasadas</span>
              <span className="font-semibold text-gray-800">2</span>
            </li>
          </ul>
        </div>

        {role === "OFICINA" && (
          <>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-800">Agenda de hoy</h2>
                <span className="text-xs text-gray-400">Próximas</span>
              </div>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="font-semibold text-gray-800">09:30 · 1234-ABC</p>
                  <p className="text-sm text-gray-500">Revisión tacógrafo</p>
                  <button className="mt-2 w-full rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white active:scale-[0.99]">
                    Recibir (crear/abrir OT)
                  </button>
                </div>
                <div className="rounded-xl border border-gray-100 p-3">
                  <p className="font-semibold text-gray-800">12:00 · 5678-DEF</p>
                  <p className="text-sm text-gray-500">Mantenimiento</p>
                  <button className="mt-2 w-full rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white active:scale-[0.99]">
                    Recibir (crear/abrir OT)
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-800">Últimas OTs</h2>
                <Link className="text-sm font-medium text-blue-600" href="/ordenes">
                  Ver todas
                </Link>
              </div>

              <div className="space-y-3">
                <Link href="/ordenes/1235" className="block rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">OT #1235</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClass("Recepción")}`}>
                      Recepción
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">Mantenimiento</p>
                </Link>
              </div>
            </div>
          </>
        )}

        {role === "TECNICO" && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-800">Mi trabajo (hoy)</h2>
              <span className="text-xs text-gray-400">Start/Stop luego</span>
            </div>

            <div className="mt-3 space-y-3">
              {[
                { id: "1234", status: "En reparación", title: "Revisión tacógrafo" },
                { id: "1236", status: "Diagnóstico", title: "Fallo sensor" },
              ].map((ot) => (
                <Link key={ot.id} href={`/ordenes/${ot.id}`} className="block rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">OT #{ot.id}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${badgeClass(ot.status)}`}>
                      {ot.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{ot.title}</p>

                  <div className="mt-3 flex gap-2">
                    <button className="flex-1 rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white active:scale-[0.99]">
                      ▶ Empezar
                    </button>
                    <button className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 active:scale-[0.99]">
                      📷 Foto
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {role === "JEFE_TALLER" && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-medium text-gray-800">Cuellos de botella</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Esperando diagnóstico", value: 5 },
                { label: "En reparación", value: 7 },
                { label: "QC pendiente", value: 2 },
                { label: "Listo para entrega", value: 3 },
              ].map((x, i) => (
                <div key={i} className="rounded-xl border border-gray-100 p-3">
                  <p className="text-gray-500">{x.label}</p>
                  <p className="text-2xl font-semibold text-gray-800">{x.value}</p>
                </div>
              ))}
            </div>
            <Link
              href="/ordenes"
              className="mt-4 block w-full rounded-2xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white active:scale-[0.99]"
            >
              Ir a órdenes
            </Link>
          </div>
        )}
      </section>

      <MobileNav />
    </main>
  );
}
