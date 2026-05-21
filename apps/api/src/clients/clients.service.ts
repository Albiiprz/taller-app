import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface ClientRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  created_at: string;
  plates: string[];
  models: string[];
  last_appointment: string | null;
}

@Injectable()
export class ClientsService {
  constructor(private readonly db: DatabaseService) {}

  async search(q: string, limit = 20): Promise<ClientRow[]> {
    const term = `%${q.toLowerCase()}%`;
    const rows = await this.db.query<{
      id: number; name: string; phone: string | null; email: string | null;
      company: string | null; created_at: string;
      plates: string; models: string; last_appointment: string | null;
    }>(
      `SELECT c.id, c.name, c.phone, c.email, c.company, c.created_at,
              STRING_AGG(DISTINCT v.plate, ',' ORDER BY v.plate) AS plates,
              STRING_AGG(DISTINCT v.model, ',' ORDER BY v.model) AS models,
              MAX(a.start_at) AS last_appointment
         FROM clients c
         LEFT JOIN vehicles v ON v.client_id = c.id
         LEFT JOIN appointments a ON a.client_id = c.id AND a.status = 'ACTIVE'
        WHERE LOWER(c.name) LIKE $1
           OR c.phone LIKE $1
           OR LOWER(COALESCE(c.company,'')) LIKE $1
           OR EXISTS (SELECT 1 FROM vehicles vv WHERE vv.client_id = c.id AND LOWER(vv.plate) LIKE $1)
        GROUP BY c.id
        ORDER BY MAX(a.start_at) DESC NULLS LAST, c.name
        LIMIT $2`,
      [term, limit],
    );
    return rows.rows.map((r) => ({
      ...r,
      plates: r.plates ? r.plates.split(',').filter(Boolean) : [],
      models: r.models ? r.models.split(',').filter(Boolean) : [],
    }));
  }

  async findById(id: number) {
    const clientRes = await this.db.query<{
      id: number; name: string; phone: string | null; email: string | null;
      company: string | null; created_at: string;
    }>(
      `SELECT id, name, phone, email, company, created_at FROM clients WHERE id = $1`,
      [id],
    );
    if (!clientRes.rows[0]) return null;
    const client = clientRes.rows[0];

    const vehiclesRes = await this.db.query<{
      id: number; plate: string; model: string | null; vin: string | null;
      vehicle_type: string | null; created_at: string;
    }>(
      `SELECT id, plate, model, vin, vehicle_type, created_at FROM vehicles WHERE client_id = $1 ORDER BY created_at DESC`,
      [id],
    );

    const appsRes = await this.db.query<{
      id: number; work_type: string | null; start_at: string | null;
      status: string; plate: string | null;
    }>(
      `SELECT a.id, a.work_type, a.start_at, a.status, v.plate
         FROM appointments a
         LEFT JOIN vehicles v ON v.id = a.vehicle_id
        WHERE a.client_id = $1
        ORDER BY a.start_at DESC NULLS LAST
        LIMIT 20`,
      [id],
    );

    return { ...client, vehicles: vehiclesRes.rows, appointments: appsRes.rows };
  }

  async update(id: number, data: { name?: string; phone?: string; email?: string; company?: string }) {
    await this.db.query(
      `UPDATE clients
          SET name    = COALESCE($2, name),
              phone   = COALESCE($3, phone),
              email   = COALESCE($4, email),
              company = COALESCE($5, company)
        WHERE id = $1`,
      [id, data.name ?? null, data.phone ?? null, data.email ?? null, data.company ?? null],
    );
    return this.findById(id);
  }
}
