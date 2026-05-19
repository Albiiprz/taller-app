import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { GoogleCalendarEvent, GoogleCalendarService } from './google-calendar.service';

type TimeBlockType = 'APPOINTMENT' | 'VACATION' | 'INTERNAL';
type DayStatus = 'GREEN' | 'YELLOW' | 'RED';
type WeekPattern = 'ALL' | 'A' | 'B';

type UserRow = { id: number; name: string; role: string; roles_json: unknown; is_active: boolean };
type RuleRow = {
  id: number;
  technician_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  week_pattern: WeekPattern;
  is_active: boolean;
  created_at: string;
};
type TimeBlockRow = {
  id: number;
  technician_id: number;
  type: TimeBlockType;
  start_at: string;
  end_at: string;
  source_id: number | null;
  is_active: boolean;
  note: string;
  created_at: string;
};
type CalendarTimeBlockRow = TimeBlockRow & {
  appointment_work_type: string | null;
  appointment_notes: string | null;
  client_name: string | null;
  client_phone: string | null;
  vehicle_plate: string | null;
  work_order_id: number | null;
  work_order_title: string | null;
  work_order_status: string | null;
};
type AppointmentRow = {
  id: number;
  client_id: number | null;
  vehicle_id: number | null;
  technician_id: number | null;
  work_order_id: number | null;
  google_event_id: string | null;
  status: 'ACTIVE' | 'CANCELLED' | 'DRAFT';
  work_type: string | null;
  notes: string;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
};

type AppointmentDetailRow = AppointmentRow & {
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  vehicle_plate: string | null;
  vehicle_vin: string | null;
  vehicle_model: string | null;
  vehicle_notes: string | null;
  technician_name: string | null;
  technician_login_name: string | null;
};

@Injectable()
export class SchedulingService {
  private readonly defaultTimezone = 'Europe/Madrid';
  private readonly slotStepMinutes = 30;
  private readonly rotationSettingKey = 'schedule_week_a_parity';

  constructor(
    private readonly db: DatabaseService,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}

  async createScheduleRule(technicianId: string, input: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    weekPattern?: WeekPattern;
    isActive?: boolean;
  }) {
    const techId = this.parseId(technicianId, 'technicianId');
    await this.assertUserExists(techId);
    this.validateDayOfWeek(input.dayOfWeek);
    this.validateTime(input.startTime);
    this.validateTime(input.endTime);
    if (input.startTime >= input.endTime) {
      throw new BadRequestException('startTime debe ser menor que endTime');
    }
    this.validateWeekPattern(input.weekPattern);

    await this.ensureTechnicianProfile(techId);

    const res = await this.db.query<RuleRow>(
      `INSERT INTO technician_schedule_rules (technician_id, day_of_week, start_time, end_time, week_pattern, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        techId,
        input.dayOfWeek,
        input.startTime,
        input.endTime,
        (input.weekPattern ?? 'ALL'),
        input.isActive ?? true,
      ],
    );

    await this.pushAudit('TECHNICIAN_SCHEDULE_RULE', String(res.rows[0].id), 'CREATE', null, null, {
      technicianId: techId,
    });
    return this.toRuleResponse(res.rows[0]);
  }

  async listScheduleRules(technicianId: string) {
    const techId = this.parseId(technicianId, 'technicianId');
    await this.assertUserExists(techId);
    const res = await this.db.query<RuleRow>(
      `SELECT * FROM technician_schedule_rules WHERE technician_id = $1 ORDER BY day_of_week ASC, start_time ASC`,
      [techId],
    );
    return res.rows.map((r) => this.toRuleResponse(r));
  }

  async updateScheduleRule(technicianId: string, ruleId: string, input: {
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    weekPattern?: WeekPattern;
    isActive?: boolean;
  }) {
    const techId = this.parseId(technicianId, 'technicianId');
    await this.assertUserExists(techId);
    const rId = this.parseId(ruleId, 'ruleId');
    const found = await this.db.query<RuleRow>(
      `SELECT * FROM technician_schedule_rules WHERE id = $1 AND technician_id = $2`,
      [rId, techId],
    );
    const current = found.rows[0];
    if (!current) throw new NotFoundException('Regla no encontrada');

    const nextDay = input.dayOfWeek ?? current.day_of_week;
    const nextStart = input.startTime ?? current.start_time;
    const nextEnd = input.endTime ?? current.end_time;
    const nextWeekPattern = input.weekPattern ?? current.week_pattern ?? 'ALL';
    const nextActive = input.isActive ?? current.is_active;

    this.validateDayOfWeek(nextDay);
    this.validateTime(nextStart);
    this.validateTime(nextEnd);
    this.validateWeekPattern(nextWeekPattern);
    if (nextStart >= nextEnd) throw new BadRequestException('Rango horario inválido');

    const updated = await this.db.query<RuleRow>(
      `UPDATE technician_schedule_rules
       SET day_of_week = $3, start_time = $4, end_time = $5, week_pattern = $6, is_active = $7
       WHERE id = $1 AND technician_id = $2
       RETURNING *`,
      [rId, techId, nextDay, nextStart, nextEnd, nextWeekPattern, nextActive],
    );

    await this.pushAudit('TECHNICIAN_SCHEDULE_RULE', String(rId), 'UPDATE', null, null, {});
    return this.toRuleResponse(updated.rows[0]);
  }

  async deleteScheduleRule(technicianId: string, ruleId: string) {
    const techId = this.parseId(technicianId, 'technicianId');
    await this.assertUserExists(techId);
    const rId = this.parseId(ruleId, 'ruleId');
    const res = await this.db.query<{ id: number }>(
      `DELETE FROM technician_schedule_rules WHERE id = $1 AND technician_id = $2 RETURNING id`,
      [rId, techId],
    );
    if (!res.rows[0]) throw new NotFoundException('Regla no encontrada');
    await this.pushAudit('TECHNICIAN_SCHEDULE_RULE', String(rId), 'DELETE', null, null, {});
    return { deleted: true };
  }

  async createTimeBlock(technicianId: string, input: {
    type: TimeBlockType;
    startAt: string;
    endAt: string;
    note?: string;
  }) {
    const techId = this.parseId(technicianId, 'technicianId');
    await this.assertUserExists(techId);
    if (input.type !== 'VACATION' && input.type !== 'INTERNAL') {
      throw new BadRequestException('Solo se permite VACATION o INTERNAL en este endpoint');
    }
    const startAt = this.parseIsoDate(input.startAt, 'startAt');
    const endAt = this.parseIsoDate(input.endAt, 'endAt');
    this.validateDateRange(startAt, endAt, 366);

    const res = await this.db.query<TimeBlockRow>(
      `INSERT INTO time_blocks (technician_id, type, start_at, end_at, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [techId, input.type, startAt.toISOString(), endAt.toISOString(), input.note ?? ''],
    );
    await this.pushAudit('TIME_BLOCK', String(res.rows[0].id), 'CREATE', null, null, {});
    return this.toTimeBlockResponse(res.rows[0]);
  }

  async listTimeBlocks(technicianId: string, from: string, to: string) {
    const techId = this.parseId(technicianId, 'technicianId');
    await this.assertUserExists(techId);
    const fromAt = this.parseIsoDate(from, 'from');
    const toAt = this.parseIsoDate(to, 'to');
    this.validateDateRange(fromAt, toAt, 366);

    const rows = await this.db.query<TimeBlockRow>(
      `SELECT * FROM time_blocks
       WHERE technician_id = $1 AND is_active = TRUE
         AND start_at < $3 AND end_at > $2
       ORDER BY start_at ASC`,
      [techId, fromAt.toISOString(), toAt.toISOString()],
    );
    return rows.rows.map((r) => this.toTimeBlockResponse(r));
  }

  async deleteTimeBlock(technicianId: string, blockId: string) {
    const techId = this.parseId(technicianId, 'technicianId');
    await this.assertUserExists(techId);
    const bId = this.parseId(blockId, 'blockId');
    const res = await this.db.query<{ id: number }>(
      `UPDATE time_blocks SET is_active = FALSE WHERE id = $1 AND technician_id = $2 RETURNING id`,
      [bId, techId],
    );
    if (!res.rows[0]) throw new NotFoundException('Bloque no encontrado');
    await this.pushAudit('TIME_BLOCK', String(bId), 'DELETE', null, null, {});
    return { deleted: true };
  }

  async getTechniciansAvailabilityByDate(date: string, durationMinutes: number) {
    const day = this.parseDateOnly(date, 'date');
    const duration = this.normalizeDuration(durationMinutes);
    const techs = await this.listActiveTechnicians();
    const result: Array<{
      technicianId: string;
      name: string;
      dayStatus: DayStatus;
      slots: {
        morning: Array<{ startAt: string; endAt: string }>;
        afternoon: Array<{ startAt: string; endAt: string }>;
      };
    }> = [];
    for (const tech of techs) {
      const dayAvailability = await this.computeDayAvailability(tech.id, day, duration);
      result.push({
        technicianId: String(tech.id),
        name: tech.name,
        dayStatus: dayAvailability.status,
        slots: {
          morning: dayAvailability.morningSlots,
          afternoon: dayAvailability.afternoonSlots,
        },
      });
    }
    return result;
  }

  async getTechnicianAvailabilityRange(technicianId: string, from: string, to: string, durationMinutes: number) {
    const techId = this.parseId(technicianId, 'technicianId');
    await this.assertTechnicianExists(techId);
    const fromDate = this.parseDateOnly(from, 'from');
    const toDate = this.parseDateOnly(to, 'to');
    if (fromDate > toDate) throw new BadRequestException('from debe ser <= to');
    const duration = this.normalizeDuration(durationMinutes);

    const days: Array<{
      date: string;
      status: DayStatus;
      morningSlots: Array<{ startAt: string; endAt: string }>;
      afternoonSlots: Array<{ startAt: string; endAt: string }>;
    }> = [];

    for (let day = new Date(fromDate); day <= toDate; day = this.addDays(day, 1)) {
      const r = await this.computeDayAvailability(techId, day, duration);
      days.push({
        date: this.formatDateOnly(day),
        status: r.status,
        morningSlots: r.morningSlots,
        afternoonSlots: r.afternoonSlots,
      });
    }
    return days;
  }

  async createAppointment(input: {
    client: { name: string; phone: string; email?: string; type?: string };
    vehicle?: { plate?: string; vin?: string; model?: string; notes?: string };
    technicianId: string;
    startAt: string;
    endAt?: string;
    durationMinutes?: number;
    workType: string;
    notes?: string;
    actorRole?: string;
    actorName?: string;
  }) {
    const techId = this.parseId(input.technicianId, 'technicianId');
    await this.assertTechnicianExists(techId);

    const startAt = this.parseIsoDate(input.startAt, 'startAt');
    const endAt = input.endAt
      ? this.parseIsoDate(input.endAt, 'endAt')
      : new Date(startAt.getTime() + this.normalizeDuration(input.durationMinutes ?? 60) * 60_000);

    this.validateAppointmentRange(startAt, endAt);

    const ok = await this.isTechnicianAvailable(techId, startAt, endAt);
    if (!ok) throw new BadRequestException('El técnico no está disponible en ese rango');

    const clientId = await this.upsertClient(input.client);
    const vehicleId = await this.upsertVehicle(input.vehicle);

    const appt = await this.db.query<AppointmentRow>(
      `INSERT INTO appointments (client_id, vehicle_id, technician_id, status, work_type, notes, start_at, end_at)
       VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, $7)
       RETURNING *`,
      [clientId, vehicleId, techId, input.workType.trim(), input.notes ?? '', startAt.toISOString(), endAt.toISOString()],
    );
    const appointment = appt.rows[0];

    const timeBlock = await this.db.query<TimeBlockRow>(
      `INSERT INTO time_blocks (technician_id, type, start_at, end_at, source_id, note)
       VALUES ($1, 'APPOINTMENT', $2, $3, $4, $5)
       RETURNING *`,
      [techId, startAt.toISOString(), endAt.toISOString(), appointment.id, `Cita #${appointment.id}`],
    );

    const workOrderTitle = `${input.workType}${input.vehicle?.plate ? ` - ${input.vehicle.plate}` : ''}`.trim();
    const workOrder = await this.db.query<{ id: number; plate: string; title: string; status: string; assigned_to_user_id: number | null; scheduled_start: string | null; scheduled_end: string | null; created_at: string }>(
      `INSERT INTO work_orders (plate, title, priority, status, client_id, vehicle_id, assigned_to_user_id, scheduled_start, scheduled_end)
       VALUES ($1, $2, 'Normal', 'PROGRAMADA', $3, $4, $5, $6, $7)
       RETURNING id, plate, title, status, assigned_to_user_id, scheduled_start, scheduled_end, created_at`,
      [input.vehicle?.plate?.trim()?.toUpperCase() ?? 'SIN-MATRICULA', workOrderTitle, clientId, vehicleId, techId, startAt.toISOString(), endAt.toISOString()],
    );
    const workOrderId = workOrder.rows[0].id;

    await this.db.query(
      `UPDATE appointments SET work_order_id = $2 WHERE id = $1`,
      [appointment.id, workOrderId],
    );

    const runAt = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
    await this.db.query(
      `INSERT INTO notification_jobs (appointment_id, type, channel, status, run_at, payload_json)
       VALUES ($1, 'APPOINTMENT_REMINDER_24H', 'WHATSAPP_PREFILL', 'PENDING', $2, $3::jsonb)`,
      [
        appointment.id,
        runAt.toISOString(),
        JSON.stringify({
          appointmentId: appointment.id,
          clientName: input.client.name,
          phone: input.client.phone,
          startAt: startAt.toISOString(),
        }),
      ],
    );

    await this.pushAudit('APPOINTMENT', String(appointment.id), 'CREATE', input.actorRole ?? null, input.actorName ?? null, {});
    await this.pushAudit('TIME_BLOCK', String(timeBlock.rows[0].id), 'CREATE', input.actorRole ?? null, input.actorName ?? null, {});
    await this.pushAudit('WORK_ORDER', String(workOrderId), 'CREATE', input.actorRole ?? null, input.actorName ?? null, {});
    const googleCalendar = await this.syncGoogleCalendarForAppointment(appointment.id, input.actorRole ?? null, input.actorName ?? null);

    const durationMin = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
    const whText = `Hola ${input.client.name}, tu cita en TALLER es el ${this.formatHumanDate(startAt)} a las ${this.formatHumanTime(startAt)}. Matricula: ${input.vehicle?.plate ?? 'N/A'}. Duracion estimada: ${durationMin} minutos. Gracias.`;
    const whatsappUrl = `https://wa.me/${this.normalizePhone(input.client.phone)}?text=${encodeURIComponent(whText)}`;
    const whatsappAutoSent = await this.sendWhatsAppAuto(input.client.phone, whText);

    return {
      appointment: {
        id: String(appointment.id),
        status: appointment.status,
        technicianId: String(appointment.technician_id),
        workOrderId: String(workOrderId),
        startAt: appointment.start_at,
        endAt: appointment.end_at,
      },
      workOrder: {
        id: String(workOrderId),
        status: 'PROGRAMADA',
        assignedTo: String(techId),
        scheduledStart: startAt.toISOString(),
        scheduledEnd: endAt.toISOString(),
      },
      whatsappUrl,
      whatsappAutoSent,
      googleCalendar,
    };
  }

  async createAppointmentDraft(input: {
    client?: { name?: string; phone?: string; email?: string; type?: string };
    vehicle?: { plate?: string; vin?: string; model?: string; notes?: string };
    workType?: string;
    notes?: string;
    actorRole?: string;
    actorName?: string;
  }) {
    const hasAnyData = Boolean(
      input.client?.name?.trim()
      || input.client?.phone?.trim()
      || input.vehicle?.plate?.trim()
      || input.workType?.trim()
      || input.notes?.trim(),
    );
    if (!hasAnyData) {
      throw new BadRequestException('Debes indicar al menos un dato para guardar borrador');
    }

    const clientId = await this.upsertClientOptional(input.client);
    const vehicleId = await this.upsertVehicle(input.vehicle);

    const appt = await this.db.query<AppointmentRow>(
      `INSERT INTO appointments (client_id, vehicle_id, technician_id, status, work_type, notes, start_at, end_at)
       VALUES ($1, $2, NULL, 'DRAFT', $3, $4, NULL, NULL)
       RETURNING *`,
      [clientId, vehicleId, input.workType?.trim() || null, input.notes?.trim() || ''],
    );
    const appointment = appt.rows[0];
    await this.pushAudit('APPOINTMENT', String(appointment.id), 'CREATE_DRAFT', input.actorRole ?? null, input.actorName ?? null, {});
    const detail = await this.findAppointmentDetail(appointment.id);
    if (!detail) throw new NotFoundException('No se pudo recuperar el borrador creado');

    return {
      appointment: this.toAppointmentDetailResponse(detail),
      createdAsDraft: true,
    };
  }

  async importFromGoogleCalendar(input: {
    since: string;
    until?: string;
    dryRun?: boolean;
    actorRole?: string;
    actorName?: string;
  }) {
    const since = this.parseIsoDate(input.since, 'since');
    const until = input.until ? this.parseIsoDate(input.until, 'until') : null;
    if (until && until <= since) {
      throw new BadRequestException('until debe ser mayor que since');
    }
    const dryRun = Boolean(input.dryRun);

    const genericTech = await this.getGenericTechnician();
    await this.ensureTechnicianProfile(genericTech.id);

    const events = await this.googleCalendar.listEvents({
      timeMinIso: since.toISOString(),
      timeMaxIso: until?.toISOString() ?? undefined,
      maxResults: 500,
    });

    let imported = 0;
    let skippedDuplicate = 0;
    let skippedInvalid = 0;
    const preview: Array<{ eventId: string; summary: string; startAt: string; endAt: string }> = [];

    for (const event of events) {
      const parsed = this.parseImportEventDates(event);
      if (!parsed) {
        skippedInvalid += 1;
        continue;
      }
      const { startAt, endAt } = parsed;
      if (until && startAt >= until) continue;

      const existing = await this.db.query<{ id: number }>(
        `SELECT id FROM appointments WHERE google_event_id = $1 LIMIT 1`,
        [event.id],
      );
      if (existing.rows[0]) {
        skippedDuplicate += 1;
        continue;
      }

      if (dryRun) {
        preview.push({
          eventId: event.id,
          summary: event.summary?.trim() || 'Cita importada',
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });
        imported += 1;
        continue;
      }

      const clientId = await this.upsertClientOptional({
        name: 'Cliente Google',
        phone: '',
        email: '',
      });
      const plate = this.extractPlateFromText(`${event.summary ?? ''} ${event.description ?? ''}`);
      const vehicleId = await this.upsertVehicle({
        plate: plate ?? `GCAL-${event.id.slice(0, 8).toUpperCase()}`,
      });

      const appt = await this.db.query<AppointmentRow>(
        `INSERT INTO appointments (client_id, vehicle_id, technician_id, status, work_type, notes, start_at, end_at, google_event_id)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          clientId,
          vehicleId,
          genericTech.id,
          event.summary?.trim() || 'Cita importada',
          event.description?.trim() || '',
          startAt.toISOString(),
          endAt.toISOString(),
          event.id,
        ],
      );
      const appointment = appt.rows[0];

      await this.db.query(
        `INSERT INTO time_blocks (technician_id, type, start_at, end_at, source_id, note)
         VALUES ($1, 'APPOINTMENT', $2, $3, $4, $5)`,
        [
          genericTech.id,
          startAt.toISOString(),
          endAt.toISOString(),
          appointment.id,
          `Importado Google #${appointment.id}`,
        ],
      );

      const workOrder = await this.db.query<{ id: number }>(
        `INSERT INTO work_orders (plate, title, priority, status, client_id, vehicle_id, assigned_to_user_id, scheduled_start, scheduled_end)
         VALUES ($1, $2, 'Normal', 'PROGRAMADA', $3, $4, NULL, $5, $6)
         RETURNING id`,
        [
          plate ?? 'SIN-MATRICULA',
          event.summary?.trim() || 'Cita importada',
          clientId,
          vehicleId,
          startAt.toISOString(),
          endAt.toISOString(),
        ],
      );

      await this.db.query(`UPDATE appointments SET work_order_id = $2 WHERE id = $1`, [
        appointment.id,
        workOrder.rows[0].id,
      ]);

      const workOrderId = workOrder.rows[0].id;
      const titleBase = event.summary?.trim() || 'Cita importada';
      const bodyBase = plate
        ? `${titleBase} · ${plate}`
        : titleBase;
      const now = new Date();
      const reminderBefore = new Date(startAt.getTime() - 5 * 60 * 1000);
      const reminderAfter = new Date(startAt.getTime() + 5 * 60 * 1000);

      await this.db.query(
        `INSERT INTO notification_jobs (appointment_id, type, channel, status, run_at, payload_json)
         VALUES ($1, 'GCAL_APPOINTMENT_CREATED', 'WEB_PUSH', 'PENDING', $2, $3::jsonb)`,
        [
          appointment.id,
          now.toISOString(),
          JSON.stringify({
            title: 'Nueva cita en calendario',
            body: bodyBase,
            url: `/ordenes/${workOrderId}`,
          }),
        ],
      );

      if (reminderBefore > now) {
        await this.db.query(
          `INSERT INTO notification_jobs (appointment_id, type, channel, status, run_at, payload_json)
           VALUES ($1, 'GCAL_APPOINTMENT_REMINDER_MINUS_5', 'WEB_PUSH', 'PENDING', $2, $3::jsonb)`,
          [
            appointment.id,
            reminderBefore.toISOString(),
            JSON.stringify({
              title: 'Cita en 5 minutos',
              body: bodyBase,
              url: `/ordenes/${workOrderId}`,
            }),
          ],
        );
      }

      if (reminderAfter > now) {
        await this.db.query(
          `INSERT INTO notification_jobs (appointment_id, type, channel, status, run_at, payload_json)
           VALUES ($1, 'GCAL_APPOINTMENT_REMINDER_PLUS_5', 'WEB_PUSH', 'PENDING', $2, $3::jsonb)`,
          [
            appointment.id,
            reminderAfter.toISOString(),
            JSON.stringify({
              title: 'Abre la orden de trabajo',
              body: `Han pasado 5 minutos de la cita: ${bodyBase}`,
              url: `/ordenes/${workOrderId}`,
            }),
          ],
        );
      }

      await this.pushAudit(
        'APPOINTMENT',
        String(appointment.id),
        'GOOGLE_CALENDAR_IMPORT',
        input.actorRole ?? null,
        input.actorName ?? null,
        { eventId: event.id },
      );
      imported += 1;
    }

    return {
      dryRun,
      genericTechnician: { id: String(genericTech.id), name: genericTech.name, login: genericTech.login_name },
      scanned: events.length,
      imported,
      skippedDuplicate,
      skippedInvalid,
      preview: preview.slice(0, 100),
    };
  }

  async getAppointment(appointmentId: string) {
    const apptId = this.parseId(appointmentId, 'appointmentId');
    const row = await this.findAppointmentDetail(apptId);
    if (!row) throw new NotFoundException('Cita no encontrada');
    return this.toAppointmentDetailResponse(row);
  }

  async updateAppointment(appointmentId: string, input: {
    client?: { name?: string; phone?: string; email?: string; type?: string };
    vehicle?: { plate?: string; vin?: string; model?: string; notes?: string };
    technicianId?: string;
    startAt?: string;
    endAt?: string;
    durationMinutes?: number;
    workType?: string;
    notes?: string;
    actorRole?: string;
    actorName?: string;
  }) {
    const apptId = this.parseId(appointmentId, 'appointmentId');
    const currentDetail = await this.findAppointmentDetail(apptId);
    if (!currentDetail) throw new NotFoundException('Cita no encontrada');
    if (currentDetail.status === 'CANCELLED') throw new BadRequestException('No se puede editar una cita cancelada');

    const nextTechId = input.technicianId
      ? this.parseId(input.technicianId, 'technicianId')
      : (currentDetail.technician_id ?? null);
    if (nextTechId) await this.assertTechnicianExists(nextTechId);

    const nextStart = input.startAt
      ? this.parseIsoDate(input.startAt, 'startAt')
      : (currentDetail.start_at ? new Date(currentDetail.start_at) : null);
    const nextEnd = input.endAt
      ? this.parseIsoDate(input.endAt, 'endAt')
      : input.durationMinutes && nextStart
        ? new Date(nextStart.getTime() + this.normalizeDuration(input.durationMinutes) * 60_000)
        : (currentDetail.end_at ? new Date(currentDetail.end_at) : null);

    const hasSchedule = Boolean(nextTechId && nextStart && nextEnd);
    if (currentDetail.status === 'ACTIVE' && !hasSchedule) {
      throw new BadRequestException('Una cita activa debe tener técnico y horario');
    }
    if (hasSchedule && nextStart && nextEnd && nextTechId) {
      this.validateAppointmentRange(nextStart, nextEnd);
      const available = await this.isTechnicianAvailable(nextTechId, nextStart, nextEnd, apptId);
      if (!available) throw new BadRequestException('El técnico no está disponible para reprogramar');
    }

    let clientId = currentDetail.client_id;
    if (input.client) {
      if (clientId) {
        await this.db.query(
          `UPDATE clients
           SET name = COALESCE($2, name), phone = COALESCE($3, phone), email = COALESCE($4, email)
           WHERE id = $1`,
          [
            clientId,
            input.client.name?.trim() || null,
            input.client.phone?.trim() || null,
            input.client.email?.trim() || null,
          ],
        );
      } else {
        clientId = await this.upsertClientOptional(input.client);
      }
    }

    let vehicleId = currentDetail.vehicle_id;
    if (input.vehicle) {
      if (vehicleId) {
        await this.db.query(
          `UPDATE vehicles
           SET plate = COALESCE($2, plate),
               vin = COALESCE($3, vin),
               vehicle_type = COALESCE($4, vehicle_type),
               tachograph_model = COALESCE($5, tachograph_model)
           WHERE id = $1`,
          [
            vehicleId,
            input.vehicle.plate?.trim()?.toUpperCase() || null,
            input.vehicle.vin?.trim() || null,
            input.vehicle.model?.trim() || null,
            input.vehicle.notes?.trim() || null,
          ],
        );
      } else if (input.vehicle.plate?.trim()) {
        vehicleId = await this.upsertVehicle(input.vehicle);
      }
    }

    const nextWorkType = input.workType?.trim() || currentDetail.work_type || null;
    if (hasSchedule && !nextWorkType) {
      throw new BadRequestException('workType es obligatorio para programar la cita');
    }
    const nextStatus: 'ACTIVE' | 'DRAFT' = hasSchedule ? 'ACTIVE' : 'DRAFT';

    await this.db.query(
      `UPDATE appointments
       SET client_id = $2, vehicle_id = $3, technician_id = $4, status = $5, work_type = $6, notes = $7, start_at = $8, end_at = $9
       WHERE id = $1`,
      [
        apptId,
        clientId,
        vehicleId,
        nextTechId,
        nextStatus,
        nextWorkType,
        input.notes ?? currentDetail.notes,
        nextStart ? nextStart.toISOString() : null,
        nextEnd ? nextEnd.toISOString() : null,
      ],
    );

    let workOrderId = currentDetail.work_order_id;
    if (hasSchedule && nextStart && nextEnd && nextTechId && nextWorkType) {
      const blockFound = await this.db.query<{ id: number }>(
        `SELECT id FROM time_blocks WHERE type = 'APPOINTMENT' AND source_id = $1 LIMIT 1`,
        [apptId],
      );
      if (blockFound.rows[0]) {
        await this.db.query(
          `UPDATE time_blocks
           SET technician_id = $2, start_at = $3, end_at = $4, is_active = TRUE
           WHERE id = $1`,
          [blockFound.rows[0].id, nextTechId, nextStart.toISOString(), nextEnd.toISOString()],
        );
      } else {
        await this.db.query(
          `INSERT INTO time_blocks (technician_id, type, start_at, end_at, source_id, note)
           VALUES ($1, 'APPOINTMENT', $2, $3, $4, $5)`,
          [nextTechId, nextStart.toISOString(), nextEnd.toISOString(), apptId, `Cita #${apptId}`],
        );
      }

      const nextPlate = input.vehicle?.plate?.trim()?.toUpperCase() || currentDetail.vehicle_plate || 'SIN-MATRICULA';
      const nextTitle = `${nextWorkType}${nextPlate ? ` - ${nextPlate}` : ''}`.trim();
      if (workOrderId) {
        await this.db.query(
          `UPDATE work_orders
           SET plate = $2, title = $3, status = 'PROGRAMADA', client_id = $4, vehicle_id = $5, assigned_to_user_id = $6,
               scheduled_start = $7, scheduled_end = $8, updated_at = NOW()
           WHERE id = $1`,
          [
            workOrderId,
            nextPlate,
            nextTitle,
            clientId,
            vehicleId,
            nextTechId,
            nextStart.toISOString(),
            nextEnd.toISOString(),
          ],
        );
      } else {
        const created = await this.db.query<{ id: number }>(
          `INSERT INTO work_orders (plate, title, priority, status, client_id, vehicle_id, assigned_to_user_id, scheduled_start, scheduled_end)
           VALUES ($1, $2, 'Normal', 'PROGRAMADA', $3, $4, $5, $6, $7)
           RETURNING id`,
          [nextPlate, nextTitle, clientId, vehicleId, nextTechId, nextStart.toISOString(), nextEnd.toISOString()],
        );
        workOrderId = created.rows[0].id;
        await this.db.query(
          `UPDATE appointments SET work_order_id = $2 WHERE id = $1`,
          [apptId, workOrderId],
        );
      }

      const runAt = new Date(nextStart.getTime() - 24 * 60 * 60 * 1000);
      const payload = JSON.stringify({
        appointmentId: apptId,
        clientName: input.client?.name ?? currentDetail.client_name ?? 'Cliente',
        phone: input.client?.phone ?? currentDetail.client_phone ?? '',
        startAt: nextStart.toISOString(),
      });
      const jobFound = await this.db.query<{ id: number }>(
        `SELECT id FROM notification_jobs
         WHERE appointment_id = $1 AND type = 'APPOINTMENT_REMINDER_24H'
         ORDER BY created_at ASC
         LIMIT 1`,
        [apptId],
      );
      if (jobFound.rows[0]) {
        await this.db.query(
          `UPDATE notification_jobs
           SET run_at = $2, payload_json = $3::jsonb,
               status = CASE WHEN status = 'DONE' THEN 'DONE' ELSE 'PENDING' END
           WHERE id = $1`,
          [jobFound.rows[0].id, runAt.toISOString(), payload],
        );
      } else {
        await this.db.query(
          `INSERT INTO notification_jobs (appointment_id, type, channel, status, run_at, payload_json)
           VALUES ($1, 'APPOINTMENT_REMINDER_24H', 'WHATSAPP_PREFILL', 'PENDING', $2, $3::jsonb)`,
          [apptId, runAt.toISOString(), payload],
        );
      }
    }

    const after = await this.findAppointmentDetail(apptId);
    if (!after) throw new NotFoundException('Cita no encontrada tras edición');
    await this.pushAudit('APPOINTMENT', String(apptId), 'UPDATE', input.actorRole ?? null, input.actorName ?? null, {});
    const googleCalendar = await this.syncGoogleCalendarForAppointment(apptId, input.actorRole ?? null, input.actorName ?? null);

    let whatsappUrl: string | null = null;
    let whatsappAutoSent = false;
    if (hasSchedule && nextStart && nextEnd) {
      const durationMin = Math.round((nextEnd.getTime() - nextStart.getTime()) / 60000);
      const phone = input.client?.phone ?? after.client_phone ?? '';
      const whText = `Hola ${after.client_name ?? 'cliente'}, tu cita en TALLER es el ${this.formatHumanDate(nextStart)} a las ${this.formatHumanTime(nextStart)}. Matricula: ${after.vehicle_plate ?? 'N/A'}. Duracion estimada: ${durationMin} minutos. Gracias.`;
      whatsappUrl = phone ? `https://wa.me/${this.normalizePhone(phone)}?text=${encodeURIComponent(whText)}` : null;
      whatsappAutoSent = phone ? await this.sendWhatsAppAuto(phone, whText) : false;
    }

    return {
      appointment: this.toAppointmentDetailResponse(after),
      whatsappUrl,
      whatsappAutoSent,
      googleCalendar,
    };
  }

  async cancelAppointment(appointmentId: string, input: { reason?: string; cancelledBy?: string; actorRole?: string; actorName?: string }) {
    const apptId = this.parseId(appointmentId, 'appointmentId');
    const found = await this.db.query<AppointmentRow>('SELECT * FROM appointments WHERE id = $1', [apptId]);
    const current = found.rows[0];
    if (!current) throw new NotFoundException('Cita no encontrada');
    if (current.status === 'CANCELLED') return { cancelled: true, alreadyCancelled: true };

    await this.db.query(
      `UPDATE appointments
       SET status = 'CANCELLED', cancel_reason = $2, cancelled_by = $3, cancelled_at = NOW()
       WHERE id = $1`,
      [apptId, input.reason ?? 'Cancelada', input.cancelledBy ? Number(input.cancelledBy) : null],
    );

    await this.db.query(
      `UPDATE time_blocks SET is_active = FALSE
       WHERE type = 'APPOINTMENT' AND source_id = $1`,
      [apptId],
    );

    await this.db.query(
      `UPDATE notification_jobs
       SET status = 'DONE', last_error = 'Cancelled'
       WHERE appointment_id = $1 AND status = 'PENDING'`,
      [apptId],
    );

    const googleCalendar = await this.removeGoogleCalendarEvent(
      current.google_event_id,
      apptId,
      input.actorRole ?? null,
      input.actorName ?? null,
    );
    await this.db.query(`UPDATE appointments SET google_event_id = NULL WHERE id = $1`, [apptId]);

    await this.pushAudit('APPOINTMENT', String(apptId), 'CANCEL', input.actorRole ?? null, input.actorName ?? null, {
      reason: input.reason ?? null,
    });
    return { cancelled: true, googleCalendar };
  }

  async calendarSummary(from: string, to: string) {
    const fromAt = this.parseIsoDate(from, 'from');
    const toAt = this.parseIsoDate(to, 'to');
    this.validateDateRange(fromAt, toAt, 366);

    const techs = await this.listActiveUsersForCalendar();
    const out: Array<{
      technicianId: string;
      name: string;
      blocks: Array<{
        id: string;
        technicianId: string;
        type: TimeBlockType;
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
    }> = [];
    for (const tech of techs) {
      const blocks = await this.db.query<CalendarTimeBlockRow>(
        `SELECT
           tb.*,
           a.work_type AS appointment_work_type,
           a.notes AS appointment_notes,
           c.name AS client_name,
           c.phone AS client_phone,
           v.plate AS vehicle_plate,
           wo.id AS work_order_id,
           wo.title AS work_order_title,
           wo.status AS work_order_status
         FROM time_blocks tb
         LEFT JOIN appointments a ON tb.type = 'APPOINTMENT' AND tb.source_id = a.id
         LEFT JOIN clients c ON a.client_id = c.id
         LEFT JOIN vehicles v ON a.vehicle_id = v.id
         LEFT JOIN work_orders wo ON a.work_order_id = wo.id
         WHERE tb.technician_id = $1 AND tb.is_active = TRUE
           AND tb.start_at < $3 AND tb.end_at > $2
         ORDER BY tb.start_at ASC`,
        [tech.id, fromAt.toISOString(), toAt.toISOString()],
      );
      out.push({
        technicianId: String(tech.id),
        name: tech.name,
        blocks: blocks.rows.map((b) => ({
          ...this.toTimeBlockResponse(b),
          appointment: b.source_id
            ? {
                workType: b.appointment_work_type,
                notes: b.appointment_notes,
                clientName: b.client_name,
                clientPhone: b.client_phone,
                vehiclePlate: b.vehicle_plate,
                workOrderId: b.work_order_id ? String(b.work_order_id) : null,
                workOrderTitle: b.work_order_title,
                workOrderStatus: b.work_order_status,
              }
            : null,
        })),
      });
    }
    return out;
  }

  private async computeDayAvailability(
    technicianId: number,
    dateOnly: Date,
    durationMinutes: number,
    ignoreAppointmentId?: number,
  ) {
    const dayStart = new Date(`${this.formatDateOnly(dateOnly)}T00:00:00.000Z`);
    const dayEnd = new Date(`${this.formatDateOnly(dateOnly)}T23:59:59.999Z`);
    const dayOfWeek = this.dayOfWeek(dateOnly);
    const weekPattern = await this.getWeekPatternForDate(dateOnly);

    const rules = await this.db.query<RuleRow>(
      `SELECT * FROM technician_schedule_rules
       WHERE technician_id = $1 AND is_active = TRUE AND day_of_week = $2
         AND (week_pattern = 'ALL' OR week_pattern = $3)
       ORDER BY start_time ASC`,
      [technicianId, dayOfWeek, weekPattern],
    );

    if (rules.rows.length === 0) {
      return { status: 'RED' as DayStatus, morningSlots: [], afternoonSlots: [] };
    }

    const values: unknown[] = [technicianId, dayStart.toISOString(), dayEnd.toISOString()];
    let blockSql = `SELECT * FROM time_blocks
       WHERE technician_id = $1 AND is_active = TRUE
         AND start_at < $3 AND end_at > $2`;
    if (ignoreAppointmentId) {
      blockSql += ` AND NOT (type = 'APPOINTMENT' AND source_id = $4)`;
      values.push(ignoreAppointmentId);
    }
    const blocks = await this.db.query<TimeBlockRow>(blockSql, values);

    const morningSlots: Array<{ startAt: string; endAt: string }> = [];
    const afternoonSlots: Array<{ startAt: string; endAt: string }> = [];

    for (const rule of rules.rows) {
      const ruleStart = this.combineDateAndTime(dateOnly, rule.start_time);
      const ruleEnd = this.combineDateAndTime(dateOnly, rule.end_time);
      for (
        let slotStart = new Date(ruleStart);
        slotStart.getTime() + durationMinutes * 60_000 <= ruleEnd.getTime();
        slotStart = new Date(slotStart.getTime() + this.slotStepMinutes * 60_000)
      ) {
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
        const overlaps = blocks.rows.some((b) => this.overlap(slotStart, slotEnd, new Date(b.start_at), new Date(b.end_at)));
        if (overlaps) continue;
        const slot = { startAt: slotStart.toISOString(), endAt: slotEnd.toISOString() };
        const hour = slotStart.getUTCHours();
        if (hour < 14) morningSlots.push(slot);
        else afternoonSlots.push(slot);
      }
    }

    const totalSlots = morningSlots.length + afternoonSlots.length;
    const status: DayStatus = totalSlots === 0 ? 'RED' : totalSlots <= 4 ? 'YELLOW' : 'GREEN';
    return { status, morningSlots, afternoonSlots };
  }

  private async isTechnicianAvailable(
    technicianId: number,
    startAt: Date,
    endAt: Date,
    ignoreAppointmentId?: number,
  ) {
    const duration = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
    const day = this.parseDateOnly(this.formatDateOnly(startAt), 'day');
    const oneDay = await this.computeDayAvailability(technicianId, day, duration, ignoreAppointmentId);
    return [...oneDay.morningSlots, ...oneDay.afternoonSlots].some(
      (s) => s.startAt === startAt.toISOString() && s.endAt === endAt.toISOString(),
    );
  }

  private async upsertClient(input: { name: string; phone: string; email?: string; type?: string }) {
    if (!input.name?.trim()) throw new BadRequestException('client.name es obligatorio');
    if (!input.phone?.trim()) throw new BadRequestException('client.phone es obligatorio');
    const normalizedPhone = input.phone.trim();
    const existing = await this.db.query<{ id: number }>(
      `SELECT id FROM clients WHERE phone = $1 LIMIT 1`,
      [normalizedPhone],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const created = await this.db.query<{ id: number }>(
      `INSERT INTO clients (name, phone, email)
       VALUES ($1, $2, $3) RETURNING id`,
      [input.name.trim(), normalizedPhone, input.email?.trim() || null],
    );
    return created.rows[0].id;
  }

  private async upsertClientOptional(input?: { name?: string; phone?: string; email?: string; type?: string }) {
    if (!input) return null;
    const name = input.name?.trim() || '';
    const phone = input.phone?.trim() || '';
    const email = input.email?.trim() || null;

    if (!name && !phone && !email) return null;

    if (phone) {
      const existing = await this.db.query<{ id: number }>(
        `SELECT id FROM clients WHERE phone = $1 LIMIT 1`,
        [phone],
      );
      if (existing.rows[0]) {
        await this.db.query(
          `UPDATE clients
           SET name = CASE WHEN COALESCE(name, '') = '' THEN $2 ELSE name END,
               email = COALESCE(email, $3)
           WHERE id = $1`,
          [existing.rows[0].id, name || 'Cliente', email],
        );
        return existing.rows[0].id;
      }
    }

    const created = await this.db.query<{ id: number }>(
      `INSERT INTO clients (name, phone, email)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name || 'Cliente', phone || null, email],
    );
    return created.rows[0].id;
  }

  private async upsertVehicle(vehicle?: { plate?: string; vin?: string; model?: string; notes?: string }) {
    if (!vehicle?.plate?.trim()) return null;
    const plate = vehicle.plate.trim().toUpperCase();
    const existing = await this.db.query<{ id: number }>(
      `SELECT id FROM vehicles WHERE plate = $1 LIMIT 1`,
      [plate],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const created = await this.db.query<{ id: number }>(
      `INSERT INTO vehicles (plate, vin, vehicle_type, tachograph_model)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [plate, vehicle.vin?.trim() || null, vehicle.model?.trim() || null, vehicle.notes?.trim() || null],
    );
    return created.rows[0].id;
  }

  private async getGenericTechnician() {
    const preferredLogin = (process.env.GOOGLE_IMPORT_TECHNICIAN_LOGIN ?? 'tecnico').trim();
    const byLogin = await this.db.query<{ id: number; name: string; login_name: string | null }>(
      `SELECT id, name, login_name
       FROM users
       WHERE is_active = TRUE
         AND login_name = $1
       LIMIT 1`,
      [preferredLogin],
    );
    if (byLogin.rows[0]) return byLogin.rows[0];

    const firstTech = await this.db.query<{ id: number; name: string; login_name: string | null }>(
      `SELECT id, name, login_name
       FROM users
       WHERE is_active = TRUE
         AND (
           translate(lower(role), 'áéíóú', 'aeiou') = 'tecnico'
           OR roles_json ? 'Técnico'
           OR roles_json ? 'Jefe de Taller'
         )
       ORDER BY id ASC
       LIMIT 1`,
    );
    const fallback = firstTech.rows[0];
    if (!fallback) {
      throw new BadRequestException(
        'No hay técnico activo para importar. Crea uno o define GOOGLE_IMPORT_TECHNICIAN_LOGIN',
      );
    }
    return fallback;
  }

  private parseImportEventDates(event: GoogleCalendarEvent) {
    if (!event.startAt || !event.endAt) return null;
    const startAt = new Date(event.startAt);
    const endAtRaw = new Date(event.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAtRaw.getTime())) return null;
    const endAt = endAtRaw > startAt ? endAtRaw : new Date(startAt.getTime() + 60 * 60 * 1000);
    return { startAt, endAt };
  }

  private extractPlateFromText(text: string): string | null {
    const normalized = text.toUpperCase();
    const match = normalized.match(/\b\d{4}[A-Z]{3}\b|\b[A-Z]{1,2}\d{4}[A-Z]{1,2}\b/);
    return match?.[0] ?? null;
  }

  private async listActiveTechnicians() {
    const res = await this.db.query<UserRow>(
      `SELECT id, name, role, roles_json, is_active FROM users
       WHERE is_active = TRUE
         AND (
           translate(lower(role), 'áéíóú', 'aeiou') = 'tecnico'
           OR upper(role) = 'TECNICO'
           OR roles_json ? 'Técnico'
           OR roles_json ? 'Jefe de Taller'
         )
       ORDER BY name ASC`,
    );
    return res.rows;
  }

  private async listActiveUsersForCalendar() {
    const res = await this.db.query<UserRow>(
      `SELECT id, name, role, roles_json, is_active FROM users
       WHERE is_active = TRUE
       ORDER BY name ASC`,
    );
    return res.rows;
  }

  private async findAppointmentDetail(appointmentId: number) {
    const res = await this.db.query<AppointmentDetailRow>(
      `SELECT a.*,
              c.name AS client_name,
              c.phone AS client_phone,
              c.email AS client_email,
              v.plate AS vehicle_plate,
              v.vin AS vehicle_vin,
              v.vehicle_type AS vehicle_model,
              v.tachograph_model AS vehicle_notes,
              u.name AS technician_name,
              u.login_name AS technician_login_name
       FROM appointments a
       LEFT JOIN clients c ON c.id = a.client_id
       LEFT JOIN vehicles v ON v.id = a.vehicle_id
       LEFT JOIN users u ON u.id = a.technician_id
       WHERE a.id = $1`,
      [appointmentId],
    );
    return res.rows[0] ?? null;
  }

  private toAppointmentDetailResponse(row: AppointmentDetailRow) {
    return {
      id: String(row.id),
      status: row.status,
      technicianId: row.technician_id ? String(row.technician_id) : null,
      workOrderId: row.work_order_id ? String(row.work_order_id) : null,
      startAt: row.start_at,
      endAt: row.end_at,
      workType: row.work_type,
      notes: row.notes,
      client: {
        name: row.client_name,
        phone: row.client_phone,
        email: row.client_email,
      },
      vehicle: {
        plate: row.vehicle_plate,
        vin: row.vehicle_vin,
        model: row.vehicle_model,
        notes: row.vehicle_notes,
      },
      technicianName: row.technician_name,
      googleEventId: row.google_event_id,
      createdAt: row.created_at,
    };
  }

  private async assertTechnicianExists(technicianId: number) {
    const found = await this.db.query<UserRow>(
      `SELECT id, name, role, roles_json, is_active FROM users WHERE id = $1`,
      [technicianId],
    );
    const user = found.rows[0];
    if (!user || !user.is_active) throw new NotFoundException('Técnico no encontrado');
    const roles = this.parseUserRoles(user);
    const hasTechRole = roles.some((role) => {
      const normalized = role
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return normalized === 'tecnico' || normalized === 'jefe de taller';
    });
    if (!hasTechRole) {
      throw new BadRequestException('El usuario no es técnico/jefe de taller');
    }
  }

  private async assertUserExists(userId: number) {
    const found = await this.db.query<UserRow>(
      `SELECT id, name, role, roles_json, is_active FROM users WHERE id = $1`,
      [userId],
    );
    const user = found.rows[0];
    if (!user || !user.is_active) throw new NotFoundException('Usuario no encontrado');
  }

  private parseUserRoles(user: Pick<UserRow, 'role' | 'roles_json'>): string[] {
    if (Array.isArray(user.roles_json)) {
      const roles = user.roles_json.filter((value): value is string => typeof value === 'string');
      if (roles.length > 0) return roles;
    }
    return user.role ? [user.role] : [];
  }

  private async ensureTechnicianProfile(technicianId: number) {
    await this.db.query(
      `INSERT INTO technician_profiles (user_id, timezone)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [technicianId, this.defaultTimezone],
    );
  }

  private toRuleResponse(row: RuleRow) {
    return {
      id: String(row.id),
      technicianId: String(row.technician_id),
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      weekPattern: row.week_pattern ?? 'ALL',
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }

  private validateWeekPattern(value?: string) {
    if (!value) return;
    if (value !== 'ALL' && value !== 'A' && value !== 'B') {
      throw new BadRequestException('weekPattern inválido (ALL|A|B)');
    }
  }

  private getIsoWeekNumber(dateOnly: Date): number {
    // ISO week based on local date semantics (good enough for scheduling in Europe/Madrid).
    const d = new Date(dateOnly);
    d.setHours(12, 0, 0, 0);
    // Thursday in current week decides the year.
    const day = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    d.setDate(d.getDate() - day + 3);
    const firstThursday = new Date(d.getFullYear(), 0, 4);
    const firstDay = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
    const diffMs = d.getTime() - firstThursday.getTime();
    return 1 + Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  }

  private async getWeekPatternForDate(dateOnly: Date): Promise<'A' | 'B'> {
    const isoWeek = this.getIsoWeekNumber(dateOnly);
    const parity: 'EVEN' | 'ODD' = isoWeek % 2 === 0 ? 'EVEN' : 'ODD';
    const stored = await this.db.query<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
      [this.rotationSettingKey],
    );
    let weekAParity = stored.rows[0]?.value as 'EVEN' | 'ODD' | undefined;
    if (weekAParity !== 'EVEN' && weekAParity !== 'ODD') {
      // If not configured yet, consider "this week" as Week A.
      weekAParity = parity;
      await this.db.query(
        `INSERT INTO app_settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [this.rotationSettingKey, weekAParity],
      );
    }
    return parity === weekAParity ? 'A' : 'B';
  }

  async applyMaluWeekRotation() {
    // Week A is pinned the first time we apply the template.
    // Re-applying should refresh rules/users without flipping the A/B mapping.
    const today = new Date();
    const isoWeek = this.getIsoWeekNumber(today);
    const currentParity: 'EVEN' | 'ODD' = isoWeek % 2 === 0 ? 'EVEN' : 'ODD';
    const existing = await this.db.query<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
      [this.rotationSettingKey],
    );
    const stored = existing.rows[0]?.value;
    const weekAParity: 'EVEN' | 'ODD' =
      stored === 'EVEN' || stored === 'ODD' ? (stored as 'EVEN' | 'ODD') : currentParity;
    await this.db.query(
      `INSERT INTO app_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = COALESCE(app_settings.value, EXCLUDED.value), updated_at = NOW()`,
      [this.rotationSettingKey, weekAParity],
    );

    // Ensure users exist (create missing ones with PIN 0000 so they can log in).
    type ActiveUserRow = { id: number; name: string; login_name: string | null };
    const users = await this.db.query<ActiveUserRow>(
      `SELECT id, name, login_name FROM users WHERE is_active = TRUE`,
    );
    const byLogin = new Map<string, ActiveUserRow>(
      users.rows
        .filter((u) => typeof u.login_name === 'string' && u.login_name)
        .map((u): [string, ActiveUserRow] => [String(u.login_name).toLowerCase(), u]),
    );
    const byName = new Map<string, ActiveUserRow>(
      users.rows.map((u): [string, ActiveUserRow] => [u.name.toLowerCase(), u]),
    );

    const ensureUser = async (name: string, login: string, role: string, roles: string[]) => {
      const key = login.toLowerCase();
      const existing = byLogin.get(key) ?? byName.get(name.toLowerCase());
      if (existing) return existing.id;
      const created = await this.db.query<{ id: number }>(
        `INSERT INTO users (name, role, roles_json, login_name, pin, is_active)
         VALUES ($1, $2, $3::jsonb, $4, $5, TRUE)
         RETURNING id`,
        [name, role, JSON.stringify(roles), login, '0000'],
      );
      const id = created.rows[0].id;
      byLogin.set(key, { id, name, login_name: login });
      byName.set(name.toLowerCase(), { id, name, login_name: login });
      return id;
    };

    const ids = {
      mariangeles: await ensureUser('Mariangeles', 'mariangeles', 'Oficina', ['Oficina']),
      marisa: await ensureUser('Marisa', 'marisa', 'Administración', ['Administración', 'Contabilidad', 'Oficina']),
      sara: await ensureUser('Sara', 'sara', 'Oficina', ['Oficina', 'Administración']),
      victor: await ensureUser('Victor', 'victor', 'Inventario', ['Inventario', 'Técnico']),
      alberto: await ensureUser('Alberto', 'alberto', 'Técnico', ['Técnico']),
      daniel: await ensureUser('Daniel', 'daniel', 'Técnico', ['Técnico', 'Jefe de Taller']),
      josete: await ensureUser('Josete', 'josete', 'Técnico', ['Técnico']),
      miguel: await ensureUser('Miguel', 'miguel', 'Técnico', ['Técnico']),
    };

    const allUserIds = Object.values(ids);
    for (const userId of allUserIds) {
      await this.ensureTechnicianProfile(userId);
    }
    // Replace weekday schedules; keep weekends untouched.
    await this.db.query(
      `DELETE FROM technician_schedule_rules
       WHERE technician_id = ANY($1::bigint[])
         AND day_of_week BETWEEN 1 AND 5`,
      [allUserIds],
    );

    const insertRule = async (userId: number, day: number, start: string, end: string, pattern: WeekPattern) => {
      await this.db.query(
        `INSERT INTO technician_schedule_rules
          (technician_id, day_of_week, start_time, end_time, week_pattern, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)`,
        [userId, day, start, end, pattern],
      );
    };

    const weekdays = [1, 2, 3, 4, 5];
    // Week A (this week):
    for (const d of weekdays) {
      await insertRule(ids.mariangeles, d, '09:00', '13:00', 'A');
      await insertRule(ids.marisa, d, '08:00', '19:00', 'A');

      await insertRule(ids.sara, d, '08:00', '13:00', 'A');
      await insertRule(ids.sara, d, '15:00', '18:00', 'A');

      await insertRule(ids.victor, d, '08:00', '13:00', 'A');
      await insertRule(ids.victor, d, '15:00', '18:00', 'A');

      await insertRule(ids.alberto, d, '08:00', '16:00', 'A');
      await insertRule(ids.daniel, d, '08:00', '16:00', 'A');

      await insertRule(ids.josete, d, '15:00', '18:00', 'A');

      await insertRule(ids.miguel, d, '08:00', '13:00', 'A');
      await insertRule(ids.miguel, d, '15:00', '18:00', 'A');
    }

    // Week B (next week):
    for (const d of weekdays) {
      await insertRule(ids.sara, d, '08:00', '16:00', 'B');
      await insertRule(ids.victor, d, '08:00', '16:00', 'B');

      await insertRule(ids.alberto, d, '08:00', '13:00', 'B');
      await insertRule(ids.alberto, d, '15:00', '18:00', 'B');

      await insertRule(ids.daniel, d, '08:00', '13:00', 'B');
      await insertRule(ids.daniel, d, '15:00', '18:00', 'B');

      await insertRule(ids.miguel, d, '08:00', '16:00', 'B');
    }

    return {
      ok: true,
      weekAParity,
      note: 'Rotación Semana A/B aplicada. Semana A queda fijada y la app alterna automáticamente. Los usuarios nuevos se crean con PIN 0000.',
    };
  }

  private toTimeBlockResponse(row: TimeBlockRow) {
    return {
      id: String(row.id),
      technicianId: String(row.technician_id),
      type: row.type,
      startAt: row.start_at,
      endAt: row.end_at,
      sourceId: row.source_id ? String(row.source_id) : null,
      isActive: row.is_active,
      note: row.note,
      createdAt: row.created_at,
    };
  }

  private async syncGoogleCalendarForAppointment(
    appointmentId: number,
    actorRole: string | null,
    actorName: string | null,
  ) {
    const detail = await this.findAppointmentDetail(appointmentId);
    if (!detail) {
      return {
        enabled: false,
        synced: false,
        action: 'failed',
        eventId: null,
        eventUrl: null,
        error: 'Cita no encontrada para sincronizar',
      };
    }

    if (detail.status !== 'ACTIVE' || !detail.start_at || !detail.end_at || !detail.technician_id) {
      if (detail.google_event_id) {
        const removal = await this.removeGoogleCalendarEvent(detail.google_event_id, appointmentId, actorRole, actorName);
        if (removal.deleted) {
          await this.db.query(`UPDATE appointments SET google_event_id = NULL WHERE id = $1`, [appointmentId]);
        }
      }
      return {
        enabled: true,
        synced: false,
        action: 'skipped',
        eventId: detail.google_event_id ?? null,
        eventUrl: null,
        error: null,
      };
    }

    const result = await this.googleCalendar.upsertAppointmentEvent({
      eventId: detail.google_event_id,
      appointmentId,
      workType: detail.work_type,
      notes: detail.notes,
      startAt: detail.start_at,
      endAt: detail.end_at,
      clientName: detail.client_name,
      clientPhone: detail.client_phone,
      clientEmail: detail.client_email,
      vehiclePlate: detail.vehicle_plate,
      technicianName: detail.technician_name,
      technicianLogin: detail.technician_login_name,
    });

    if (result.eventId && result.eventId !== detail.google_event_id) {
      await this.db.query(
        `UPDATE appointments SET google_event_id = $2 WHERE id = $1`,
        [appointmentId, result.eventId],
      );
    }

    await this.pushAudit('APPOINTMENT', String(appointmentId), 'GOOGLE_CALENDAR_SYNC', actorRole, actorName, result);
    return result;
  }

  private async removeGoogleCalendarEvent(
    eventId: string | null,
    appointmentId: number,
    actorRole: string | null,
    actorName: string | null,
  ) {
    const result = await this.googleCalendar.deleteEvent(eventId);
    await this.pushAudit('APPOINTMENT', String(appointmentId), 'GOOGLE_CALENDAR_DELETE', actorRole, actorName, result);
    return result;
  }

  private async pushAudit(
    entityType: string,
    entityId: string,
    action: string,
    actorRole: string | null,
    actorName: string | null,
    payload: unknown,
  ) {
    await this.db.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, actor_role, actor_name, payload_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [entityType, entityId, action, actorRole, actorName, JSON.stringify(payload ?? {})],
    );
  }

  private validateDayOfWeek(day: number) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new BadRequestException('dayOfWeek inválido (0-6)');
    }
  }

  private validateTime(value: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) throw new BadRequestException(`Hora inválida: ${value}`);
  }

  private parseDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} debe ser YYYY-MM-DD`);
    }
    const d = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} inválido`);
    return d;
  }

  private parseIsoDate(value: string, field: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${field} inválido`);
    return d;
  }

  private normalizeDuration(duration: number) {
    const n = Number(duration);
    if (!Number.isInteger(n) || n < 30 || n > 480) {
      throw new BadRequestException('durationMinutes debe estar entre 30 y 480');
    }
    return n;
  }

  private validateAppointmentRange(startAt: Date, endAt: Date) {
    if (endAt <= startAt) throw new BadRequestException('endAt debe ser mayor que startAt');
    const diffMin = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
    if (diffMin < 30 || diffMin > 480) {
      throw new BadRequestException('Duración fuera de rango (30 min a 8h)');
    }
  }

  private validateDateRange(startAt: Date, endAt: Date, maxDays: number) {
    if (endAt <= startAt) throw new BadRequestException('endAt debe ser mayor que startAt');
    const diffMs = endAt.getTime() - startAt.getTime();
    const maxMs = maxDays * 24 * 60 * 60 * 1000;
    if (diffMs > maxMs) {
      throw new BadRequestException(`Rango fuera de límite (${maxDays} días)`);
    }
  }

  private parseId(value: string, field: string) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(`${field} inválido`);
    return id;
  }

  private combineDateAndTime(dateOnly: Date, hhmm: string) {
    const [hh, mm] = hhmm.split(':').map(Number);
    const d = new Date(dateOnly);
    d.setUTCHours(hh, mm, 0, 0);
    return d;
  }

  private overlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && aEnd > bStart;
  }

  private dayOfWeek(date: Date) {
    return date.getUTCDay();
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private formatDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private formatHumanDate(date: Date) {
    return date.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
  }

  private formatHumanTime(date: Date) {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  }

  private normalizePhone(phone: string) {
    const digits = phone.replace(/[^\d]/g, '');
    return digits.startsWith('34') ? digits : `34${digits}`;
  }

  private async sendWhatsAppAuto(phone: string, text: string): Promise<boolean> {
    const providerUrl = process.env.WHATSAPP_PROVIDER_URL;
    if (!providerUrl) return false;
    try {
      const res = await fetch(providerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.WHATSAPP_PROVIDER_TOKEN
            ? { Authorization: `Bearer ${process.env.WHATSAPP_PROVIDER_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          to: this.normalizePhone(phone),
          text,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
