import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsDateString, IsNotEmpty, IsInt, IsBoolean, IsIn, ValidateIf, Min, Max } from 'class-validator';

export const RECURRING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'annual'] as const;

export class CreateRecurringExpenseDto {
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsOptional()
  description?: string = '';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsIn(RECURRING_FREQUENCIES)
  @IsOptional()
  frequency?: string = 'monthly';

  // 0=dimanche..6=samedi — only meaningful (and required) for weekly.
  @ValidateIf(o => o.frequency === 'weekly')
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  // Clamped to 28 so it fires reliably every month regardless of month length — only
  // meaningful (and required) for monthly and annual.
  @ValidateIf(o => o.frequency === 'monthly' || o.frequency === 'annual')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  // Only meaningful (and required) for annual.
  @ValidateIf(o => o.frequency === 'annual')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
