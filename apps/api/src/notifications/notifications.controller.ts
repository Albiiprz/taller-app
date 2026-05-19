import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
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

  @Get('push/public-key')
  async getPushPublicKey() {
    const data = { publicKey: this.notifications.getPushPublicKey() };
    return ok(data);
  }

  @Post('push/subscribe')
  async subscribePush(
    @Req() req: { user?: { sub?: string }; headers?: { ['user-agent']?: string } },
    @Body()
    body: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
  ) {
    const userId = Number(req.user?.sub ?? 0);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new UnauthorizedException('Usuario no válido');
    }
    const data = await this.notifications.upsertPushSubscription({
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys?.p256dh,
      auth: body.keys?.auth,
      userAgent: req.headers?.['user-agent'],
    });
    return ok(data);
  }

  @Delete('push/subscribe')
  async unsubscribePush(
    @Req() req: { user?: { sub?: string } },
    @Body() body: { endpoint: string },
  ) {
    const userId = Number(req.user?.sub ?? 0);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new UnauthorizedException('Usuario no válido');
    }
    const data = await this.notifications.removePushSubscription({
      userId,
      endpoint: body.endpoint,
    });
    return ok(data);
  }

  @Post('push/test')
  async sendPushTest(@Req() req: { user?: { sub?: string } }) {
    const userId = Number(req.user?.sub ?? 0);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new UnauthorizedException('Usuario no válido');
    }
    const data = await this.notifications.sendPushTest(userId);
    return ok(data);
  }

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
