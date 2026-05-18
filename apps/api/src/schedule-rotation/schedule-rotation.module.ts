import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ScheduleRotationController } from './schedule-rotation.controller';

@Module({
  imports: [SchedulingModule, AuthModule],
  controllers: [ScheduleRotationController],
})
export class ScheduleRotationModule {}
