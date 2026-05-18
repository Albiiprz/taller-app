import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AuthModule } from '../auth/auth.module';
import { CalendarController } from './calendar.controller';

@Module({
  imports: [SchedulingModule, AuthModule],
  controllers: [CalendarController],
})
export class CalendarModule {}
