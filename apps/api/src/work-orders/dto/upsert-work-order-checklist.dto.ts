export class UpsertWorkOrderChecklistDto {
  km?: string;
  fuel?: string;
  damages?: boolean;
  damagesText?: string;
  hasKeys?: boolean;
  hasDocs?: boolean;
  hasTachoCard?: boolean;
  tachoIssue?: boolean;
  extra?: string;
  reason?: string;
  origin?: string;
  actorRole?: string;
  actorName?: string;
}
