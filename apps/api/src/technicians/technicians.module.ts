import { Module } from '@nestjs/common';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { AuthModule } from '../auth/auth.module';
import { TechniciansController } from './technicians.controller';

@Module({
  imports: [SchedulingModule, AuthModule],
  controllers: [TechniciansController],
})
export class TechniciansModule {}
