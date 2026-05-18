import type { OtItem } from "./workflow";

export const ORDERS_STORAGE_KEY = "taller_items_v1";

export function parseOrders(raw: string | null): OtItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OtItem[]) : [];
  } catch {
    return [];
  }
}

export function loadOrders(): OtItem[] {
  if (typeof window === "undefined") return [];
  return parseOrders(localStorage.getItem(ORDERS_STORAGE_KEY));
}

export function saveOrders(next: OtItem[]) {
  localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next));
}

export function nextOrderId(items: OtItem[]): string {
  let maxId = 1000;
  items.forEach((it) => {
    const n = parseInt(it.id, 10);
    if (!Number.isNaN(n) && n > maxId) maxId = n;
  });
  return String(maxId + 1);
}
