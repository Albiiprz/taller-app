import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CreateAppointmentDraftDto } from './dto/create-appointment-draft.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { ImportGoogleAppointmentsDto } from './dto/import-google-appointments.dto';

function ok(data: unknown) {
  return { statusCode: 200, data, error: null };
}

type ReqUser = { role?: string; name?: string; sub?: string };

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get(':id')
  @Roles('ADMIN', 'OFICINA', 'JEFE_TALLER', 'TECNICO')
  async findOne(@Param('id') id: string) {
    const data = await this.scheduling.getAppointment(id);
    return ok(data);
  }

  @Post()
  @Roles('ADMIN', 'OFICINA')
  async create(@Body() dto: CreateAppointmentDto, @Req() req: Request) {
    const user = (req as Request & { user?: ReqUser }).user;
    const data = await this.scheduling.createAppointment({
      ...dto,
      actorRole: user?.role,
      actorName: user?.name,
    });
    return ok(data);
  }

  @Post('draft')
  @Roles('ADMIN', 'OFICINA')
  async createDraft(@Body() dto: CreateAppointmentDraftDto, @Req() req: Request) {
    const user = (req as Request & { user?: ReqUser }).user;
    const data = await this.scheduling.createAppointmentDraft({
      ...dto,
      actorRole: user?.role,
      actorName: user?.name,
    });
    return ok(data);
  }

  @Patch(':id')
  @Roles('ADMIN', 'OFICINA')
  async update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto, @Req() req: Request) {
    const user = (req as Request & { user?: ReqUser }).user;
    const data = await this.scheduling.updateAppointment(id, {
      ...dto,
      actorRole: user?.role,
      actorName: user?.name,
    });
    return ok(data);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'OFICINA')
  async cancel(@Param('id') id: string, @Body() dto: CancelAppointmentDto, @Req() req: Request) {
    const user = (req as Request & { user?: ReqUser }).user;
    const data = await this.scheduling.cancelAppointment(id, {
      reason: dto.reason,
      cancelledBy: user?.sub,
      actorRole: user?.role,
      actorName: user?.name,
    });
    return ok(data);
  }

  @Post('import-google')
  @Roles('ADMIN', 'OFICINA')
  async importGoogle(@Body() dto: ImportGoogleAppointmentsDto, @Req() req: Request) {
    const user = (req as Request & { user?: ReqUser }).user;
    const data = await this.scheduling.importFromGoogleCalendar({
      since: dto.since,
      until: dto.until,
      dryRun: dto.dryRun,
      actorRole: user?.role,
      actorName: user?.name,
    });
    return ok(data);
  }
}
