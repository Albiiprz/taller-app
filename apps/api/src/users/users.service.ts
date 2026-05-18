import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type UserRow = {
  id: number;
  name: string;
  role: string;
  roles_json: unknown;
  login_name: string;
  pin: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  extra: string | null;
  avatar_data_url: string | null;
  is_active: boolean;
  updated_at: string;
  created_at: string;
};

type ListInput = {
  includeInactive?: boolean;
  role?: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async list(input: ListInput = {}) {
    const values: unknown[] = [];
    const where: string[] = [];

    if (!input.includeInactive) where.push('is_active = TRUE');
    if (input.role?.trim()) {
      const canonicalRole = this.normalizeRole(input.role.trim());
      if (canonicalRole) {
        values.push(canonicalRole);
        where.push(`(role = $${values.length} OR roles_json ? $${values.length})`);
      }
    }

    const sql = `
      SELECT id, name, role, roles_json, login_name, pin, phone, email, birth_date, extra, avatar_data_url, is_active, updated_at, created_at
      FROM users
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY name ASC
    `;
    const res = await this.db.query<UserRow>(sql, values);
    return res.rows.map((u) => this.toResponse(u, true));
  }

  async listLoginUsers() {
    const res = await this.db.query<UserRow>(
      `SELECT id, name, role, roles_json, login_name, pin, phone, email, birth_date, extra, avatar_data_url, is_active, updated_at, created_at
       FROM users
       WHERE is_active = TRUE
       ORDER BY name ASC`,
    );
    return res.rows.map((u) => ({
      id: String(u.id),
      name: u.name,
      role: u.role,
      roles: this.parseRoles(u),
      login: u.login_name,
      pinRequired: Boolean(u.pin && u.pin.trim()),
    }));
  }

  async create(input: {
    name: string;
    role?: string;
    roles?: string[];
    login: string;
    pin: string;
    phone?: string;
    email?: string;
    birthDate?: string;
    extra?: string;
    avatarDataUrl?: string;
    isActive?: boolean;
  }) {
    const normalized = this.normalizePayload(input, true);
    const exists = await this.db.query<{ id: number }>(
      `SELECT id FROM users WHERE login_name = $1 LIMIT 1`,
      [normalized.login],
    );
    if (exists.rows[0]) throw new BadRequestException('El login ya existe');

    const created = await this.db.query<UserRow>(
      `INSERT INTO users (name, role, roles_json, login_name, pin, phone, email, birth_date, extra, avatar_data_url, is_active, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING id, name, role, roles_json, login_name, pin, phone, email, birth_date, extra, avatar_data_url, is_active, updated_at, created_at`,
      [
        normalized.name,
        normalized.role,
        JSON.stringify(normalized.roles),
        normalized.login,
        normalized.pin,
        normalized.phone,
        normalized.email,
        normalized.birthDate,
        normalized.extra,
        normalized.avatarDataUrl,
        normalized.isActive,
      ],
    );
    return this.toResponse(created.rows[0], true);
  }

  async update(id: string, input: {
    name?: string;
    role?: string;
    roles?: string[];
    login?: string;
    pin?: string;
    phone?: string;
    email?: string;
    birthDate?: string;
    extra?: string;
    avatarDataUrl?: string;
    isActive?: boolean;
  }) {
    const numericId = this.parseId(id);
    const current = await this.db.query<UserRow>(
      `SELECT id, name, role, roles_json, login_name, pin, phone, email, birth_date, extra, avatar_data_url, is_active, updated_at, created_at
       FROM users WHERE id = $1`,
      [numericId],
    );
    const row = current.rows[0];
    if (!row) throw new NotFoundException('Usuario no encontrado');

    const normalized = this.normalizePayload(
      {
        name: input.name ?? row.name,
        role: input.role ?? row.role,
        roles: input.roles ?? this.parseRoles(row),
        login: input.login ?? row.login_name,
        pin: input.pin ?? row.pin,
        phone: input.phone ?? row.phone ?? undefined,
        email: input.email ?? row.email ?? undefined,
        birthDate: input.birthDate ?? row.birth_date ?? undefined,
        extra: input.extra ?? row.extra ?? undefined,
        avatarDataUrl: input.avatarDataUrl ?? row.avatar_data_url ?? undefined,
        isActive: input.isActive ?? row.is_active,
      },
      true,
    );

    if (normalized.login !== row.login_name) {
      const exists = await this.db.query<{ id: number }>(
        `SELECT id FROM users WHERE login_name = $1 AND id <> $2 LIMIT 1`,
        [normalized.login, numericId],
      );
      if (exists.rows[0]) throw new BadRequestException('El login ya existe');
    }

    const updated = await this.db.query<UserRow>(
      `UPDATE users
       SET name = $2, role = $3, roles_json = $4::jsonb, login_name = $5, pin = $6, phone = $7, email = $8,
           birth_date = $9, extra = $10, avatar_data_url = $11, is_active = $12, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, role, roles_json, login_name, pin, phone, email, birth_date, extra, avatar_data_url, is_active, updated_at, created_at`,
      [
        numericId,
        normalized.name,
        normalized.role,
        JSON.stringify(normalized.roles),
        normalized.login,
        normalized.pin,
        normalized.phone,
        normalized.email,
        normalized.birthDate,
        normalized.extra,
        normalized.avatarDataUrl,
        normalized.isActive,
      ],
    );
    return this.toResponse(updated.rows[0], true);
  }

  async deactivate(id: string) {
    const numericId = this.parseId(id);
    const res = await this.db.query<{ id: number }>(
      `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [numericId],
    );
    if (!res.rows[0]) throw new NotFoundException('Usuario no encontrado');
    return { deleted: true };
  }

  private normalizePayload(
    input: {
      name?: string;
      role?: string;
      roles?: string[];
      login?: string;
      pin?: string;
      phone?: string;
      email?: string;
      birthDate?: string;
      extra?: string;
      avatarDataUrl?: string;
      isActive?: boolean;
    },
    requireMandatory: boolean,
  ) {
    const name = input.name?.trim() ?? '';
    const roles = this.normalizeRoles(input.roles, input.role);
    const role = roles[0] ?? '';
    const login = input.login?.trim().toLowerCase() ?? '';
    const pin = input.pin?.trim() ?? '';

    if (requireMandatory) {
      if (!name) throw new BadRequestException('name es obligatorio');
      if (!roles.length) throw new BadRequestException('roles es obligatorio');
      if (!login) throw new BadRequestException('login es obligatorio');
      if (!pin) throw new BadRequestException('pin es obligatorio');
    }

    return {
      name,
      role,
      roles,
      login,
      pin,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      birthDate: input.birthDate?.trim() || null,
      extra: input.extra?.trim() || null,
      avatarDataUrl: input.avatarDataUrl?.trim() || null,
      isActive: input.isActive ?? true,
    };
  }

  private normalizeRole(roleRaw: string): string {
    const raw = roleRaw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (raw === 'administracion' || raw === 'admin') return 'Administración';
    if (raw === 'oficina') return 'Oficina';
    if (raw === 'jefe de taller' || raw === 'jefe_taller') return 'Jefe de Taller';
    if (raw === 'tecnico') return 'Técnico';
    if (raw === 'inventario') return 'Inventario';
    if (raw === 'contabilidad') return 'Contabilidad';
    return '';
  }

  private normalizeRoles(rolesRaw?: string[], roleRaw?: string) {
    const collected = [
      ...(Array.isArray(rolesRaw) ? rolesRaw : []),
      ...(roleRaw ? [roleRaw] : []),
    ];
    const normalized = collected
      .map((value) => this.normalizeRole(value))
      .filter((value): value is string => Boolean(value));
    const unique = [...new Set(normalized)];
    return unique;
  }

  private parseId(value: string): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new BadRequestException('id inválido');
    return n;
  }

  private toResponse(row: UserRow, withPin = false) {
    const roles = this.parseRoles(row);
    return {
      id: String(row.id),
      name: row.name,
      role: roles[0] ?? row.role,
      roles,
      login: row.login_name,
      pin: withPin ? row.pin : undefined,
      phone: row.phone,
      email: row.email,
      birthDate: row.birth_date,
      extra: row.extra,
      avatarDataUrl: row.avatar_data_url,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseRoles(row: Pick<UserRow, 'role' | 'roles_json'>): string[] {
    const parsed = row.roles_json;
    if (Array.isArray(parsed)) {
      const roles = parsed
        .filter((item) => typeof item === 'string')
        .map((item) => this.normalizeRole(item))
        .filter((item): item is string => Boolean(item));
      if (roles.length) return [...new Set(roles)];
    }
    const legacy = this.normalizeRole(row.role);
    return legacy ? [legacy] : [];
  }
}
