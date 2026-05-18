export class CreateWorkOrderDto {
  plate!: string;
  title!: string;
  priority!: string;
  status?: string;
  clientId?: number;
  vehicleId?: number;
  assignedToUserId?: number;
  actorRole?: string;
  actorName?: string;
}
