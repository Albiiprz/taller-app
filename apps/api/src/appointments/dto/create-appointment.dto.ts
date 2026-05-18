export class CreateAppointmentDto {
  client!: {
    name: string;
    phone: string;
    email?: string;
    type?: string;
  };
  vehicle?: {
    plate?: string;
    vin?: string;
    model?: string;
    notes?: string;
  };
  technicianId!: string;
  startAt!: string;
  endAt?: string;
  durationMinutes?: number;
  workType!: string;
  notes?: string;
}
