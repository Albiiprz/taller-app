export class CreateTimeBlockDto {
  type!: 'VACATION' | 'INTERNAL';
  startAt!: string;
  endAt!: string;
  note?: string;
}
