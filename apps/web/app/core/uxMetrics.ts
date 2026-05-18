import type { Role } from "../components/useSession";

const METRICS_STORAGE = "taller_ux_metrics_v1";

export type UxEvent = {
  id: string;
  name: string;
  at: string;
  role?: Role;
  ok?: boolean;
  durationMs?: number;
  meta?: Record<string, string | number | boolean | null>;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function readUxEvents(): UxEvent[] {
  if (typeof window === "undefined") return [];
  return safeParse<UxEvent[]>(localStorage.getItem(METRICS_STORAGE), []);
}

export function trackUxEvent(event: Omit<UxEvent, "id" | "at">) {
  if (typeof window === "undefined") return;
  const rows = readUxEvents();
  const next: UxEvent = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    ...event,
  };
  const trimmed = [next, ...rows].slice(0, 1500);
  localStorage.setItem(METRICS_STORAGE, JSON.stringify(trimmed));
}

export function buildUxSummary(events: UxEvent[]) {
  const successAppointments = events.filter((e) => e.name === "appointment_create" && e.ok && typeof e.durationMs === "number");
  const techStarts = events.filter((e) => e.name === "tech_start_task" && e.ok && typeof e.durationMs === "number");
  const errors = events.filter((e) => e.ok === false);

  const avg = (arr: number[]) => {
    if (arr.length === 0) return null;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  };

  const appointmentAvgMs = avg(successAppointments.map((e) => e.durationMs as number));
  const techStartAvgMs = avg(techStarts.map((e) => e.durationMs as number));

  return {
    total: events.length,
    errors: errors.length,
    appointmentCreateAvgSec: appointmentAvgMs ? Math.round(appointmentAvgMs / 1000) : null,
    techStartAvgSec: techStartAvgMs ? Math.round(techStartAvgMs / 1000) : null,
    successRate:
      events.length > 0
        ? Math.round(((events.length - errors.length) / events.length) * 100)
        : null,
  };
}

