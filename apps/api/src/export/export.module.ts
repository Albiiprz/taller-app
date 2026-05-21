import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ExportController } from './export.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ExportController],
})
export class ExportModule {}
