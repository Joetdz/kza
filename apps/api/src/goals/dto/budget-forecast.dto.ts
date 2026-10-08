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

  // Surcharge manuelle du budget pub (premier mois). undefined = inchangé,
  // null = retire la surcharge (revient au calcul automatique). Pas de @Type()
  // ici : Number(null) vaudrait 0 et écraserait silencieusement l'intention de
  // "retirer la surcharge" par un budget pub figé à 0.
  @IsOptional()
  @IsNumber()
  @Min(0)
  adBudgetOverride?: number | null;
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
