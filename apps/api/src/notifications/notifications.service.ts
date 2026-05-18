import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type NotificationJobRow = {
  id: number;
  appointment_id: number | null;
  type: string;
  channel: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
  run_at: string;
  payload_json: Record<string, unknown> | null;
  last_error: string | null;
  created_at: string;
};

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    const enabled = (process.env.NOTIFICATION_WORKER_ENABLED ?? 'true').toLowerCase() !== 'false';
    if (!enabled) return;
    const everyMs = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? 60_000);
    this.timer = setInterval(() => {
      void this.processDueJobs();
    }, Number.isFinite(everyMs) && everyMs > 0 ? everyMs : 60_000);
    void this.processDueJobs();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async listJobs(status?: string) {
    const values: unknown[] = [];
    let sql = `SELECT id, appointment_id, type, channel, status, run_at, payload_json, last_error, created_at
               FROM notification_jobs`;
    if (status) {
      sql += ' WHERE status = $1';
      values.push(status);
    }
    sql += ' ORDER BY run_at ASC LIMIT 200';
    const rows = await this.db.query<NotificationJobRow>(sql, values);
    return rows.rows.map((r) => this.toResponse(r));
  }

  async processDueJobs(limit = 50) {
    const rows = await this.db.query<NotificationJobRow>(
      `SELECT id, appointment_id, type, channel, status, run_at, payload_json, last_error, created_at
       FROM notification_jobs
       WHERE status = 'PENDING' AND run_at <= NOW()
       ORDER BY run_at ASC
       LIMIT $1`,
      [limit],
    );

    let done = 0;
    let failed = 0;

    for (const job of rows.rows) {
      try {
        await this.handleJob(job);
        await this.db.query(
          `UPDATE notification_jobs
           SET status = 'DONE', last_error = NULL
           WHERE id = $1`,
          [job.id],
        );
        done += 1;
      } catch (e) {
        const err = e instanceof Error ? e.message : 'Error procesando job';
        await this.db.query(
          `UPDATE notification_jobs
           SET status = 'FAILED', last_error = $2
           WHERE id = $1`,
          [job.id, err.slice(0, 500)],
        );
        failed += 1;
      }
    }

    return {
      scanned: rows.rows.length,
      done,
      failed,
    };
  }

  private async handleJob(job: NotificationJobRow) {
    if (job.channel === 'INTERNAL') return;
    const payload = (job.payload_json ?? {}) as Record<string, unknown>;
    const phone = typeof payload.phone === 'string' ? payload.phone : '';
    const clientName = typeof payload.clientName === 'string' ? payload.clientName : 'cliente';
    const startAtRaw = typeof payload.startAt === 'string' ? payload.startAt : '';
    if (!phone.trim()) throw new Error('payload.phone vacío');
    if (!startAtRaw) throw new Error('payload.startAt vacío');

    const startAt = new Date(startAtRaw);
    if (Number.isNaN(startAt.getTime())) throw new Error('payload.startAt inválido');
    const whText = `Recordatorio: hola ${clientName}, tu cita en TALLER es el ${startAt.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })} a las ${startAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })}. Gracias.`;

    const sent = await this.sendWhatsAppAuto(phone, whText);
    if (!sent) throw new Error('Proveedor WhatsApp rechazó el envío');
  }

  private normalizePhone(phone: string) {
    const digits = phone.replace(/[^\d]/g, '');
    return digits.startsWith('34') ? digits : `34${digits}`;
  }

  private async sendWhatsAppAuto(phone: string, text: string): Promise<boolean> {
    const providerUrl = process.env.WHATSAPP_PROVIDER_URL;
    if (!providerUrl) return false;
    const timeoutMs = Number(process.env.WHATSAPP_PROVIDER_TIMEOUT_MS ?? 15000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000);
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
        signal: controller.signal,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private toResponse(r: NotificationJobRow) {
    return {
      id: String(r.id),
      appointmentId: r.appointment_id ? String(r.appointment_id) : null,
      type: r.type,
      channel: r.channel,
      status: r.status,
      runAt: r.run_at,
      payloadJson: r.payload_json,
      lastError: r.last_error,
      createdAt: r.created_at,
    };
  }
}
