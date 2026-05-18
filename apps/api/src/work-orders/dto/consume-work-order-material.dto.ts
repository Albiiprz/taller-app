export class ConsumeWorkOrderMaterialDto {
  productId!: string;
  qty!: number;
  reason?: string;
  label?: string;
  origin?: string;
  actorRole?: string;
  actorName?: string;
}
