'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MobileNav from "../components/MobileNav";
import { Icon } from "../components/ui/Icon";
import { listInventoryProducts, listWorkOrders, type InventoryProduct } from "../core/ordersApi";
import type { OtItem } from "../core/workflow";
import { buildAlerts, type AlertTone } from "../core/alerts";
import { listOpenHelpRequests } from "../core/helpRequests";
import { useSession } from "../components/useSession";
import { filterOrdersForRoleDay } from "../core/workflow";

function toneCardClass(tone: AlertTone) {
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

function toneIconClass(tone: AlertTone) {
  if (tone === "danger") return "text-rose-700";
  if (tone === "warn") return "text-amber-700";
  if (tone === "ok") return "text-emerald-700";
  return "text-blue-700";
}

export default function AvisosPage() {
  const { activeUser } = useSession();
  const activeRole = (activeUser?.roles?.[0] ?? "Oficina");
  const [orders, setOrders] = useState<OtItem[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [otRows, prodRows] = await Promise.all([listWorkOrders(), listInventoryProducts()]);
      setOrders(otRows);
      setProducts(prodRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron preparar los avisos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    const onVisibility = () => document.visibilityState === "visible" && void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }, []);
  const visibleOrders = useMemo(
    () => filterOrdersForRoleDay(orders, activeRole, today),
    [orders, activeRole, today],
  );
  const helpRequests = useMemo(() => listOpenHelpRequests(), [orders, products]);
  const alerts = useMemo(() => buildAlerts(visibleOrders, products, helpRequests), [visibleOrders, products, helpRequests]);

  return (
    <main className="min-h-screen app-bg module-alert px-4 pt-4 mobile-nav-safe">
      <section className="module-hero module-alert mx-auto w-full max-w-5xl p-4">
        <div className="flex items-center justify-between">
          <h1 className="module-title inline-flex items-center gap-2">
            <Icon name="alert" className="h-6 w-6 text-amber-700" />
            Avisos
          </h1>
        </div>
      </section>

      {error && (
        <section className="mx-auto mt-4 w-full max-w-5xl error-state">
          {error}
        </section>
      )}

      {loading ? (
        <section className="mx-auto mt-4 w-full max-w-5xl surface-content p-4 text-sm font-semibold text-slate-600">
          Preparando avisos...
        </section>
      ) : (
        <section className="mx-auto mt-4 grid w-full max-w-5xl grid-cols-1 gap-3">
          {alerts.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-base font-extrabold text-slate-900">Todo bajo control</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">No hay avisos activos ahora mismo.</p>
            </div>
          )}
          {alerts.map((a) => {
            const card = (
              <article className={`rounded-xl border-2 p-4 ${toneCardClass(a.tone)}`}>
                <p className="inline-flex items-center gap-2 text-sm font-extrabold">
                  <Icon name="alert" className={`h-4 w-4 ${toneIconClass(a.tone)}`} />
                  {a.title}
                </p>
                <p className="mt-1 text-sm font-semibold opacity-90">{a.detail}</p>
              </article>
            );

            if (!a.href) return <div key={a.id}>{card}</div>;

            return (
              <Link key={a.id} href={a.href} data-tap className="btn-tap block">
                {card}
              </Link>
            );
          })}
        </section>
      )}

      <MobileNav />
    </main>
  );
}
