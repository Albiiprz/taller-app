export class CreateProductDto {
  id!: string;
  name!: string;
  description?: string;
  stock?: number;
  minStock?: number;
  unit?: string;
  location?: string;
  barcode?: string;
}
