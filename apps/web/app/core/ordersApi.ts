import type { OtItem, OtPriority, OtStatus } from "./workflow";
import { getAccessToken, refreshAccessToken } from "./authApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export type AppRole =
  | "Administración"
  | "Oficina"
  | "Jefe de Taller"
  | "Técnico"
  | "Contabilidad"
  | "Inventario";

type ApiWorkOrder = {
  id: string;
  plate: string;
  title: string;
  priority: OtPriority;
  status: OtStatus;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  vehicleModel?: string | null;
  appointmentStart?: string | null;
  appointmentEnd?: string | null;
  appointmentWorkType?: string | null;
  appointmentNotes?: string | null;
  appointmentId?: string | null;
  technicianName?: string | null;
  assignedToUserId?: number | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiAuditEvent = {
  id: string;
  workOrderId: string;
  eventType: string;
  message: string;
  actorRole: AppRole | null;
  actorName: string | null;
  origin: string;
  reason: string | null;
  beforeData: unknown | null;
  afterData: unknown | null;
  createdAt: string;
};

export type WorkOrderAuditEvent = {
  id: string;
  type: "estado" | "nota" | "checklist" | "tiempo" | "presupuesto" | "material";
  message: string;
  actorRole: AppRole | null;
  actorName: string | null;
  origin: string;
  reason: string | null;
  beforeData: unknown | null;
  afterData: unknown | null;
  createdAt: string;
};

type ApiWorkOrderNote = {
  id: string;
  workOrderId: string;
  text: string;
  actorRole: AppRole | null;
  actorName: string | null;
  origin: string;
  createdAt: string;
};

type ApiWorkOrderChecklist = {
  workOrderId: string;
  km: string;
  fuel: "Vacío" | "1/4" | "1/2" | "3/4" | "Lleno";
  damages: boolean;
  damagesText: string;
  hasKeys: boolean;
  hasDocs: boolean;
  hasTachoCard: boolean;
  tachoIssue: boolean;
  extra: string;
  updatedAt: string;
};

type ApiWorkOrderTime = {
  workOrderId: string;
  totalSeconds: number;
  running: boolean;
  startedAt: string | null;
  updatedAt: string;
  sessions: ApiWorkOrderTimeSession[];
};

type ApiWorkOrderTimeSession = {
  id: string;
  workOrderId: string;
  startedAt: string;
  endedAt: string | null;
  totalSeconds: number;
  actorRole: AppRole | null;
  actorName: string | null;
  origin: string;
  reason: string | null;
  createdAt: string;
};

type ApiInventoryProduct = {
  id: string;
  name: string;
  description: string;
  stock: number;
  minStock: number;
  unit: "ud" | "l" | "m";
  location: string;
  barcode: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiConsumeMaterialResponse = {
  product: ApiInventoryProduct;
  move: {
    id: string;
    productId: string;
    qty: number;
    reason: string;
    label: string;
    workOrderId: string | null;
    actorRole: AppRole | null;
    actorName: string | null;
    origin: string;
    createdAt: string;
  };
};

type ApiInventoryMove = {
  id: string;
  productId: string;
  productName: string;
  productUnit: "ud" | "l" | "m";
  qty: number;
  reason: string;
  label: string;
  workOrderId: string | null;
  origin: string;
  createdAt: string;
};

export type WorkOrderNote = {
  id: string;
  text: string;
  actorRole: AppRole | null;
  actorName: string | null;
  origin: string;
  createdAt: string;
};

export type WorkOrderChecklist = {
  km: string;
  fuel: "Vacío" | "1/4" | "1/2" | "3/4" | "Lleno";
  damages: boolean;
  damagesText: string;
  hasKeys: boolean;
  hasDocs: boolean;
  hasTachoCard: boolean;
  tachoIssue: boolean;
  extra: string;
  updatedAt: string;
};

export type WorkOrderTime = {
  totalSeconds: number;
  running: boolean;
  startedAt: string | null;
  updatedAt: string;
  sessions: WorkOrderTimeSession[];
};

export type WorkOrderTimeSession = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  totalSeconds: number;
  actorRole: AppRole | null;
  actorName: string | null;
  origin: string;
  reason: string | null;
  createdAt: string;
};

export type InventoryProduct = {
  id: string;
  name: string;
  description: string;
  stock: number;
  minStock: number;
  unit: "ud" | "l" | "m";
  location: string;
  barcode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryMove = {
  id: string;
  productId: string;
  productName: string;
  productUnit: "ud" | "l" | "m";
  qty: number;
  reason: string;
  label: string;
  workOrderId: string | null;
  origin: string;
  createdAt: string;
};

function mapApiOrderToOtItem(row: ApiWorkOrder): OtItem {
  return {
    id: row.id,
    plate: row.plate,
    title: row.title,
    clientName: row.clientName ?? null,
    clientPhone: row.clientPhone ?? null,
    clientEmail: row.clientEmail ?? null,
    vehicleModel: row.vehicleModel ?? null,
    appointmentStart: row.appointmentStart ?? null,
    appointmentEnd: row.appointmentEnd ?? null,
    appointmentWorkType: row.appointmentWorkType ?? null,
    appointmentNotes: row.appointmentNotes ?? null,
    appointmentId: row.appointmentId ?? null,
    technicianName: row.technicianName ?? null,
    prio: row.priority,
    stage: row.status,
    assignedToUserId: row.assignedToUserId ? String(row.assignedToUserId) : null,
    scheduledStart: row.scheduledStart ?? null,
    scheduledEnd: row.scheduledEnd ?? null,
    createdAt: row.createdAt ?? null,
  };
}

function mapAuditType(eventType: string): WorkOrderAuditEvent["type"] {
  if (eventType === "estado") return "estado";
  if (eventType === "nota") return "nota";
  if (eventType === "checklist") return "checklist";
  if (eventType === "tiempo") return "tiempo";
  if (eventType === "presupuesto") return "presupuesto";
  if (eventType === "material") return "material";
  return "nota";
}

function humanizeApiMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("deb es indicar el motivo") || lower.includes("debes indicar el motivo")) {
    return message;
  }
  if (lower.includes("no se pudo conectar")) {
    return "No se pudo hablar con el sistema. Revisa internet o que el servidor esté encendido.";
  }
  if (lower.includes("unauthorized") || lower.includes("jwt") || lower.includes("token")) {
    return "Tu sesión ya no es válida. Sal y vuelve a entrar.";
  }
  if (lower.includes("not found") || lower.includes("no encontrada")) {
    return "No hemos encontrado ese dato.";
  }
  if (lower.includes("invalid") || lower.includes("inválid")) {
    return "Hay un dato que no es válido. Revísalo y vuelve a intentarlo.";
  }
  if (lower.startsWith("error api")) {
    return "Ha habido un problema al guardar o cargar los datos.";
  }
  return message;
}

async function apiFetch<T>(path: string, init?: RequestInit, triedRefresh = false): Promise<T> {
  const token = getAccessToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new Error("No se pudo hablar con el sistema. Revisa internet o que el servidor esté encendido.");
  }

  if (!res.ok) {
    if (res.status === 401 && !triedRefresh) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return apiFetch<T>(path, init, true);
    }
    let message = `Error API ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body?.message)) message = body.message.join(", ");
      else if (typeof body?.message === "string") message = body.message;
    } catch {
      // ignore body parse errors
    }
    throw new Error(humanizeApiMessage(message));
  }

  return (await res.json()) as T;
}

type ApiWrapped<T> = { statusCode: number; data: T; error?: string | null };

function unwrap<T>(payload: T | ApiWrapped<T>): T {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "statusCode" in (payload as Record<string, unknown>) &&
    "data" in (payload as Record<string, unknown>)
  ) {
    return (payload as ApiWrapped<T>).data;
  }
  return payload as T;
}

export async function listWorkOrders(status?: OtStatus): Promise<OtItem[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const rows = await apiFetch<ApiWorkOrder[]>(`/work-orders${query}`);
  return rows.map(mapApiOrderToOtItem);
}

export async function getWorkOrderById(id: string): Promise<OtItem> {
  const row = await apiFetch<ApiWorkOrder>(`/work-orders/${encodeURIComponent(id)}`);
  return mapApiOrderToOtItem(row);
}

export async function createWorkOrder(input: {
  plate: string;
  title: string;
  priority: OtPriority;
  actorRole?: AppRole;
  actorName?: string;
}): Promise<OtItem> {
  const row = await apiFetch<ApiWorkOrder>("/work-orders", {
    method: "POST",
    body: JSON.stringify({
      plate: input.plate,
      title: input.title,
      priority: input.priority,
      actorRole: input.actorRole,
      actorName: input.actorName,
    }),
  });
  return mapApiOrderToOtItem(row);
}

export async function updateWorkOrderStatus(input: {
  id: string;
  toStatus: OtStatus;
  actorRole: AppRole;
  actorName?: string;
  reason: string;
  force?: boolean;
  origin?: string;
}): Promise<OtItem> {
  const row = await apiFetch<ApiWorkOrder>(`/work-orders/${encodeURIComponent(input.id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      toStatus: input.toStatus,
      actorRole: input.actorRole,
      actorName: input.actorName,
      reason: input.reason,
      force: input.force ?? false,
      origin: input.origin ?? "web",
    }),
  });
  return mapApiOrderToOtItem(row);
}

export async function getWorkOrderAudit(id: string): Promise<WorkOrderAuditEvent[]> {
  const rows = await apiFetch<ApiAuditEvent[]>(`/work-orders/${encodeURIComponent(id)}/audit`);
  return rows.map((row) => ({
    id: row.id,
    type: mapAuditType(row.eventType),
    message: row.message,
    actorRole: row.actorRole,
    actorName: row.actorName,
    origin: row.origin,
    reason: row.reason,
    beforeData: row.beforeData,
    afterData: row.afterData,
    createdAt: row.createdAt,
  }));
}

export async function getWorkOrderNotes(id: string): Promise<WorkOrderNote[]> {
  const rows = await apiFetch<ApiWorkOrderNote[]>(`/work-orders/${encodeURIComponent(id)}/notes`);
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    actorRole: row.actorRole,
    actorName: row.actorName,
    origin: row.origin,
    createdAt: row.createdAt,
  }));
}

export async function createWorkOrderNote(input: {
  id: string;
  text: string;
  actorRole?: AppRole;
  actorName?: string;
  origin?: string;
}): Promise<WorkOrderNote> {
  const row = await apiFetch<ApiWorkOrderNote>(`/work-orders/${encodeURIComponent(input.id)}/notes`, {
    method: "POST",
    body: JSON.stringify({
      text: input.text,
      actorRole: input.actorRole,
      actorName: input.actorName,
      origin: input.origin ?? "web",
    }),
  });
  return {
    id: row.id,
    text: row.text,
    actorRole: row.actorRole,
    actorName: row.actorName,
    origin: row.origin,
    createdAt: row.createdAt,
  };
}

export async function getWorkOrderChecklist(id: string): Promise<WorkOrderChecklist> {
  const row = await apiFetch<ApiWorkOrderChecklist>(`/work-orders/${encodeURIComponent(id)}/checklist`);
  return {
    km: row.km,
    fuel: row.fuel,
    damages: row.damages,
    damagesText: row.damagesText,
    hasKeys: row.hasKeys,
    hasDocs: row.hasDocs,
    hasTachoCard: row.hasTachoCard,
    tachoIssue: row.tachoIssue,
    extra: row.extra,
    updatedAt: row.updatedAt,
  };
}

export async function upsertWorkOrderChecklist(input: {
  id: string;
  checklist: Partial<WorkOrderChecklist>;
  actorRole?: AppRole;
  actorName?: string;
  reason?: string;
  origin?: string;
}): Promise<WorkOrderChecklist> {
  const row = await apiFetch<ApiWorkOrderChecklist>(`/work-orders/${encodeURIComponent(input.id)}/checklist`, {
    method: "PATCH",
    body: JSON.stringify({
      ...input.checklist,
      actorRole: input.actorRole,
      actorName: input.actorName,
      reason: input.reason,
      origin: input.origin ?? "web",
    }),
  });

  return {
    km: row.km,
    fuel: row.fuel,
    damages: row.damages,
    damagesText: row.damagesText,
    hasKeys: row.hasKeys,
    hasDocs: row.hasDocs,
    hasTachoCard: row.hasTachoCard,
    tachoIssue: row.tachoIssue,
    extra: row.extra,
    updatedAt: row.updatedAt,
  };
}

export async function getWorkOrderTime(id: string): Promise<WorkOrderTime> {
  const row = await apiFetch<ApiWorkOrderTime>(`/work-orders/${encodeURIComponent(id)}/time`);
  return {
    totalSeconds: row.totalSeconds,
    running: row.running,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    sessions: row.sessions.map((session) => ({
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      totalSeconds: session.totalSeconds,
      actorRole: session.actorRole,
      actorName: session.actorName,
      origin: session.origin,
      reason: session.reason,
      createdAt: session.createdAt,
    })),
  };
}

export async function startWorkOrderTime(input: {
  id: string;
  actorRole?: AppRole;
  actorName?: string;
  reason?: string;
  origin?: string;
}): Promise<WorkOrderTime> {
  const row = await apiFetch<ApiWorkOrderTime>(`/work-orders/${encodeURIComponent(input.id)}/time/start`, {
    method: "POST",
    body: JSON.stringify({
      actorRole: input.actorRole,
      actorName: input.actorName,
      reason: input.reason,
      origin: input.origin ?? "web",
    }),
  });
  return {
    totalSeconds: row.totalSeconds,
    running: row.running,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    sessions: row.sessions.map((session) => ({
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      totalSeconds: session.totalSeconds,
      actorRole: session.actorRole,
      actorName: session.actorName,
      origin: session.origin,
      reason: session.reason,
      createdAt: session.createdAt,
    })),
  };
}

export async function stopWorkOrderTime(input: {
  id: string;
  actorRole?: AppRole;
  actorName?: string;
  reason?: string;
  origin?: string;
}): Promise<WorkOrderTime> {
  const row = await apiFetch<ApiWorkOrderTime>(`/work-orders/${encodeURIComponent(input.id)}/time/stop`, {
    method: "POST",
    body: JSON.stringify({
      actorRole: input.actorRole,
      actorName: input.actorName,
      reason: input.reason,
      origin: input.origin ?? "web",
    }),
  });
  return {
    totalSeconds: row.totalSeconds,
    running: row.running,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    sessions: row.sessions.map((session) => ({
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      totalSeconds: session.totalSeconds,
      actorRole: session.actorRole,
      actorName: session.actorName,
      origin: session.origin,
      reason: session.reason,
      createdAt: session.createdAt,
    })),
  };
}

export async function listInventoryProducts(): Promise<InventoryProduct[]> {
  const raw = await apiFetch<ApiInventoryProduct[] | ApiWrapped<ApiInventoryProduct[]>>("/work-orders/inventory/products");
  return unwrap(raw);
}

export async function findInventoryProductByBarcode(barcode: string): Promise<InventoryProduct> {
  const raw = await apiFetch<ApiInventoryProduct | ApiWrapped<ApiInventoryProduct>>(
    `/work-orders/inventory/products/by-barcode/${encodeURIComponent(barcode)}`,
  );
  return unwrap(raw);
}

export async function createInventoryProduct(input: {
  id: string;
  name: string;
  description?: string;
  stock?: number;
  minStock?: number;
  unit?: "ud" | "l" | "m";
  location?: string;
  barcode?: string;
}): Promise<InventoryProduct> {
  const raw = await apiFetch<ApiInventoryProduct | ApiWrapped<ApiInventoryProduct>>("/work-orders/inventory/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return unwrap(raw);
}

export async function updateInventoryProduct(input: {
  id: string;
  name?: string;
  description?: string;
  minStock?: number;
  unit?: "ud" | "l" | "m";
  location?: string;
  barcode?: string;
}): Promise<InventoryProduct> {
  const raw = await apiFetch<ApiInventoryProduct | ApiWrapped<ApiInventoryProduct>>(
    `/work-orders/inventory/products/${encodeURIComponent(input.id)}`,
    {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      minStock: input.minStock,
      unit: input.unit,
      location: input.location,
      barcode: input.barcode,
    }),
  });
  return unwrap(raw);
}

export async function adjustInventoryStock(input: {
  id: string;
  delta: number;
  reason?: string;
  origin?: string;
}): Promise<{ product: InventoryProduct }> {
  const raw = await apiFetch<{ product: ApiInventoryProduct } | ApiWrapped<{ product: ApiInventoryProduct }>>(
    `/work-orders/inventory/products/${encodeURIComponent(input.id)}/adjust`,
    {
    method: "POST",
    body: JSON.stringify({
      delta: input.delta,
      reason: input.reason,
      origin: input.origin ?? "web",
    }),
  });
  const res = unwrap(raw);
  return {
    product: res.product,
  };
}

export type AvailabilityTechnicianDay = {
  technicianId: string;
  name: string;
  dayStatus: "GREEN" | "YELLOW" | "RED";
  slots: {
    morning: Array<{ startAt: string; endAt: string }>;
    afternoon: Array<{ startAt: string; endAt: string }>;
  };
};

export type AvailabilityDayDetail = {
  date: string;
  status: "GREEN" | "YELLOW" | "RED";
  morningSlots: Array<{ startAt: string; endAt: string }>;
  afternoonSlots: Array<{ startAt: string; endAt: string }>;
};

export type AppointmentCreateInput = {
  client: { name: string; phone: string; email?: string; type?: string };
  vehicle?: { plate?: string; vin?: string; model?: string; notes?: string };
  technicianId: string;
  startAt: string;
  endAt?: string;
  durationMinutes?: number;
  workType: string;
  notes?: string;
};

export type AppointmentCreateResponse = {
  appointment: {
    id: string;
    status: "ACTIVE" | "CANCELLED" | "DRAFT";
    technicianId: string;
    workOrderId: string;
    startAt: string;
    endAt: string;
  };
  workOrder: {
    id: string;
    status: string;
    assignedTo: string;
    scheduledStart: string;
    scheduledEnd: string;
  };
  whatsappUrl: string;
  whatsappAutoSent?: boolean;
  googleCalendar?: {
    enabled: boolean;
    synced: boolean;
    action: "created" | "updated" | "skipped" | "failed";
    eventId: string | null;
    eventUrl: string | null;
    error: string | null;
  };
};

export type AppointmentDraftInput = {
  client?: { name?: string; phone?: string; email?: string; company?: string; type?: string };
  vehicle?: { plate?: string; vin?: string; model?: string; notes?: string };
  workType?: string;
  notes?: string;
};

export type AppointmentDraftResponse = {
  appointment: AppointmentDetail;
  createdAsDraft: boolean;
};

export type AppointmentDetail = {
  id: string;
  status: "ACTIVE" | "CANCELLED" | "DRAFT";
  technicianId: string | null;
  workOrderId: string | null;
  startAt: string | null;
  endAt: string | null;
  workType: string | null;
  notes: string;
  client: {
    name: string | null;
    phone: string | null;
    email: string | null;
    company: string | null;
  };
  vehicle: {
    plate: string | null;
    vin: string | null;
    model: string | null;
    notes: string | null;
  };
  createdAt: string;
};

export type CalendarSummaryItem = {
  technicianId: string;
  name: string;
  blocks: Array<{
    id: string;
    technicianId: string;
    type: "APPOINTMENT" | "VACATION" | "INTERNAL";
    startAt: string;
    endAt: string;
    sourceId: string | null;
    isActive: boolean;
    note: string;
    createdAt: string;
    appointment?: {
      workType: string | null;
      notes: string | null;
      clientName: string | null;
      clientPhone: string | null;
      vehiclePlate: string | null;
      workOrderId: string | null;
      workOrderTitle: string | null;
      workOrderStatus: string | null;
    } | null;
  }>;
};

export type ApiUserRecord = {
  id: string;
  name: string;
  role: AppRole;
  roles?: AppRole[];
  login: string;
  pin?: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  extra?: string | null;
  avatarDataUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function getTechniciansAvailabilityByDate(input: {
  date: string;
  durationMinutes: number;
}): Promise<AvailabilityTechnicianDay[]> {
  const raw = await apiFetch<AvailabilityTechnicianDay[] | ApiWrapped<AvailabilityTechnicianDay[]>>(
    `/availability/technicians?date=${encodeURIComponent(input.date)}&durationMinutes=${encodeURIComponent(String(input.durationMinutes))}`,
  );
  return unwrap(raw);
}

export async function getTechnicianAvailabilityRange(input: {
  technicianId: string;
  from: string;
  to: string;
  durationMinutes: number;
}): Promise<AvailabilityDayDetail[]> {
  const raw = await apiFetch<AvailabilityDayDetail[] | ApiWrapped<AvailabilityDayDetail[]>>(
    `/availability/technicians/${encodeURIComponent(input.technicianId)}?from=${encodeURIComponent(input.from)}&to=${encodeURIComponent(input.to)}&durationMinutes=${encodeURIComponent(String(input.durationMinutes))}`,
  );
  return unwrap(raw);
}

export async function createAppointment(input: AppointmentCreateInput): Promise<AppointmentCreateResponse> {
  const raw = await apiFetch<AppointmentCreateResponse | ApiWrapped<AppointmentCreateResponse>>("/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return unwrap(raw);
}

export async function createAppointmentDraft(input: AppointmentDraftInput): Promise<AppointmentDraftResponse> {
  const raw = await apiFetch<AppointmentDraftResponse | ApiWrapped<AppointmentDraftResponse>>("/appointments/draft", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return unwrap(raw);
}

export async function cancelAppointment(input: { id: string; reason?: string }): Promise<{
  cancelled: boolean;
  googleCalendar?: {
    enabled: boolean;
    deleted: boolean;
    action: "deleted" | "skipped" | "failed";
    error: string | null;
  };
}> {
  const raw = await apiFetch<
    {
      cancelled: boolean;
      googleCalendar?: {
        enabled: boolean;
        deleted: boolean;
        action: "deleted" | "skipped" | "failed";
        error: string | null;
      };
    } |
    ApiWrapped<{
      cancelled: boolean;
      googleCalendar?: {
        enabled: boolean;
        deleted: boolean;
        action: "deleted" | "skipped" | "failed";
        error: string | null;
      };
    }>
  >(
    `/appointments/${encodeURIComponent(input.id)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ reason: input.reason }),
    },
  );
  return unwrap(raw);
}

export async function getAppointment(input: { id: string }): Promise<AppointmentDetail> {
  const raw = await apiFetch<AppointmentDetail | ApiWrapped<AppointmentDetail>>(
    `/appointments/${encodeURIComponent(input.id)}`,
  );
  return unwrap(raw);
}

export async function updateAppointment(input: {
  id: string;
  client?: { name?: string; phone?: string; email?: string; company?: string; type?: string };
  vehicle?: { plate?: string; vin?: string; model?: string; notes?: string };
  technicianId?: string;
  startAt?: string;
  endAt?: string;
  durationMinutes?: number;
  workType?: string;
  notes?: string;
}): Promise<{
  appointment: AppointmentDetail;
  whatsappUrl: string | null;
  whatsappAutoSent?: boolean;
  googleCalendar?: {
    enabled: boolean;
    synced: boolean;
    action: "created" | "updated" | "skipped" | "failed";
    eventId: string | null;
    eventUrl: string | null;
    error: string | null;
  };
}> {
  const raw = await apiFetch<
    {
      appointment: AppointmentDetail;
      whatsappUrl: string | null;
      whatsappAutoSent?: boolean;
      googleCalendar?: {
        enabled: boolean;
        synced: boolean;
        action: "created" | "updated" | "skipped" | "failed";
        eventId: string | null;
        eventUrl: string | null;
        error: string | null;
      };
    } |
    ApiWrapped<{
      appointment: AppointmentDetail;
      whatsappUrl: string | null;
      whatsappAutoSent?: boolean;
      googleCalendar?: {
        enabled: boolean;
        synced: boolean;
        action: "created" | "updated" | "skipped" | "failed";
        eventId: string | null;
        eventUrl: string | null;
        error: string | null;
      };
    }>
  >(`/appointments/${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return unwrap(raw);
}

export async function getCalendarSummary(input: { from: string; to: string }): Promise<CalendarSummaryItem[]> {
  const raw = await apiFetch<CalendarSummaryItem[] | ApiWrapped<CalendarSummaryItem[]>>(
    `/calendar/summary?from=${encodeURIComponent(input.from)}&to=${encodeURIComponent(input.to)}`,
  );
  return unwrap(raw);
}

export async function createTechnicianTimeBlock(input: {
  technicianId: string;
  type: "VACATION" | "INTERNAL";
  startAt: string;
  endAt: string;
  note?: string;
}) {
  const raw = await apiFetch<unknown | ApiWrapped<unknown>>(
    `/technicians/${encodeURIComponent(input.technicianId)}/time-blocks`,
    {
      method: "POST",
      body: JSON.stringify({
        type: input.type,
        startAt: input.startAt,
        endAt: input.endAt,
        note: input.note,
      }),
    },
  );
  return unwrap(raw);
}

export async function deleteTechnicianTimeBlock(input: { technicianId: string; blockId: string }) {
  const raw = await apiFetch<unknown | ApiWrapped<unknown>>(
    `/technicians/${encodeURIComponent(input.technicianId)}/time-blocks/${encodeURIComponent(input.blockId)}`,
    { method: "DELETE" },
  );
  return unwrap(raw);
}

export type ScheduleRule = {
  id: string;
  technicianId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  weekPattern: "ALL" | "A" | "B";
  isActive: boolean;
  createdAt: string;
};

export async function listTechnicianScheduleRules(input: { technicianId: string }): Promise<ScheduleRule[]> {
  const raw = await apiFetch<ScheduleRule[] | ApiWrapped<ScheduleRule[]>>(
    `/technicians/${encodeURIComponent(input.technicianId)}/schedule-rules`,
  );
  return unwrap(raw);
}

export async function createTechnicianScheduleRule(input: {
  technicianId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  weekPattern?: "ALL" | "A" | "B";
  isActive?: boolean;
}): Promise<ScheduleRule> {
  const raw = await apiFetch<ScheduleRule | ApiWrapped<ScheduleRule>>(
    `/technicians/${encodeURIComponent(input.technicianId)}/schedule-rules`,
    {
      method: "POST",
      body: JSON.stringify({
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        weekPattern: input.weekPattern,
        isActive: input.isActive ?? true,
      }),
    },
  );
  return unwrap(raw);
}

export async function applyMaluScheduleRotation(): Promise<{ ok: boolean; weekAParity: string; note: string }> {
  const raw = await apiFetch<
    { ok: boolean; weekAParity: string; note: string } | ApiWrapped<{ ok: boolean; weekAParity: string; note: string }>
  >("/schedule-rotation/malu/apply", { method: "POST" });
  return unwrap(raw);
}

export async function deleteTechnicianScheduleRule(input: { technicianId: string; ruleId: string }) {
  const raw = await apiFetch<unknown | ApiWrapped<unknown>>(
    `/technicians/${encodeURIComponent(input.technicianId)}/schedule-rules/${encodeURIComponent(input.ruleId)}`,
    { method: "DELETE" },
  );
  return unwrap(raw);
}

export async function listUsers(input?: { includeInactive?: boolean; role?: string }): Promise<ApiUserRecord[]> {
  const params = new URLSearchParams();
  if (input?.includeInactive) params.set("includeInactive", "true");
  if (input?.role) params.set("role", input.role);
  const qs = params.toString();
  const raw = await apiFetch<ApiUserRecord[] | ApiWrapped<ApiUserRecord[]>>(`/users${qs ? `?${qs}` : ""}`);
  return unwrap(raw);
}

export async function createUser(input: {
  name: string;
  role?: AppRole;
  roles?: AppRole[];
  login: string;
  pin: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  extra?: string;
  avatarDataUrl?: string;
  isActive?: boolean;
}): Promise<ApiUserRecord> {
  const raw = await apiFetch<ApiUserRecord | ApiWrapped<ApiUserRecord>>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return unwrap(raw);
}

export async function updateUser(input: {
  id: string;
  name?: string;
  role?: AppRole;
  roles?: AppRole[];
  login?: string;
  pin?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  extra?: string;
  avatarDataUrl?: string;
  isActive?: boolean;
}): Promise<ApiUserRecord> {
  const raw = await apiFetch<ApiUserRecord | ApiWrapped<ApiUserRecord>>(`/users/${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return unwrap(raw);
}

export async function deleteUser(input: { id: string }): Promise<{ deleted: boolean }> {
  const raw = await apiFetch<{ deleted: boolean } | ApiWrapped<{ deleted: boolean }>>(
    `/users/${encodeURIComponent(input.id)}`,
    { method: "DELETE" },
  );
  return unwrap(raw);
}

export async function listInventoryMoves(limit = 25): Promise<InventoryMove[]> {
  return apiFetch<ApiInventoryMove[]>(`/work-orders/inventory/moves?limit=${encodeURIComponent(String(limit))}`);
}

export async function consumeWorkOrderMaterial(input: {
  id: string;
  productId: string;
  qty: number;
  actorRole?: AppRole;
  actorName?: string;
  reason: string;
  label?: string;
  origin?: string;
}): Promise<ApiConsumeMaterialResponse> {
  return apiFetch<ApiConsumeMaterialResponse>(`/work-orders/${encodeURIComponent(input.id)}/consume`, {
    method: "POST",
    body: JSON.stringify({
      productId: input.productId,
      qty: input.qty,
      actorRole: input.actorRole,
      actorName: input.actorName,
      reason: input.reason,
      label: input.label,
      origin: input.origin ?? "web",
    }),
  });
}

// ── Clients ──────────────────────────────────────────────────────────────────

export type ClientSummary = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  created_at: string;
  plates: string[];
  models: string[];
  last_appointment: string | null;
};

export type ClientDetail = ClientSummary & {
  vehicles: Array<{ id: number; plate: string; model: string | null; vin: string | null; vehicle_type: string | null; created_at: string }>;
  appointments: Array<{ id: number; work_type: string | null; start_at: string | null; status: string; plate: string | null }>;
};

export async function searchClients(q: string): Promise<ClientSummary[]> {
  if (!q.trim()) return [];
  const res = await apiFetch<{ data: ClientSummary[] }>(`/clients?q=${encodeURIComponent(q)}&limit=10`);
  return res.data ?? [];
}

export async function getClient(id: number): Promise<ClientDetail | null> {
  const res = await apiFetch<{ data: ClientDetail | null }>(`/clients/${id}`);
  return res.data ?? null;
}

export async function updateClient(id: number, data: { name?: string; phone?: string; email?: string; company?: string }): Promise<ClientDetail | null> {
  const res = await apiFetch<{ data: ClientDetail | null }>(`/clients/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.data ?? null;
}
