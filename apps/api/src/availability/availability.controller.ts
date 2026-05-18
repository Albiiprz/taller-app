import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SchedulingService } from '../scheduling/scheduling.service';

function ok(data: unknown) {
  return { statusCode: 200, data, error: null };
}

@Controller('availability')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AvailabilityController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('technicians')
  @Roles('ADMIN', 'OFICINA')
  async byDay(
    @Query('date') date: string,
    @Query('durationMinutes') durationMinutes: string,
  ) {
    const data = await this.scheduling.getTechniciansAvailabilityByDate(date, Number(durationMinutes));
    return ok(data);
  }

  @Get('technicians/:id')
  @Roles('ADMIN', 'OFICINA')
  async byRange(
    @Param('id') id: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('durationMinutes') durationMinutes: string,
  ) {
    const data = await this.scheduling.getTechnicianAvailabilityRange(
      id,
      from,
      to,
      Number(durationMinutes),
    );
    return ok(data);
  }
}
