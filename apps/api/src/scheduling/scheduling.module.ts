import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GoogleCalendarService } from './google-calendar.service';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [DatabaseModule],
  providers: [SchedulingService, GoogleCalendarService],
  exports: [SchedulingService, GoogleCalendarService],
})
export class SchedulingModule {}
