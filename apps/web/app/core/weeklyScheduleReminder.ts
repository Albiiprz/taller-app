function toLocalYmd(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function plusDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isWeeklyReminderDay(date: Date): boolean {
  const day = date.getDay(); // 1 Monday, 5 Friday
  return day === 1 || day === 5;
}

export function getWeekMonday(date: Date): Date {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day; // move to Monday
  return plusDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), offset);
}

export function getReminderTargetMonday(date: Date): string {
  const day = date.getDay();
  const monday = getWeekMonday(date);
  // Friday reminder is for next week planning.
  if (day === 5) return toLocalYmd(plusDays(monday, 7));
  return toLocalYmd(monday);
}

export function getReminderDoneKey(targetMondayYmd: string): string {
  return `weekly_schedule_done_${targetMondayYmd}`;
}

export function isReminderDone(targetMondayYmd: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(getReminderDoneKey(targetMondayYmd)) === "1";
}

export function markReminderDone(targetMondayYmd: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getReminderDoneKey(targetMondayYmd), "1");
}

