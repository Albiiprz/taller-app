import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SchedulingService } from '../scheduling/scheduling.service';

function ok(data: unknown) {
  return { statusCode: 200, data, error: null };
}

@Controller('calendar')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get('summary')
  @Roles('ADMIN', 'OFICINA', 'JEFE_TALLER')
  async summary(@Query('from') from: string, @Query('to') to: string) {
    const data = await this.scheduling.calendarSummary(from, to);
    return ok(data);
  }
}
