import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as webpush from 'web-push';
import { SchedulingService } from '../scheduling/scheduling.service';

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

type PushSubscriptionRow = {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private readonly vapidPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? '';
  private readonly vapidPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY ?? '';
  private readonly vapidSubject =
    process.env.WEB_PUSH_VAPID_SUBJECT ?? 'mailto:admin@taller-app.local';

  constructor(
    private readonly db: DatabaseService,
    private readonly scheduling: SchedulingService,
  ) {}

  onModuleInit() {
    if (this.vapidPublicKey && this.vapidPrivateKey) {
      webpush.setVapidDetails(
        this.vapidSubject,
        this.vapidPublicKey,
        this.vapidPrivateKey,
      );
    }
    const enabled = (process.env.NOTIFICATION_WORKER_ENABLED ?? 'true').toLowerCase() !== 'false';
    if (!enabled) return;
    const everyMs = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? 60_000);
    this.timer = setInterval(() => {
      void this.tick();
    }, Number.isFinite(everyMs) && everyMs > 0 ? everyMs : 60_000);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getPushPublicKey() {
    if (!this.vapidPublicKey) {
      throw new Error(
        'WEB_PUSH_VAPID_PUBLIC_KEY no configurada. Genera claves VAPID y rellena .env',
      );
    }
    return this.vapidPublicKey;
  }

  async upsertPushSubscription(input: {
    userId: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string;
  }) {
    if (!this.vapidPrivateKey || !this.vapidPublicKey) {
      throw new Error('Web push no está configurado en servidor');
    }
    await this.db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           updated_at = NOW()`,
      [
        input.userId,
        input.endpoint,
        input.p256dh,
        input.auth,
        input.userAgent ?? null,
      ],
    );
    return { ok: true };
  }

  async removePushSubscription(input: { userId: number; endpoint: string }) {
    await this.db.query(
      `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [input.userId, input.endpoint],
    );
    return { ok: true };
  }

  async sendPushTest(userId: number) {
    if (!this.vapidPrivateKey || !this.vapidPublicKey) {
      throw new Error('Web push no está configurado en servidor');
    }
    const subs = await this.db.query<PushSubscriptionRow>(
      `SELECT id, user_id, endpoint, p256dh, auth
       FROM push_subscriptions
       WHERE user_id = $1`,
      [userId],
    );
    let sent = 0;
    let removed = 0;
    for (const sub of subs.rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title: 'Talleres MALU',
            body: 'Notificaciones activadas correctamente.',
            url: '/avisos',
          }),
        );
        sent += 1;
      } catch (e) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await this.db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [
            sub.id,
          ]);
          removed += 1;
        }
      }
    }
    return { subscriptions: subs.rows.length, sent, removed };
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

  private async tick() {
    try {
      await this.syncGoogleCalendarIntoApp();
    } catch {
      // avoid breaking the worker cycle
    }
    await this.processDueJobs();
  }

  private async handleJob(job: NotificationJobRow) {
    if (job.channel === 'WEB_PUSH') {
      const payload = (job.payload_json ?? {}) as Record<string, unknown>;
      const title =
        typeof payload.title === 'string' && payload.title.trim()
          ? payload.title
          : 'Talleres MALU';
      const body =
        typeof payload.body === 'string' && payload.body.trim()
          ? payload.body
          : 'Hay una actualización en el taller.';
      const url =
        typeof payload.url === 'string' && payload.url.trim()
          ? payload.url
          : '/avisos';
      await this.sendPushToAll({ title, body, url });
      return;
    }
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

  private async sendPushToAll(input: { title: string; body: string; url: string }) {
    if (!this.vapidPrivateKey || !this.vapidPublicKey) {
      throw new Error('Web push no está configurado en servidor');
    }
    const subs = await this.db.query<PushSubscriptionRow>(
      `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions`,
    );
    for (const sub of subs.rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(input),
        );
      } catch (e) {
        const statusCode = (e as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await this.db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [
            sub.id,
          ]);
        }
      }
    }
  }

  private async syncGoogleCalendarIntoApp() {
    const enabled =
      (process.env.GOOGLE_CALENDAR_IMPORT_AUTO_ENABLED ?? 'true')
        .toLowerCase()
        .trim() !== 'false';
    if (!enabled) return;

    const lookbackHours = Number(
      process.env.GOOGLE_CALENDAR_IMPORT_LOOKBACK_HOURS ?? 24,
    );
    const lookaheadDays = Number(
      process.env.GOOGLE_CALENDAR_IMPORT_LOOKAHEAD_DAYS ?? 90,
    );
    const now = new Date();
    const since = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
    const until = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

    await this.scheduling.importFromGoogleCalendar({
      since: since.toISOString(),
      until: until.toISOString(),
      dryRun: false,
      actorRole: 'Sistema',
      actorName: 'AutoSync Google Calendar',
    });
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
