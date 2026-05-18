export class CreateAppointmentDraftDto {
  client?: {
    name?: string;
    phone?: string;
    email?: string;
    type?: string;
  };
  vehicle?: {
    plate?: string;
    vin?: string;
    model?: string;
    notes?: string;
  };
  workType?: string;
  notes?: string;
}
