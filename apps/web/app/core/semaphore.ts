export type SemaphoreStatus = "GREEN" | "YELLOW" | "RED";

export function semaphoreBadgeClass(status: SemaphoreStatus): string {
  if (status === "GREEN") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (status === "YELLOW") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-rose-300 bg-rose-50 text-rose-900";
}

export function semaphorePlainLabel(status: SemaphoreStatus): string {
  if (status === "GREEN") return "Disponible";
  if (status === "YELLOW") return "Limitado";
  return "Sin hueco";
}

export function stockSemaphore(stock: number, minStock: number): SemaphoreStatus {
  if (stock <= minStock) return "RED";
  if (stock <= minStock * 1.4) return "YELLOW";
  return "GREEN";
}

