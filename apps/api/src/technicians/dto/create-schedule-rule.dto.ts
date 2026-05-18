export class CreateScheduleRuleDto {
  dayOfWeek!: number;
  startTime!: string;
  endTime!: string;
  weekPattern?: 'ALL' | 'A' | 'B';
  isActive?: boolean;
}
