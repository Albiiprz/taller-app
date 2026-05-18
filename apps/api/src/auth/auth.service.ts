import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';

type UserRow = {
  id: number;
  name: string;
  role: string;
  roles_json: unknown;
  login_name: string;
  pin: string;
  is_active: boolean;
};

type JwtPayload = {
  sub: string;
  role: string;
  roles: string[];
  name: string;
  login: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async login(login: string, pin: string) {
    const normalized = login.trim();
    if (!normalized || !pin.trim()) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const res = await this.db.query<UserRow>(
      `SELECT id, name, role, roles_json, login_name, pin, is_active
       FROM users
       WHERE login_name = $1`,
      [normalized],
    );

    const user = res.rows[0];
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    if (user.pin !== pin.trim()) {
      throw new UnauthorizedException('PIN incorrecto');
    }

    const roles = this.parseRoles(user);
    const payload: JwtPayload = {
      sub: String(user.id),
      role: roles[0] ?? user.role,
      roles,
      name: user.name,
      login: user.login_name,
    };
    const { accessToken, refreshToken } = await this.signTokens(payload);

    return {
      accessToken,
      refreshToken,
      user: {
        id: String(user.id),
        name: user.name,
        role: payload.role,
        roles: payload.roles,
        login: user.login_name,
      },
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken?.trim()) {
      throw new UnauthorizedException('Refresh token requerido');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me',
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const res = await this.db.query<UserRow>(
      `SELECT id, name, role, roles_json, login_name, pin, is_active
       FROM users
       WHERE id = $1`,
      [Number(payload.sub)],
    );

    const user = res.rows[0];
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Usuario no válido');
    }

    const roles = this.parseRoles(user);
    const normalizedPayload: JwtPayload = {
      sub: String(user.id),
      role: roles[0] ?? user.role,
      roles,
      name: user.name,
      login: user.login_name,
    };

    const tokens = await this.signTokens(normalizedPayload);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  logout() {
    return { ok: true };
  }

  private async signTokens(payload: JwtPayload) {
    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET ?? 'dev_secret_change_me',
      expiresIn: '8h',
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me',
      expiresIn: '30d',
    });

    return { accessToken, refreshToken };
  }

  private parseRoles(user: Pick<UserRow, 'role' | 'roles_json'>): string[] {
    if (Array.isArray(user.roles_json)) {
      const roles = user.roles_json
        .filter((item): item is string => typeof item === 'string')
        .map((item) => this.normalizeRole(item))
        .filter((item): item is string => Boolean(item));
      if (roles.length > 0) return roles;
    }
    const fallback = this.normalizeRole(user.role);
    return fallback ? [fallback] : [];
  }

  private normalizeRole(raw?: string): string | null {
    if (!raw) return null;
    const normalized = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase()
      .trim();
    if (normalized === 'ADMIN' || normalized === 'ADMINISTRACION') return 'Administración';
    if (normalized === 'OFICINA') return 'Oficina';
    if (normalized === 'JEFE_TALLER' || normalized === 'JEFE_DE_TALLER') return 'Jefe de Taller';
    if (normalized === 'TECNICO') return 'Técnico';
    if (normalized === 'INVENTARIO') return 'Inventario';
    if (normalized === 'CONTABILIDAD') return 'Contabilidad';
    return null;
  }
}
