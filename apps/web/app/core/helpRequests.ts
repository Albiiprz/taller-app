export type HelpRequest = {
  id: string;
  workOrderId: string;
  plate: string;
  technicianName: string;
  message: string;
  createdAt: string;
  status: "OPEN" | "DONE";
};

const STORAGE_KEY = "taller_help_requests_v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readAll(): HelpRequest[] {
  if (typeof window === "undefined") return [];
  const rows = safeParse<HelpRequest[]>(localStorage.getItem(STORAGE_KEY), []);
  return Array.isArray(rows) ? rows : [];
}

function saveAll(rows: HelpRequest[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 200)));
}

export function listOpenHelpRequests(): HelpRequest[] {
  return readAll().filter((x) => x.status === "OPEN");
}

export function createHelpRequest(input: {
  workOrderId: string;
  plate: string;
  technicianName: string;
  message: string;
}): HelpRequest {
  const next: HelpRequest = {
    id: `help_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    workOrderId: input.workOrderId,
    plate: input.plate,
    technicianName: input.technicianName,
    message: input.message,
    createdAt: new Date().toISOString(),
    status: "OPEN",
  };
  const rows = readAll();
  saveAll([next, ...rows]);
  return next;
}

export function resolveHelpRequestsByOrder(workOrderId: string) {
  const rows = readAll();
  const next = rows.map((x) => (x.workOrderId === workOrderId ? { ...x, status: "DONE" as const } : x));
  saveAll(next);
}

