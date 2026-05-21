import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { CreateWorkOrderNoteDto } from './dto/create-work-order-note.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto';
import { UpsertWorkOrderChecklistDto } from './dto/upsert-work-order-checklist.dto';
import { WorkOrderTimeActionDto } from './dto/work-order-time-action.dto';
import { ConsumeWorkOrderMaterialDto } from './dto/consume-work-order-material.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import {
  canMoveByRoleAndFlow,
  canRoleMoveTo,
  isAppRole,
  isOtPriority,
  isOtStatus,
  type AppRole,
  type OtStatus,
} from './work-order.workflow';
import {
  type AuditEventResponse,
  type AuditEventRow,
  type WorkOrderResponse,
  type WorkOrderRow,
  type WorkOrderChecklistResponse,
  type WorkOrderChecklistRow,
  type WorkOrderNoteResponse,
  type WorkOrderNoteRow,
  type WorkOrderTimeResponse,
  type WorkOrderTimeRow,
  type WorkOrderTimeSessionResponse,
  type WorkOrderTimeSessionRow,
  type ProductResponse,
  type ProductRow,
  type InventoryMoveResponse,
  type StockMoveResponse,
  type StockMoveWithProductRow,
  type StockMoveRow,
} from './work-order.types';

type WorkOrderDetailRow = WorkOrderRow & {
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  vehicle_model: string | null;
  appointment_start: string | null;
  appointment_end: string | null;
  appointment_work_type: string | null;
  appointment_notes: string | null;
  appointment_id: number | null;
  technician_name: string | null;
};

@Injectable()
export class WorkOrdersService {
  constructor(private readonly db: DatabaseService) {}

  private readonly workOrderDetailSelect = `
    SELECT wo.*,
           c.name AS client_name,
           c.phone AS client_phone,
           c.email AS client_email,
           v.vehicle_type AS vehicle_model,
           ap.start_at AS appointment_start,
           ap.end_at AS appointment_end,
           ap.work_type AS appointment_work_type,
           ap.notes AS appointment_notes,
           ap.id AS appointment_id,
           tech.name AS technician_name
    FROM work_orders wo
    LEFT JOIN clients c ON c.id = wo.client_id
    LEFT JOIN vehicles v ON v.id = wo.vehicle_id
    LEFT JOIN LATERAL (
      SELECT a.*
      FROM appointments a
      WHERE a.work_order_id = wo.id
      ORDER BY a.created_at DESC
      LIMIT 1
    ) ap ON TRUE
    LEFT JOIN users tech ON tech.id = ap.technician_id
  `;

  async list(status?: string): Promise<WorkOrderResponse[]> {
    let query = this.workOrderDetailSelect;
    const values: unknown[] = [];

    if (status) {
      if (!isOtStatus(status)) {
        throw new BadRequestException(`Estado inválido: ${status}`);
      }
      query += ' WHERE wo.status = $1';
      values.push(status);
    }

    query += ' ORDER BY wo.created_at DESC';

    const res = await this.db.query<WorkOrderDetailRow>(query, values);
    return res.rows.map((row) => this.toWorkOrderResponse(row));
  }

  async findOne(id: string): Promise<WorkOrderResponse> {
    const numericId = this.parseId(id);
    const res = await this.db.query<WorkOrderDetailRow>(
      `${this.workOrderDetailSelect} WHERE wo.id = $1`,
      [numericId],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException(`OT #${id} no encontrada`);
    return this.toWorkOrderResponse(row);
  }

  async getAudit(workOrderId: string): Promise<AuditEventResponse[]> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);

    const res = await this.db.query<AuditEventRow>(
      'SELECT * FROM audit_events WHERE work_order_id = $1 ORDER BY created_at DESC',
      [numericId],
    );

    return res.rows.map((row) => this.toAuditEventResponse(row));
  }

  async create(dto: CreateWorkOrderDto): Promise<WorkOrderResponse> {
    if (!dto.plate?.trim()) throw new BadRequestException('plate es obligatorio');
    if (!dto.title?.trim()) throw new BadRequestException('title es obligatorio');
    if (!isOtPriority(dto.priority)) throw new BadRequestException('priority inválida');

    const initialStatus = dto.status ?? 'RECEPCION';
    if (!isOtStatus(initialStatus)) throw new BadRequestException('status inválido');

    const insert = await this.db.query<WorkOrderRow>(
      `INSERT INTO work_orders (plate, title, priority, status, client_id, vehicle_id, assigned_to_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        dto.plate.trim().toUpperCase(),
        dto.title.trim(),
        dto.priority,
        initialStatus,
        dto.clientId ?? null,
        dto.vehicleId ?? null,
        dto.assignedToUserId ?? null,
      ],
    );

    const created = insert.rows[0];

    await this.pushAudit({
      workOrderId: created.id,
      eventType: 'estado',
      message: `OT creada en estado ${created.status}`,
      actorRole: this.parseActorRole(dto.actorRole),
      actorName: dto.actorName ?? null,
      origin: 'web',
      afterData: {
        status: created.status,
        plate: created.plate,
        title: created.title,
        priority: created.priority,
      },
    });

    return this.findOne(String(created.id));
  }

  async updateStatus(id: string, dto: UpdateWorkOrderStatusDto): Promise<WorkOrderResponse> {
    const numericId = this.parseId(id);
    if (!isOtStatus(dto.toStatus)) throw new BadRequestException('toStatus inválido');
    const reason = (dto.reason ?? '').trim();
    if (!reason) throw new BadRequestException('Debes indicar el motivo del cambio de estado');

    const role = this.parseActorRole(dto.actorRole);
    if (!role) throw new BadRequestException('actorRole es obligatorio para cambiar estado');

    const currentRes = await this.db.query<WorkOrderRow>('SELECT * FROM work_orders WHERE id = $1', [numericId]);
    const current = currentRes.rows[0];
    if (!current) throw new NotFoundException(`OT #${id} no encontrada`);

    const normalAllowed = canMoveByRoleAndFlow(role, current.status, dto.toStatus);
    const forceAllowedByRole = role === 'Administración' || role === 'Oficina' || role === 'Jefe de Taller';
    const forceAllowed = dto.force === true && forceAllowedByRole && canRoleMoveTo(role, dto.toStatus);
    if (!normalAllowed && !forceAllowed) {
      throw new BadRequestException(
        `Transición no permitida: ${current.status} -> ${dto.toStatus} para rol ${role}`,
      );
    }

    const updatedRes = await this.db.query<WorkOrderRow>(
      'UPDATE work_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [dto.toStatus, numericId],
    );

    const updated = updatedRes.rows[0];

    await this.pushAudit({
      workOrderId: numericId,
      eventType: 'estado',
      message: `${forceAllowed ? 'Estado corregido' : 'Estado cambiado'} ${current.status} -> ${dto.toStatus}`,
      actorRole: role,
      actorName: dto.actorName ?? null,
      origin: this.normalizeOrigin(dto.origin),
      reason,
      beforeData: { status: current.status },
      afterData: { status: dto.toStatus },
    });

    return this.findOne(String(updated.id));
  }

  async getNotes(workOrderId: string): Promise<WorkOrderNoteResponse[]> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);

    const res = await this.db.query<WorkOrderNoteRow>(
      'SELECT * FROM work_order_notes WHERE work_order_id = $1 ORDER BY created_at DESC',
      [numericId],
    );
    return res.rows.map((row) => this.toWorkOrderNoteResponse(row));
  }

  async createNote(workOrderId: string, dto: CreateWorkOrderNoteDto): Promise<WorkOrderNoteResponse> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);
    if (!dto.text?.trim()) throw new BadRequestException('text es obligatorio');

    const role = this.parseActorRole(dto.actorRole);

    const inserted = await this.db.query<WorkOrderNoteRow>(
      `INSERT INTO work_order_notes (work_order_id, text, actor_role, actor_name, origin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [numericId, dto.text.trim(), role, dto.actorName ?? null, this.normalizeOrigin(dto.origin)],
    );

    await this.pushAudit({
      workOrderId: numericId,
      eventType: 'nota',
      message: 'Nota añadida',
      actorRole: role,
      actorName: dto.actorName ?? null,
      origin: this.normalizeOrigin(dto.origin),
      afterData: { text: dto.text.trim() },
    });

    return this.toWorkOrderNoteResponse(inserted.rows[0]);
  }

  async getChecklist(workOrderId: string): Promise<WorkOrderChecklistResponse> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);

    const res = await this.db.query<WorkOrderChecklistRow>(
      'SELECT * FROM work_order_checklists WHERE work_order_id = $1',
      [numericId],
    );

    if (res.rows[0]) return this.toWorkOrderChecklistResponse(res.rows[0]);

    const inserted = await this.db.query<WorkOrderChecklistRow>(
      `INSERT INTO work_order_checklists (work_order_id)
       VALUES ($1)
       RETURNING *`,
      [numericId],
    );

    return this.toWorkOrderChecklistResponse(inserted.rows[0]);
  }

  async upsertChecklist(
    workOrderId: string,
    dto: UpsertWorkOrderChecklistDto,
  ): Promise<WorkOrderChecklistResponse> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);

    const current = await this.getChecklist(workOrderId);
    const role = this.parseActorRole(dto.actorRole);

    const next = {
      km: dto.km ?? current.km,
      fuel: dto.fuel ?? current.fuel,
      damages: dto.damages ?? current.damages,
      damagesText: dto.damagesText ?? current.damagesText,
      hasKeys: dto.hasKeys ?? current.hasKeys,
      hasDocs: dto.hasDocs ?? current.hasDocs,
      hasTachoCard: dto.hasTachoCard ?? current.hasTachoCard,
      tachoIssue: dto.tachoIssue ?? current.tachoIssue,
      extra: dto.extra ?? current.extra,
    };

    const updated = await this.db.query<WorkOrderChecklistRow>(
      `UPDATE work_order_checklists
       SET km = $2, fuel = $3, damages = $4, damages_text = $5, has_keys = $6, has_docs = $7,
           has_tacho_card = $8, tacho_issue = $9, extra = $10, updated_at = NOW()
       WHERE work_order_id = $1
       RETURNING *`,
      [
        numericId,
        next.km,
        next.fuel,
        next.damages,
        next.damagesText,
        next.hasKeys,
        next.hasDocs,
        next.hasTachoCard,
        next.tachoIssue,
        next.extra,
      ],
    );

    await this.pushAudit({
      workOrderId: numericId,
      eventType: 'checklist',
      message: 'Checklist actualizado',
      actorRole: role,
      actorName: dto.actorName ?? null,
      origin: this.normalizeOrigin(dto.origin),
      reason: (dto.reason ?? '').trim() || null,
      beforeData: current,
      afterData: next,
    });

    return this.toWorkOrderChecklistResponse(updated.rows[0]);
  }

  async getTime(workOrderId: string): Promise<WorkOrderTimeResponse> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);
    const row = await this.ensureWorkOrderTimeRow(numericId);
    const sessions = await this.getTimeSessions(workOrderId);
    return this.toWorkOrderTimeResponse(row, sessions);
  }

  async getTimeSessions(workOrderId: string): Promise<WorkOrderTimeSessionResponse[]> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);
    const res = await this.db.query<WorkOrderTimeSessionRow>(
      `SELECT * FROM work_order_time_sessions
       WHERE work_order_id = $1
       ORDER BY started_at DESC, id DESC`,
      [numericId],
    );
    return res.rows.map((row) => this.toWorkOrderTimeSessionResponse(row));
  }

  async startTime(workOrderId: string, dto: WorkOrderTimeActionDto): Promise<WorkOrderTimeResponse> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);
    const current = await this.ensureWorkOrderTimeRow(numericId);
    if (current.running) {
      const sessions = await this.getTimeSessions(workOrderId);
      return this.toWorkOrderTimeResponse(current, sessions);
    }

    const role = this.parseActorRole(dto.actorRole);
    const origin = this.normalizeOrigin(dto.origin);
    const updated = await this.db.query<WorkOrderTimeRow>(
      `UPDATE work_order_time
       SET running = TRUE, started_at = NOW(), updated_at = NOW()
       WHERE work_order_id = $1
       RETURNING *`,
      [numericId],
    );

    await this.db.query(
      `INSERT INTO work_order_time_sessions
        (work_order_id, started_at, actor_role, actor_name, origin, reason)
       VALUES ($1, NOW(), $2, $3, $4, $5)`,
      [numericId, role, dto.actorName ?? null, origin, (dto.reason ?? '').trim() || null],
    );

    await this.pushAudit({
      workOrderId: numericId,
      eventType: 'tiempo',
      message: 'Tiempo iniciado',
      actorRole: role,
      actorName: dto.actorName ?? null,
      origin,
      reason: (dto.reason ?? '').trim() || null,
      afterData: { running: true, startedAt: updated.rows[0].started_at },
    });

    const sessions = await this.getTimeSessions(workOrderId);
    return this.toWorkOrderTimeResponse(updated.rows[0], sessions);
  }

  async stopTime(workOrderId: string, dto: WorkOrderTimeActionDto): Promise<WorkOrderTimeResponse> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);
    const current = await this.ensureWorkOrderTimeRow(numericId);
    if (!current.running || !current.started_at) {
      const sessions = await this.getTimeSessions(workOrderId);
      return this.toWorkOrderTimeResponse(current, sessions);
    }

    const startMs = new Date(current.started_at).getTime();
    const nowMs = Date.now();
    const extra = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    const nextTotal = current.total_seconds + extra;
    const role = this.parseActorRole(dto.actorRole);
    const origin = this.normalizeOrigin(dto.origin);

    const updated = await this.db.query<WorkOrderTimeRow>(
      `UPDATE work_order_time
       SET total_seconds = $2, running = FALSE, started_at = NULL, updated_at = NOW()
       WHERE work_order_id = $1
       RETURNING *`,
      [numericId, nextTotal],
    );

    await this.db.query(
      `UPDATE work_order_time_sessions
       SET ended_at = NOW(), total_seconds = $2
       WHERE id = (
         SELECT id
         FROM work_order_time_sessions
         WHERE work_order_id = $1 AND ended_at IS NULL
         ORDER BY started_at DESC, id DESC
         LIMIT 1
       )`,
      [numericId, extra],
    );

    await this.pushAudit({
      workOrderId: numericId,
      eventType: 'tiempo',
      message: 'Tiempo parado',
      actorRole: role,
      actorName: dto.actorName ?? null,
      origin,
      reason: (dto.reason ?? '').trim() || null,
      beforeData: {
        running: true,
        startedAt: current.started_at,
        totalSeconds: current.total_seconds,
      },
      afterData: {
        running: false,
        totalSeconds: nextTotal,
        sessionSeconds: extra,
      },
    });

    const sessions = await this.getTimeSessions(workOrderId);
    return this.toWorkOrderTimeResponse(updated.rows[0], sessions);
  }

  async listProducts(): Promise<ProductResponse[]> {
    const res = await this.db.query<ProductRow>(
      'SELECT * FROM products ORDER BY name ASC',
    );
    return res.rows.map((row) => this.toProductResponse(row));
  }

  async findProductByBarcode(barcode: string): Promise<ProductResponse> {
    const normalized = this.normalizeBarcode(barcode);
    if (!normalized) throw new BadRequestException('barcode inválido');
    const res = await this.db.query<ProductRow>(
      'SELECT * FROM products WHERE barcode = $1',
      [normalized],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException(`No existe producto con código ${normalized}`);
    return this.toProductResponse(row);
  }

  async createProduct(dto: CreateProductDto, actorRole?: string): Promise<ProductResponse> {
    this.assertInventoryPermission(actorRole);

    const id = dto.id?.trim().toUpperCase();
    const name = dto.name?.trim();
    const stock = Number(dto.stock ?? 0);
    const minStock = Number(dto.minStock ?? 0);
    const unit = this.normalizeUnit(dto.unit);
    const description = (dto.description ?? '').trim();
    const location = (dto.location ?? '').trim();
    const barcode = this.normalizeBarcode(dto.barcode);

    if (!id) throw new BadRequestException('id (SKU) es obligatorio');
    if (!name) throw new BadRequestException('name es obligatorio');
    if (!Number.isInteger(stock) || stock < 0) throw new BadRequestException('stock inválido');
    if (!Number.isInteger(minStock) || minStock < 0) throw new BadRequestException('minStock inválido');

    const existsById = await this.db.query<{ id: string }>('SELECT id FROM products WHERE id = $1', [id]);
    if (existsById.rows[0]) throw new BadRequestException(`Ya existe un producto con id ${id}`);
    if (barcode) await this.assertBarcodeAvailable(barcode);

    const inserted = await this.db.query<ProductRow>(
      `INSERT INTO products (id, name, description, stock, min_stock, unit, location, barcode, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [id, name, description, stock, minStock, unit, location, barcode],
    );

    return this.toProductResponse(inserted.rows[0]);
  }

  async updateProduct(id: string, dto: UpdateProductDto, actorRole?: string): Promise<ProductResponse> {
    this.assertInventoryPermission(actorRole);
    const pid = id?.trim().toUpperCase();
    if (!pid) throw new BadRequestException('id inválido');

    const currentRes = await this.db.query<ProductRow>('SELECT * FROM products WHERE id = $1', [pid]);
    const current = currentRes.rows[0];
    if (!current) throw new NotFoundException(`Producto no encontrado: ${pid}`);

    const nextName = dto.name?.trim() ?? current.name;
    const nextDescription = dto.description?.trim() ?? current.description;
    const nextMinStock =
      dto.minStock === undefined ? current.min_stock : Number(dto.minStock);
    const nextUnit = dto.unit === undefined ? current.unit : this.normalizeUnit(dto.unit);
    const nextLocation = dto.location?.trim() ?? current.location;
    const nextBarcode = dto.barcode === undefined
      ? current.barcode
      : this.normalizeBarcode(dto.barcode);

    if (!nextName) throw new BadRequestException('name no puede estar vacío');
    if (!Number.isInteger(nextMinStock) || nextMinStock < 0) {
      throw new BadRequestException('minStock inválido');
    }

    if (nextBarcode) {
      const existsByBarcode = await this.db.query<{ id: string }>(
        'SELECT id FROM products WHERE barcode = $1 AND id <> $2',
        [nextBarcode, pid],
      );
      if (existsByBarcode.rows[0]) {
        throw new BadRequestException(`El código ${nextBarcode} ya está en uso`);
      }
    }

    const updated = await this.db.query<ProductRow>(
      `UPDATE products
       SET name = $2, description = $3, min_stock = $4, unit = $5, location = $6, barcode = $7, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [pid, nextName, nextDescription, nextMinStock, nextUnit, nextLocation, nextBarcode],
    );

    return this.toProductResponse(updated.rows[0]);
  }

  async adjustStock(id: string, dto: AdjustStockDto, actorRole?: string, actorName?: string): Promise<{ product: ProductResponse; move: StockMoveResponse }> {
    this.assertInventoryPermission(actorRole);

    const pid = id?.trim().toUpperCase();
    const delta = Number(dto.delta);
    const reason = (dto.reason ?? '').trim();
    if (!reason) throw new BadRequestException('Debes indicar el motivo del ajuste');
    const origin = this.normalizeOrigin(dto.origin);
    if (!pid) throw new BadRequestException('id inválido');
    if (!Number.isInteger(delta) || delta === 0) throw new BadRequestException('delta inválido');

    const productRes = await this.db.query<ProductRow>('SELECT * FROM products WHERE id = $1', [pid]);
    const product = productRes.rows[0];
    if (!product) throw new NotFoundException(`Producto no encontrado: ${pid}`);
    const nextStock = product.stock + delta;
    if (nextStock < 0) throw new BadRequestException(`Stock insuficiente. Actual: ${product.stock}`);

    const updatedProductRes = await this.db.query<ProductRow>(
      'UPDATE products SET stock = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
      [pid, nextStock],
    );
    const moveRes = await this.db.query<StockMoveRow>(
      `INSERT INTO stock_moves (product_id, qty, reason, label, work_order_id, actor_role, actor_name, origin)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)
       RETURNING *`,
      [pid, delta, reason, 'Ajuste manual', this.parseActorRole(actorRole), actorName ?? null, origin],
    );

    return {
      product: this.toProductResponse(updatedProductRes.rows[0]),
      move: this.toStockMoveResponse(moveRes.rows[0]),
    };
  }

  async listInventoryMoves(limit = 25): Promise<InventoryMoveResponse[]> {
    const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const res = await this.db.query<StockMoveWithProductRow>(
      `SELECT m.*, p.name as product_name, p.unit as product_unit
       FROM stock_moves m
       INNER JOIN products p ON p.id = m.product_id
       ORDER BY m.created_at DESC
       LIMIT $1`,
      [safeLimit],
    );
    return res.rows.map((row) => this.toInventoryMoveResponse(row));
  }

  async consumeMaterial(
    workOrderId: string,
    dto: ConsumeWorkOrderMaterialDto,
  ): Promise<{ product: ProductResponse; move: StockMoveResponse }> {
    const numericId = this.parseId(workOrderId);
    await this.assertWorkOrderExists(numericId);

    if (!dto.productId?.trim()) throw new BadRequestException('productId es obligatorio');
    const qtyNum = Number(dto.qty);
    const reason = (dto.reason ?? '').trim();
    if (!reason) throw new BadRequestException('Debes indicar el motivo del consumo');
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      throw new BadRequestException('qty inválida');
    }

    const role = this.parseActorRole(dto.actorRole);
    const origin = this.normalizeOrigin(dto.origin);
    const productRes = await this.db.query<ProductRow>(
      'SELECT * FROM products WHERE id = $1',
      [dto.productId],
    );
    const product = productRes.rows[0];
    if (!product) throw new NotFoundException(`Producto no encontrado: ${dto.productId}`);
    if (product.stock < qtyNum) {
      throw new BadRequestException(`Stock insuficiente para ${dto.productId}. Disponible: ${product.stock}`);
    }

    const updatedProductRes = await this.db.query<ProductRow>(
      'UPDATE products SET stock = stock - $2 WHERE id = $1 RETURNING *',
      [dto.productId, qtyNum],
    );
    const updatedProduct = updatedProductRes.rows[0];

    const moveRes = await this.db.query<StockMoveRow>(
      `INSERT INTO stock_moves (product_id, qty, reason, label, work_order_id, actor_role, actor_name, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        dto.productId,
        -qtyNum,
        reason,
        (dto.label ?? '').trim() || product.name,
        numericId,
        role,
        dto.actorName ?? null,
        origin,
      ],
    );

    await this.pushAudit({
      workOrderId: numericId,
      eventType: 'material',
      message: `Material consumido: ${product.name} (-${qtyNum})`,
      actorRole: role,
      actorName: dto.actorName ?? null,
      origin,
      reason,
      beforeData: {
        productId: product.id,
        productName: product.name,
        stock: product.stock,
      },
      afterData: {
        productId: updatedProduct.id,
        productName: updatedProduct.name,
        stock: updatedProduct.stock,
        qty: qtyNum,
        label: (dto.label ?? '').trim() || product.name,
      },
    });

    return {
      product: this.toProductResponse(updatedProduct),
      move: this.toStockMoveResponse(moveRes.rows[0]),
    };
  }

  private parseActorRole(raw?: string): AppRole | null {
    if (!raw) return null;
    return isAppRole(raw) ? raw : null;
  }

  private assertInventoryPermission(rawRole?: string) {
    const role = this.parseActorRole(rawRole);
    if (role !== 'Inventario' && role !== 'Administración') {
      throw new BadRequestException('Solo Inventario o Administración pueden gestionar productos');
    }
  }

  private normalizeUnit(raw?: string): string {
    const unit = (raw ?? 'ud').trim().toLowerCase();
    if (unit !== 'ud' && unit !== 'l' && unit !== 'm') {
      throw new BadRequestException(`unit inválida: ${raw}`);
    }
    return unit;
  }

  private normalizeBarcode(raw?: string | null): string | null {
    const value = (raw ?? '').trim();
    if (!value) return null;
    if (!/^[0-9]{8,14}$/.test(value)) {
      throw new BadRequestException('barcode debe contener entre 8 y 14 dígitos');
    }
    return value;
  }

  private async assertBarcodeAvailable(barcode: string) {
    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM products WHERE barcode = $1',
      [barcode],
    );
    if (existing.rows[0]) {
      throw new BadRequestException(`El código ${barcode} ya está en uso`);
    }
  }

  private parseId(id: string): number {
    const parsed = Number(id);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`id inválido: ${id}`);
    }
    return parsed;
  }

  private async assertWorkOrderExists(workOrderId: number) {
    const exists = await this.db.query<{ id: number }>('SELECT id FROM work_orders WHERE id = $1', [workOrderId]);
    if (exists.rows.length === 0) {
      throw new NotFoundException(`OT #${workOrderId} no encontrada`);
    }
  }

  private async ensureWorkOrderTimeRow(workOrderId: number): Promise<WorkOrderTimeRow> {
    const found = await this.db.query<WorkOrderTimeRow>(
      'SELECT * FROM work_order_time WHERE work_order_id = $1',
      [workOrderId],
    );
    if (found.rows[0]) return found.rows[0];

    const inserted = await this.db.query<WorkOrderTimeRow>(
      `INSERT INTO work_order_time (work_order_id)
       VALUES ($1)
       RETURNING *`,
      [workOrderId],
    );
    return inserted.rows[0];
  }

  private normalizeOrigin(raw?: string | null): string {
    const value = (raw ?? '').trim().toLowerCase();
    if (!value) return 'web';
    return value;
  }

  private async pushAudit(params: {
    workOrderId: number;
    eventType: string;
    message: string;
    actorRole: AppRole | null;
    actorName: string | null;
    origin?: string;
    reason?: string | null;
    beforeData?: unknown;
    afterData?: unknown;
  }) {
    await this.db.query(
      `INSERT INTO audit_events
        (work_order_id, event_type, message, actor_role, actor_name, origin, reason, before_json, after_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
      [
        params.workOrderId,
        params.eventType,
        params.message,
        params.actorRole,
        params.actorName,
        params.origin ?? 'web',
        params.reason ?? null,
        params.beforeData === undefined ? null : JSON.stringify(params.beforeData),
        params.afterData === undefined ? null : JSON.stringify(params.afterData),
      ],
    );
  }

  private toWorkOrderResponse(row: WorkOrderDetailRow): WorkOrderResponse {
    return {
      id: String(row.id),
      plate: row.plate,
      title: row.title,
      priority: row.priority,
      status: row.status,
      clientName: row.client_name ?? null,
      clientPhone: row.client_phone ?? null,
      clientEmail: row.client_email ?? null,
      vehicleModel: row.vehicle_model ?? null,
      appointmentStart: row.appointment_start ?? null,
      appointmentEnd: row.appointment_end ?? null,
      appointmentWorkType: row.appointment_work_type ?? null,
      appointmentNotes: row.appointment_notes ?? null,
      appointmentId: row.appointment_id ? String(row.appointment_id) : null,
      technicianName: row.technician_name ?? null,
      clientId: row.client_id,
      vehicleId: row.vehicle_id,
      assignedToUserId: row.assigned_to_user_id,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toAuditEventResponse(row: AuditEventRow): AuditEventResponse {
    return {
      id: String(row.id),
      workOrderId: String(row.work_order_id),
      eventType: row.event_type,
      message: row.message,
      actorRole: row.actor_role,
      actorName: row.actor_name,
      origin: row.origin,
      reason: row.reason,
      beforeData: row.before_json,
      afterData: row.after_json,
      createdAt: row.created_at,
    };
  }

  private toWorkOrderNoteResponse(row: WorkOrderNoteRow): WorkOrderNoteResponse {
    return {
      id: String(row.id),
      workOrderId: String(row.work_order_id),
      text: row.text,
      actorRole: row.actor_role,
      actorName: row.actor_name,
      origin: row.origin,
      createdAt: row.created_at,
    };
  }

  private toWorkOrderChecklistResponse(
    row: WorkOrderChecklistRow,
  ): WorkOrderChecklistResponse {
    return {
      workOrderId: String(row.work_order_id),
      km: row.km,
      fuel: row.fuel,
      damages: row.damages,
      damagesText: row.damages_text,
      hasKeys: row.has_keys,
      hasDocs: row.has_docs,
      hasTachoCard: row.has_tacho_card,
      tachoIssue: row.tacho_issue,
      extra: row.extra,
      updatedAt: row.updated_at,
    };
  }

  private toWorkOrderTimeResponse(
    row: WorkOrderTimeRow,
    sessions: WorkOrderTimeSessionResponse[],
  ): WorkOrderTimeResponse {
    return {
      workOrderId: String(row.work_order_id),
      totalSeconds: row.total_seconds,
      running: row.running,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      sessions,
    };
  }

  private toWorkOrderTimeSessionResponse(row: WorkOrderTimeSessionRow): WorkOrderTimeSessionResponse {
    return {
      id: String(row.id),
      workOrderId: String(row.work_order_id),
      startedAt: row.started_at,
      endedAt: row.ended_at,
      totalSeconds: row.total_seconds,
      actorRole: row.actor_role,
      actorName: row.actor_name,
      origin: row.origin,
      reason: row.reason,
      createdAt: row.created_at,
    };
  }

  private toProductResponse(row: ProductRow): ProductResponse {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      stock: row.stock,
      minStock: row.min_stock,
      unit: row.unit,
      location: row.location ?? '',
      barcode: row.barcode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toStockMoveResponse(row: StockMoveRow): StockMoveResponse {
    return {
      id: String(row.id),
      productId: row.product_id,
      qty: row.qty,
      reason: row.reason,
      label: row.label,
      workOrderId: row.work_order_id ? String(row.work_order_id) : null,
      actorRole: row.actor_role,
      actorName: row.actor_name,
      origin: row.origin,
      createdAt: row.created_at,
    };
  }

  private toInventoryMoveResponse(row: StockMoveWithProductRow): InventoryMoveResponse {
    return {
      id: String(row.id),
      productId: row.product_id,
      productName: row.product_name,
      productUnit: row.product_unit,
      qty: row.qty,
      reason: row.reason,
      label: row.label,
      workOrderId: row.work_order_id ? String(row.work_order_id) : null,
      origin: row.origin,
      createdAt: row.created_at,
    };
  }
}
