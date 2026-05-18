import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { TechniciansModule } from './technicians/technicians.module';
import { AvailabilityModule } from './availability/availability.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { CalendarModule } from './calendar/calendar.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import { ScheduleRotationModule } from './schedule-rotation/schedule-rotation.module';

const featureModules =
  process.env.NODE_ENV === 'test'
    ? []
    : [
        DatabaseModule,
        AuthModule,
        WorkOrdersModule,
        TechniciansModule,
        AvailabilityModule,
        AppointmentsModule,
        CalendarModule,
        NotificationsModule,
        UsersModule,
        ScheduleRotationModule,
      ];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ...featureModules,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
