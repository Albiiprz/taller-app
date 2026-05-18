import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsService } from './notifications.service';

function ok(data: unknown) {
  return { statusCode: 200, data, error: null };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('jobs')
  @Roles('ADMIN', 'OFICINA')
  async listJobs(@Query('status') status?: string) {
    const data = await this.notifications.listJobs(status);
    return ok(data);
  }

  @Post('jobs/process-due')
  @Roles('ADMIN', 'OFICINA')
  async processDue() {
    const data = await this.notifications.processDueJobs();
    return ok(data);
  }
}
