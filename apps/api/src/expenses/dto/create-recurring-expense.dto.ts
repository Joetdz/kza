import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsDateString, IsNotEmpty, IsInt, IsBoolean, Min, Max } from 'class-validator';

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

  // Clamped to 28 so it fires reliably every month regardless of month length — no
  // February/30-day-month edge case to handle.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  @IsOptional()
  dayOfMonth?: number = 1;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
