import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AuthModule } from '../auth/auth.module';
import { AvailabilityController } from './availability.controller';

@Module({
  imports: [SchedulingModule, AuthModule],
  controllers: [AvailabilityController],
})
export class AvailabilityModule {}
