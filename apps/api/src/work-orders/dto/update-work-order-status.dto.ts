export class UpdateWorkOrderStatusDto {
  toStatus!: string;
  reason?: string;
  origin?: string;
  actorRole?: string;
  actorName?: string;
}
