import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type AppRoleKey = 'ADMIN' | 'OFICINA' | 'JEFE_TALLER' | 'TECNICO' | 'INVENTARIO' | 'CONTABILIDAD';

export const Roles = (...roles: AppRoleKey[]) => SetMetadata(ROLES_KEY, roles);
