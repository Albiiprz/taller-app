export class UpdateWorkOrderStatusDto {
  toStatus!: string;
  reason?: string;
  force?: boolean;
  origin?: string;
  actorRole?: string;
  actorName?: string;
}
