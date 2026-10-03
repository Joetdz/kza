import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsInt, IsNotEmpty, Min, Max, ValidateNested, IsArray } from 'class-validator';

export class UpdateBudgetForecastDto {
  @IsString()
  @IsOptional()
  startMonth?: string; // "YYYY-MM"

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  monthlyGrowthPct?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  @IsOptional()
  horizonMonths?: number;
}

export class ForecastProductQtyDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity: number;
}

export class SetForecastProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ForecastProductQtyDto)
  items: ForecastProductQtyDto[];
}

export class CreateForecastExpenseDto {
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
}
