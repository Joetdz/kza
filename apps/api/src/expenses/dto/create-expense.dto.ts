import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsDateString, IsIn, IsNotEmpty, Min } from 'class-validator';
import type { CreateExpenseDto as ICreateExpenseDto } from '@kza/shared';
import { SALE_CHANNELS } from '@kza/shared';

export class CreateExpenseDto implements ICreateExpenseDto {
  // Free text — EXPENSE_CATEGORIES are just the built-in suggestions shown in the UI,
  // a business can type its own category name too.
  @IsString()
  @IsNotEmpty()
  category: string;

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
