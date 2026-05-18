import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRoleKey, ROLES_KEY } from './roles.decorator';

function mapRole(raw?: string): AppRoleKey | null {
  if (!raw) return null;
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase()
    .trim();
  if (normalized === 'ADMIN' || normalized === 'ADMINISTRACION') return 'ADMIN';
  if (normalized === 'OFICINA') return 'OFICINA';
  if (normalized === 'JEFE_TALLER' || normalized === 'JEFE_DE_TALLER') return 'JEFE_TALLER';
  if (normalized === 'TECNICO') return 'TECNICO';
  if (normalized === 'INVENTARIO') return 'INVENTARIO';
  if (normalized === 'CONTABILIDAD') return 'CONTABILIDAD';
  return null;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AppRoleKey[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: { role?: string; roles?: string[] } }>();
    const tokenRoles = [
      ...(Array.isArray(req.user?.roles) ? req.user.roles : []),
      ...(req.user?.role ? [req.user.role] : []),
    ];
    const mappedRoles = [...new Set(tokenRoles.map((value) => mapRole(value)).filter((value): value is AppRoleKey => Boolean(value)))];

    if (!mappedRoles.some((role) => requiredRoles.includes(role))) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    return true;
  }
}
