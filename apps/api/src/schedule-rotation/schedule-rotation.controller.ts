import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SchedulingService } from '../scheduling/scheduling.service';

function ok(data: unknown) {
  return { statusCode: 200, data, error: null };
}

@Controller('schedule-rotation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleRotationController {
  constructor(private readonly scheduling: SchedulingService) {}

  // Hardcoded "taller" template (Semana A/B) as requested.
  @Post('malu/apply')
  @Roles('ADMIN')
  async applyMalu() {
    const data = await this.scheduling.applyMaluWeekRotation();
    return ok(data);
  }
}

