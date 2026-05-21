import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ClientsService } from './clients.service';

function ok(data: unknown) {
  return { statusCode: 200, data, error: null };
}

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Roles('ADMIN', 'OFICINA', 'JEFE_TALLER', 'TECNICO')
  async search(@Query('q') q = '', @Query('limit') limit?: string) {
    if (!q.trim()) return ok([]);
    const data = await this.clients.search(q.trim(), limit ? parseInt(limit) : 20);
    return ok(data);
  }

  @Get(':id')
  @Roles('ADMIN', 'OFICINA', 'JEFE_TALLER', 'TECNICO')
  async findOne(@Param('id') id: string) {
    const data = await this.clients.findById(Number(id));
    return ok(data);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OFICINA')
  async update(@Param('id') id: string, @Body() body: { name?: string; phone?: string; email?: string; company?: string }) {
    const data = await this.clients.update(Number(id), body);
    return ok(data);
  }
}
