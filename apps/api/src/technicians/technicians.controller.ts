import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CreateScheduleRuleDto } from './dto/create-schedule-rule.dto';
import { UpdateScheduleRuleDto } from './dto/update-schedule-rule.dto';
import { CreateTimeBlockDto } from './dto/create-time-block.dto';

function ok(data: unknown) {
  return { statusCode: 200, data, error: null };
}

@Controller('technicians')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TechniciansController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Post(':id/schedule-rules')
  @Roles('ADMIN')
  async createScheduleRule(@Param('id') id: string, @Body() dto: CreateScheduleRuleDto) {
    const data = await this.scheduling.createScheduleRule(id, dto);
    return ok(data);
  }

  @Get(':id/schedule-rules')
  @Roles('ADMIN', 'OFICINA', 'JEFE_TALLER', 'TECNICO')
  async listScheduleRules(@Param('id') id: string) {
    const data = await this.scheduling.listScheduleRules(id);
    return ok(data);
  }

  @Patch(':id/schedule-rules/:ruleId')
  @Roles('ADMIN')
  async updateScheduleRule(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateScheduleRuleDto,
  ) {
    const data = await this.scheduling.updateScheduleRule(id, ruleId, dto);
    return ok(data);
  }

  @Delete(':id/schedule-rules/:ruleId')
  @Roles('ADMIN')
  async deleteScheduleRule(@Param('id') id: string, @Param('ruleId') ruleId: string) {
    const data = await this.scheduling.deleteScheduleRule(id, ruleId);
    return ok(data);
  }

  @Post(':id/time-blocks')
  @Roles('ADMIN')
  async createTimeBlock(@Param('id') id: string, @Body() dto: CreateTimeBlockDto) {
    const data = await this.scheduling.createTimeBlock(id, dto);
    return ok(data);
  }

  @Get(':id/time-blocks')
  @Roles('ADMIN', 'OFICINA', 'JEFE_TALLER', 'TECNICO')
  async listTimeBlocks(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string) {
    const data = await this.scheduling.listTimeBlocks(id, from, to);
    return ok(data);
  }

  @Delete(':id/time-blocks/:blockId')
  @Roles('ADMIN')
  async deleteTimeBlock(@Param('id') id: string, @Param('blockId') blockId: string) {
    const data = await this.scheduling.deleteTimeBlock(id, blockId);
    return ok(data);
  }
}
