import { AppRole, OtPriority, OtStatus } from './work-order.workflow';

export type WorkOrderRow = {
  id: number;
  plate: string;
  title: string;
  priority: OtPriority;
  status: OtStatus;
  client_id: number | null;
  vehicle_id: number | null;
  assigned_to_user_id: number | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditEventRow = {
  id: number;
  work_order_id: number;
  event_type: string;
  message: string;
  actor_role: AppRole | null;
  actor_name: string | null;
  origin: string;
  reason: string | null;
  before_json: unknown | null;
  after_json: unknown | null;
  created_at: string;
};

export type WorkOrderResponse = {
  id: string;
  plate: string;
  title: string;
  priority: OtPriority;
  status: OtStatus;
  clientId: number | null;
  vehicleId: number | null;
  assignedToUserId: number | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuditEventResponse = {
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

export type WorkOrderNoteRow = {
  id: number;
  work_order_id: number;
  text: string;
  actor_role: AppRole | null;
  actor_name: string | null;
  origin: string;
  created_at: string;
};

export type WorkOrderNoteResponse = {
  id: string;
  workOrderId: string;
  text: string;
  actorRole: AppRole | null;
  actorName: string | null;
  origin: string;
  createdAt: string;
};

export type WorkOrderChecklistRow = {
  work_order_id: number;
  km: string;
  fuel: string;
  damages: boolean;
  damages_text: string;
  has_keys: boolean;
  has_docs: boolean;
  has_tacho_card: boolean;
  tacho_issue: boolean;
  extra: string;
  updated_at: string;
};

export type WorkOrderChecklistResponse = {
  workOrderId: string;
  km: string;
  fuel: string;
  damages: boolean;
  damagesText: string;
  hasKeys: boolean;
  hasDocs: boolean;
  hasTachoCard: boolean;
  tachoIssue: boolean;
  extra: string;
  updatedAt: string;
};

export type WorkOrderTimeRow = {
  work_order_id: number;
  total_seconds: number;
  running: boolean;
  started_at: string | null;
  updated_at: string;
};

export type WorkOrderTimeSessionRow = {
  id: number;
  work_order_id: number;
  started_at: string;
  ended_at: string | null;
  total_seconds: number;
  actor_role: AppRole | null;
  actor_name: string | null;
  origin: string;
  reason: string | null;
  created_at: string;
};

export type WorkOrderTimeSessionResponse = {
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

export type WorkOrderTimeResponse = {
  workOrderId: string;
  totalSeconds: number;
  running: boolean;
  startedAt: string | null;
  updatedAt: string;
  sessions: WorkOrderTimeSessionResponse[];
};

export type ProductRow = {
  id: string;
  name: string;
  description: string;
  stock: number;
  min_stock: number;
  unit: string;
  location: string;
  barcode: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductResponse = {
  id: string;
  name: string;
  description: string;
  stock: number;
  minStock: number;
  unit: string;
  location: string;
  barcode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StockMoveRow = {
  id: number;
  product_id: string;
  qty: number;
  reason: string;
  label: string;
  work_order_id: number | null;
  actor_role: AppRole | null;
  actor_name: string | null;
  origin: string;
  created_at: string;
};

export type StockMoveResponse = {
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

export type StockMoveWithProductRow = StockMoveRow & {
  product_name: string;
  product_unit: string;
};

export type InventoryMoveResponse = {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  qty: number;
  reason: string;
  label: string;
  workOrderId: string | null;
  origin: string;
  createdAt: string;
};
