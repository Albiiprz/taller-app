import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsController } from './appointments.controller';

@Module({
  imports: [SchedulingModule, AuthModule],
  controllers: [AppointmentsController],
})
export class AppointmentsModule {}
