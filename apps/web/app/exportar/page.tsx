'use client';

import MobileNav from "../components/MobileNav";
import { useSession } from "../components/useSession";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

const EXPORTS = [
  { key: "clientes",  label: "Clientes",        desc: "Todos los clientes con matrículas y contacto",                  file: "clientes.csv"  },
  { key: "citas",     label: "Citas",            desc: "Historial completo de citas: técnico, estado, horario, notas", file: "citas.csv"     },
  { key: "ordenes",   label: "Órdenes de trabajo", desc: "OTs con estado, tiempos, km, combustible y checklist",       file: "ordenes.csv"   },
  { key: "auditoria", label: "Auditoría",        desc: "Todos los cambios de estado y eventos registrados en el taller", file: "auditoria.csv" },
];

export default function ExportarPage() {
  const { hasRole } = useSession();
  const canExport = hasRole("Administración") || hasRole("Oficina");

  function download(key: string, filename: string) {
    const token = typeof window !== "undefined" ? localStorage.getItem("taller_access_token_v1") : null;
    const url = `${API_BASE}/export/${key}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    // Pass token via fetch + blob for authenticated download
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        a.href = blobUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => alert("Error al descargar. Comprueba que has iniciado sesión."));
  }

  return (
    <main className="min-h-screen app-bg mobile-nav-safe">
      <div className="sticky top-0 z-20 bg-[#0b2a4a] px-4 py-4 shadow-lg">
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-xs font-extrabold uppercase tracking-widest text-white/60">Administración</p>
          <h1 className="text-xl font-black text-white">Exportar datos</h1>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 pt-6 pb-32 space-y-3">
        {!canExport && (
          <p className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            Solo Administración y Oficina pueden exportar datos.
          </p>
        )}

        {canExport && EXPORTS.map(({ key, label, desc, file }) => (
          <div key={key} className="flex items-center justify-between gap-4 rounded-2xl border-2 border-slate-200 bg-white p-4">
            <div>
              <p className="text-sm font-extrabold text-slate-900">{label}</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">{desc}</p>
            </div>
            <button
              type="button"
              onClick={() => download(key, file)}
              className="btn-tap shrink-0 flex items-center gap-2 rounded-2xl bg-[#0b2a4a] px-4 py-2.5 text-sm font-extrabold text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              CSV
            </button>
          </div>
        ))}

        {canExport && (
          <p className="text-xs font-semibold text-slate-400 px-1">
            Los archivos CSV se abren directamente en Excel, Google Sheets o cualquier hoja de cálculo. Codificación UTF-8 con BOM para compatibilidad con Excel en Windows.
          </p>
        )}
      </div>

      <MobileNav />
    </main>
  );
}
