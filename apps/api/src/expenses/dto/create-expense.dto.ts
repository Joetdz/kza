import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsDateString, IsIn, Min } from 'class-validator';
import type { CreateExpenseDto as ICreateExpenseDto } from '@kza/shared';
import { EXPENSE_CATEGORIES, SALE_CHANNELS } from '@kza/shared';

export class CreateExpenseDto implements ICreateExpenseDto {
  @IsIn(EXPENSE_CATEGORIES)
  category: typeof EXPENSE_CATEGORIES[number];

  @IsString()
  @IsOptional()
  productId?: string;

  @IsIn(SALE_CHANNELS)
  @IsOptional()
  channel?: typeof SALE_CHANNELS[number];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  description: string = '';

  @IsDateString()
  date: string;
}
