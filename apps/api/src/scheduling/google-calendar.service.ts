import { Injectable, Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

type GoogleServiceAccountJson = {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
};

type GoogleCalendarConfig = {
  calendarId: string;
  timezone: string;
  tokenUri: string;
  clientEmail: string;
  privateKey: string;
};

type UpsertAppointmentEventInput = {
  eventId?: string | null;
  appointmentId: number;
  workType?: string | null;
  notes?: string | null;
  startAt: string;
  endAt: string;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  vehiclePlate?: string | null;
  technicianName?: string | null;
  technicianLogin?: string | null;
};

type UpsertAppointmentEventResult = {
  enabled: boolean;
  synced: boolean;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  eventId: string | null;
  eventUrl: string | null;
  error: string | null;
};

type DeleteEventResult = {
  enabled: boolean;
  deleted: boolean;
  action: 'deleted' | 'skipped' | 'failed';
  error: string | null;
};

export type GoogleCalendarEvent = {
  id: string;
  summary: string | null;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
};

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private configCache: GoogleCalendarConfig | null | undefined = undefined;
  private tokenCache: { accessToken: string; expiresAtEpochSec: number } | null = null;

  async upsertAppointmentEvent(input: UpsertAppointmentEventInput): Promise<UpsertAppointmentEventResult> {
    const cfg = await this.getConfig();
    if (!cfg) {
      return {
        enabled: false,
        synced: false,
        action: 'skipped',
        eventId: input.eventId ?? null,
        eventUrl: null,
        error: null,
      };
    }

    const body = this.buildEventBody(cfg.timezone, input);

    if (input.eventId) {
      const update = await this.callCalendarJson(
        cfg,
        'PATCH',
        `/calendar/v3/calendars/${encodeURIComponent(cfg.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
        body,
      );

      if (update.ok) {
        return {
          enabled: true,
          synced: true,
          action: 'updated',
          eventId: (update.json?.id as string | undefined) ?? input.eventId,
          eventUrl: (update.json?.htmlLink as string | undefined) ?? null,
          error: null,
        };
      }

      if (update.status !== 404) {
        return {
          enabled: true,
          synced: false,
          action: 'failed',
          eventId: input.eventId,
          eventUrl: null,
          error: this.extractError(update.text, update.json),
        };
      }
    }

    const create = await this.callCalendarJson(
      cfg,
      'POST',
      `/calendar/v3/calendars/${encodeURIComponent(cfg.calendarId)}/events`,
      body,
    );

    if (!create.ok) {
      return {
        enabled: true,
        synced: false,
        action: 'failed',
        eventId: input.eventId ?? null,
        eventUrl: null,
        error: this.extractError(create.text, create.json),
      };
    }

    return {
      enabled: true,
      synced: true,
      action: 'created',
      eventId: (create.json?.id as string | undefined) ?? null,
      eventUrl: (create.json?.htmlLink as string | undefined) ?? null,
      error: null,
    };
  }

  async deleteEvent(eventId?: string | null): Promise<DeleteEventResult> {
    if (!eventId) {
      return { enabled: true, deleted: true, action: 'skipped', error: null };
    }

    const cfg = await this.getConfig();
    if (!cfg) {
      return { enabled: false, deleted: false, action: 'skipped', error: null };
    }

    const res = await this.callCalendarJson(
      cfg,
      'DELETE',
      `/calendar/v3/calendars/${encodeURIComponent(cfg.calendarId)}/events/${encodeURIComponent(eventId)}`,
    );

    if (res.ok || res.status === 404) {
      return { enabled: true, deleted: true, action: 'deleted', error: null };
    }

    return {
      enabled: true,
      deleted: false,
      action: 'failed',
      error: this.extractError(res.text, res.json),
    };
  }

  async listEvents(input: {
    timeMinIso: string;
    timeMaxIso?: string | null;
    maxResults?: number;
  }): Promise<GoogleCalendarEvent[]> {
    const cfg = await this.getConfig();
    if (!cfg) return [];

    const maxResults = Math.min(
      Math.max(Number(input.maxResults ?? 250), 1),
      2500,
    );

    let pageToken: string | undefined;
    const out: GoogleCalendarEvent[] = [];
    while (true) {
      const params = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: String(maxResults),
        timeMin: input.timeMinIso,
      });
      if (input.timeMaxIso) params.set('timeMax', input.timeMaxIso);
      if (pageToken) params.set('pageToken', pageToken);

      const res = await this.callCalendarJson(
        cfg,
        'GET',
        `/calendar/v3/calendars/${encodeURIComponent(
          cfg.calendarId,
        )}/events?${params.toString()}`,
      );
      if (!res.ok) {
        throw new Error(this.extractError(res.text, res.json));
      }
      const items = Array.isArray(res.json?.items)
        ? (res.json?.items as Array<Record<string, unknown>>)
        : [];

      for (const item of items) {
        const startRaw = item.start as Record<string, unknown> | undefined;
        const endRaw = item.end as Record<string, unknown> | undefined;
        const startAt =
          (typeof startRaw?.dateTime === 'string' && startRaw.dateTime) ||
          (typeof startRaw?.date === 'string' && `${startRaw.date}T09:00:00.000Z`) ||
          null;
        const endAt =
          (typeof endRaw?.dateTime === 'string' && endRaw.dateTime) ||
          (typeof endRaw?.date === 'string' && `${endRaw.date}T10:00:00.000Z`) ||
          null;

        out.push({
          id: typeof item.id === 'string' ? item.id : '',
          summary: typeof item.summary === 'string' ? item.summary : null,
          description:
            typeof item.description === 'string' ? item.description : null,
          startAt,
          endAt,
        });
      }

      pageToken =
        typeof res.json?.nextPageToken === 'string'
          ? res.json.nextPageToken
          : undefined;
      if (!pageToken) break;
    }
    return out.filter((ev) => Boolean(ev.id));
  }

  private buildEventBody(timezone: string, input: UpsertAppointmentEventInput) {
    const summary = input.workType?.trim() || 'Cita taller';
    const lines = [
      `Cliente: ${input.clientName ?? 'N/A'}`,
      `Teléfono: ${input.clientPhone ?? 'N/A'}`,
      `Matrícula: ${input.vehiclePlate ?? 'N/A'}`,
      `Técnico: ${input.technicianName ?? 'N/A'}`,
      `Motivo: ${summary}`,
      input.notes?.trim() ? `Notas: ${input.notes.trim()}` : null,
      `ID cita interna: ${input.appointmentId}`,
    ].filter(Boolean);

    const includeAttendees =
      (process.env.GOOGLE_CALENDAR_INCLUDE_ATTENDEES ?? 'false')
        .toLowerCase()
        .trim() === 'true';

    const colorId = this.resolveColorId(input.technicianLogin, input.technicianName);

    return {
      summary,
      description: lines.join('\n'),
      start: { dateTime: input.startAt, timeZone: timezone },
      end: { dateTime: input.endAt, timeZone: timezone },
      ...(includeAttendees && input.clientEmail
        ? { attendees: [{ email: input.clientEmail }] }
        : {}),
      ...(colorId ? { colorId } : {}),
      extendedProperties: {
        private: {
          appointmentId: String(input.appointmentId),
          vehiclePlate: input.vehiclePlate ?? '',
        },
      },
    };
  }

  private resolveColorId(technicianLogin?: string | null, technicianName?: string | null): string | null {
    const rawMap = (process.env.GOOGLE_CALENDAR_COLOR_MAP ?? '').trim();
    if (!rawMap) return null;

    const map = new Map<string, string>();
    for (const chunk of rawMap.split(',')) {
      const [k, v] = chunk.split(':').map((s) => s.trim());
      if (!k || !v) continue;
      if (!/^\d+$/.test(v)) continue;
      map.set(this.normalizeKey(k), v);
    }

    const byLogin = technicianLogin ? map.get(this.normalizeKey(technicianLogin)) : null;
    if (byLogin) return byLogin;
    const byName = technicianName ? map.get(this.normalizeKey(technicianName)) : null;
    if (byName) return byName;
    return map.get('default') ?? null;
  }

  private normalizeKey(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  private async callCalendarJson(
    cfg: GoogleCalendarConfig,
    method: string,
    path: string,
    body?: unknown,
    retryUnauthorized = true,
  ): Promise<{ ok: boolean; status: number; text: string; json: Record<string, unknown> | null }> {
    const accessToken = await this.getAccessToken(cfg);
    const response = await fetch(`https://www.googleapis.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let parsed: Record<string, unknown> | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    if (response.status === 401 && retryUnauthorized) {
      this.tokenCache = null;
      return this.callCalendarJson(cfg, method, path, body, false);
    }

    return { ok: response.ok, status: response.status, text, json: parsed };
  }

  private async getAccessToken(cfg: GoogleCalendarConfig): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.tokenCache && this.tokenCache.expiresAtEpochSec > now + 30) {
      return this.tokenCache.accessToken;
    }

    const iat = now;
    const exp = now + 3600;
    const assertion = this.signJwt({
      iss: cfg.clientEmail,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: cfg.tokenUri,
      iat,
      exp,
    }, cfg.privateKey);

    const form = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });

    const tokenRes = await fetch(cfg.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

    const tokenText = await tokenRes.text();
    let tokenJson: Record<string, unknown> | null = null;
    try {
      tokenJson = JSON.parse(tokenText) as Record<string, unknown>;
    } catch {
      tokenJson = null;
    }

    if (!tokenRes.ok || !tokenJson?.access_token) {
      throw new Error(this.extractError(tokenText, tokenJson));
    }

    const accessToken = String(tokenJson.access_token);
    const expiresIn = Number(tokenJson.expires_in ?? 3600);
    this.tokenCache = {
      accessToken,
      expiresAtEpochSec: now + Math.max(60, expiresIn),
    };
    return accessToken;
  }

  private signJwt(payload: Record<string, unknown>, privateKey: string) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const encodedHeader = this.base64Url(JSON.stringify(header));
    const encodedPayload = this.base64Url(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(privateKey, 'base64');
    const encodedSignature = this.base64UrlFromBase64(signature);
    return `${signingInput}.${encodedSignature}`;
  }

  private base64Url(data: string) {
    return Buffer.from(data, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private base64UrlFromBase64(data: string) {
    return data
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private extractError(raw: string, parsed: Record<string, unknown> | null) {
    if (parsed?.error_description && typeof parsed.error_description === 'string') {
      return parsed.error_description;
    }
    if (parsed?.error && typeof parsed.error === 'string') {
      return parsed.error;
    }
    const nested = parsed?.error as Record<string, unknown> | undefined;
    if (nested?.message && typeof nested.message === 'string') {
      return nested.message;
    }
    if (!raw) return 'Google Calendar request failed';
    return raw.slice(0, 400);
  }

  private async getConfig() {
    if (this.configCache !== undefined) return this.configCache;

    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
    const keyPathRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim();
    const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE?.trim() || 'Europe/Madrid';
    if (!calendarId || !keyPathRaw) {
      this.configCache = null;
      return this.configCache;
    }

    const keyPathCandidates = this.resolveKeyPathCandidates(keyPathRaw);
    let selectedPath: string | null = null;
    for (const candidate of keyPathCandidates) {
      if (await this.exists(candidate)) {
        selectedPath = candidate;
        break;
      }
    }
    if (!selectedPath) {
      this.logger.warn(`No se encontró la clave de Google en: ${keyPathCandidates.join(', ')}`);
      this.configCache = null;
      return this.configCache;
    }

    try {
      const raw = await readFile(selectedPath, 'utf8');
      const parsed = JSON.parse(raw) as GoogleServiceAccountJson;
      const clientEmail = parsed.client_email?.trim();
      const privateKey = parsed.private_key?.replace(/\\n/g, '\n').trim();
      const tokenUri = parsed.token_uri?.trim() || 'https://oauth2.googleapis.com/token';
      if (!clientEmail || !privateKey) {
        this.logger.warn('JSON de cuenta de servicio inválido: faltan client_email/private_key');
        this.configCache = null;
        return this.configCache;
      }
      this.configCache = { calendarId, timezone, tokenUri, clientEmail, privateKey };
      return this.configCache;
    } catch (error) {
      this.logger.warn(`No se pudo leer la cuenta de servicio: ${(error as Error).message}`);
      this.configCache = null;
      return this.configCache;
    }
  }

  private resolveKeyPathCandidates(keyPathRaw: string) {
    if (isAbsolute(keyPathRaw)) return [keyPathRaw];
    return [
      resolve(process.cwd(), keyPathRaw),
      resolve(process.cwd(), 'apps/api', keyPathRaw),
    ];
  }

  private async exists(path: string) {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
