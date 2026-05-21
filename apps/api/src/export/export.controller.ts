import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DatabaseService } from '../database/database.service';

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\n');
}

@Controller('export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'OFICINA')
export class ExportController {
  constructor(private readonly db: DatabaseService) {}

  @Get('clientes')
  async exportClients(@Res() res: Response) {
    const { rows } = await this.db.query(`
      SELECT c.id, c.name, c.phone, c.email, c.company, c.created_at,
             STRING_AGG(v.plate, ' | ') AS matriculas
        FROM clients c
        LEFT JOIN vehicles v ON v.client_id = c.id
       GROUP BY c.id ORDER BY c.name`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="clientes.csv"');
    res.send('﻿' + toCsv(rows));
  }

  @Get('citas')
  async exportAppointments(@Res() res: Response) {
    const { rows } = await this.db.query(`
      SELECT a.id, a.status, a.work_type, a.notes,
             a.start_at, a.end_at,
             c.name AS cliente, c.phone AS telefono, c.email,
             v.plate AS matricula, v.model AS modelo,
             u.name AS tecnico,
             a.cancel_reason, a.cancelled_at, a.created_at
        FROM appointments a
        LEFT JOIN clients c ON c.id = a.client_id
        LEFT JOIN vehicles v ON v.id = a.vehicle_id
        LEFT JOIN users u ON u.id = a.technician_id
       ORDER BY a.start_at DESC NULLS LAST`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="citas.csv"');
    res.send('﻿' + toCsv(rows));
  }

  @Get('ordenes')
  async exportWorkOrders(@Res() res: Response) {
    const { rows } = await this.db.query(`
      SELECT wo.id, wo.plate AS matricula, wo.title, wo.priority, wo.status,
             wo.scheduled_start, wo.scheduled_end,
             c.name AS cliente, c.phone AS telefono,
             u.name AS tecnico,
             wo.created_at, wo.updated_at,
             (SELECT COUNT(*) FROM work_order_notes n WHERE n.work_order_id = wo.id) AS notas,
             wot.total_seconds AS segundos_trabajo,
             woc.km, woc.fuel AS combustible, woc.damages AS danos,
             woc.has_keys AS llaves, woc.has_docs AS documentacion
        FROM work_orders wo
        LEFT JOIN clients c ON c.id = wo.client_id
        LEFT JOIN users u ON u.id = wo.assigned_to_user_id
        LEFT JOIN work_order_time wot ON wot.work_order_id = wo.id
        LEFT JOIN work_order_checklists woc ON woc.work_order_id = wo.id
       ORDER BY wo.created_at DESC`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ordenes.csv"');
    res.send('﻿' + toCsv(rows));
  }

  @Get('auditoria')
  async exportAudit(@Res() res: Response) {
    const { rows } = await this.db.query(`
      SELECT ae.id, ae.work_order_id, ae.event_type, ae.message,
             ae.actor_role, ae.actor_name, ae.reason, ae.origin, ae.created_at,
             wo.plate AS matricula
        FROM audit_events ae
        LEFT JOIN work_orders wo ON wo.id = ae.work_order_id
       ORDER BY ae.created_at DESC`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="auditoria.csv"');
    res.send('﻿' + toCsv(rows));
  }
}
