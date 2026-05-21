import type { InventoryProduct } from "./ordersApi";
import type { OtItem } from "./workflow";
import { statusLabel } from "./workflow";
import type { HelpRequest } from "./helpRequests";

export type AlertTone = "danger" | "warn" | "info" | "ok";
export type AlertItem = {
  id: string;
  title: string;
  detail: string;
  tone: AlertTone;
  href?: string;
};

export function buildAlerts(
  orders: OtItem[],
  products: InventoryProduct[],
  helpRequests: HelpRequest[] = [],
): AlertItem[] {
  const list: AlertItem[] = [];
  const lowStock = products.filter((p) => p.stock <= p.minStock);
  const criticalStock = lowStock.filter((p) => p.stock <= 0);
  const urgentOrders = orders.filter((o) => o.prio === "Urgente" && o.stage !== "CERRADO");
  const pendingDelivery = orders.filter((o) => o.stage === "LISTO_ENTREGA");
  const inRepair = orders.filter((o) => o.stage === "REPARACION");
  const openHelp = helpRequests.filter((x) => x.status === "OPEN");

  if (openHelp.length > 0) {
    list.push({
      id: "help-requests",
      title: `Ayuda solicitada por técnicos: ${openHelp.length}`,
      detail: openHelp
        .slice(0, 3)
        .map((h) => `OT #${h.workOrderId} (${h.technicianName})`)
        .join(" · "),
      tone: "danger",
      href: `/ordenes/${openHelp[0]?.workOrderId ?? ""}`,
    });
  }

  if (criticalStock.length > 0) {
    list.push({
      id: "critical-stock",
      title: `Stock agotado: ${criticalStock.length} item(s)`,
      detail: criticalStock.slice(0, 3).map((p) => `${p.id} (${p.name})`).join(" · "),
      tone: "danger",
      href: "/inventario",
    });
  }

  if (urgentOrders.length > 0) {
    list.push({
      id: "urgent-ots",
      title: `OTs urgentes activas: ${urgentOrders.length}`,
      detail: urgentOrders.slice(0, 3).map((o) => `OT #${o.id} (${statusLabel(o.stage)})`).join(" · "),
      tone: "danger",
      href: "/ordenes",
    });
  }

  if (lowStock.length > 0) {
    list.push({
      id: "low-stock",
      title: `Stock bajo: ${lowStock.length} item(s)`,
      detail: "Conviene reponer hoy para evitar paradas de taller.",
      tone: "warn",
      href: "/inventario",
    });
  }

  if (pendingDelivery.length > 0) {
    list.push({
      id: "pending-delivery",
      title: `Vehículos listos para entrega: ${pendingDelivery.length}`,
      detail: pendingDelivery.slice(0, 3).map((o) => `OT #${o.id}`).join(" · "),
      tone: "info",
      href: "/taller",
    });
  }

  if (inRepair.length > 0) {
    list.push({
      id: "in-repair",
      title: `En reparación ahora: ${inRepair.length}`,
      detail: "Carga actual de taller en curso.",
      tone: "ok",
      href: "/taller",
    });
  }

  if (list.length === 0) {
    list.push({
      id: "all-ok",
      title: "Sin alertas críticas",
      detail: "No hay incidencias prioritarias en este momento.",
      tone: "ok",
    });
  }

  return list;
}

export function getActiveAlertsCount(alerts: AlertItem[]): number {
  return alerts.filter((a) => a.tone === "danger" || a.tone === "warn").length;
}
