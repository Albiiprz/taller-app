'use client';

import { Role, User } from "./useSession";

export type Appointment = {
  id: string;
  date: string;       // YYYY-MM-DD
  startMin: number;   // minutes from 00:00 (e.g. 540 = 09:00)
  durationMin: number;
  techUserId: string;

  clientName: string;
  clientPhone: string;
  vehiclePlate: string;
  notes?: string;

  createdAt: string;
  otId: string;       // OT creada automáticamente
};

export type DayOff = {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  reason?: string;
};

export const STORAGE_APPOINTMENTS = "taller_appointments_v1";
export const STORAGE_DAYOFF = "taller_dayoff_v1";

// OTs (detectado del proyecto)
export const STORAGE_OTS = "taller_items_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

export function loadAppointments(): Appointment[] {
  if (typeof window === "undefined") return [];
  return safeParse<Appointment[]>(localStorage.getItem(STORAGE_APPOINTMENTS), []);
}

export function saveAppointments(next: Appointment[]) {
  localStorage.setItem(STORAGE_APPOINTMENTS, JSON.stringify(next));
}

export function loadDayOff(): DayOff[] {
  if (typeof window === "undefined") return [];
  return safeParse<DayOff[]>(localStorage.getItem(STORAGE_DAYOFF), []);
}

export function saveDayOff(next: DayOff[]) {
  localStorage.setItem(STORAGE_DAYOFF, JSON.stringify(next));
}

export function getTechUsers(users: User[]): User[] {
  // Técnico o Jefe de Taller cuentan como "técnicos" para la agenda
  return users.filter(u =>
    (u.roles || []).includes("Técnico") || (u.roles || []).includes("Jefe de Taller")
  ).filter(u => u.isActive);
}

export function isOff(userId: string, date: string, dayoff: DayOff[]): boolean {
  return dayoff.some(d => d.userId === userId && d.date === date);
}

export function overlaps(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  const aEnd = aStart + aDur;
  const bEnd = bStart + bDur;
  return aStart < bEnd && bStart < aEnd;
}

export function availableSlotsForTech(opts: {
  date: string;
  techUserId: string;
  durationMin: number;
  appointments: Appointment[];
  dayoff: DayOff[];
  // horario
  workStartMin?: number; // default 08:00
  workEndMin?: number;   // default 18:00
  stepMin?: number;      // default 30
}): number[] {
  const {
    date, techUserId, durationMin, appointments, dayoff,
    workStartMin = 8*60, workEndMin = 18*60, stepMin = 30
  } = opts;

  if (isOff(techUserId, date, dayoff)) return [];

  const myApps = appointments.filter(a => a.techUserId === techUserId && a.date === date);

  const slots: number[] = [];
  for (let t = workStartMin; t + durationMin <= workEndMin; t += stepMin) {
    const clash = myApps.some(a => overlaps(t, durationMin, a.startMin, a.durationMin));
    if (!clash) slots.push(t);
  }
  return slots;
}

export function loadOTs(): any[] {
  if (typeof window === "undefined") return [];
  return safeParse<any[]>(localStorage.getItem(STORAGE_OTS), []);
}

export function saveOTs(next: any[]) {
  localStorage.setItem(STORAGE_OTS, JSON.stringify(next));
}

export function nextOtId(items: any[]): string {
  // Busca máximo numérico en "id" o en "#1234" y suma 1
  let maxId = 1000;
  for (const it of items) {
    const raw = String(it?.id ?? "");
    const m = raw.match(/(\d+)/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n) && n > maxId) maxId = n;
  }
  return String(maxId + 1);
}
