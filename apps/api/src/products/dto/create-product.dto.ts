import {
  IsString, IsNumber, IsOptional, IsBoolean, IsDateString, Min,
  IsArray, ArrayMinSize, ArrayMaxSize, IsObject, IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  category: string = '';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  alertThreshold: number;

  @IsString()
  @IsOptional()
  supplier: string = '';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  acquisitionCost: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellingPrice: number = 0;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsDateString()
  entryDate: string;

  @IsBoolean()
  @IsOptional()
  trackStock?: boolean = true;

  @IsString()
  @IsOptional()
  variantGroup?: string | null;

  @IsString()
  @IsOptional()
  variantLabel?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @IsOptional()
  durationMinutes?: number | null;
}

// One model and all its variants in one go — e.g. labels ["S / Rouge", "M / Rouge"].
export class CreateVariantsDto {
  @IsString()
  group: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  labels: string[];

  /** Initial stock per label; missing → 0. */
  @IsOptional()
  @IsObject()
  quantities?: Record<string, number>;

  /** Optional price per label when it differs from the model's (e.g. XXL costs more). */
  @IsOptional()
  @IsObject()
  prices?: Record<string, number>;

  @IsString() @IsOptional()
  category: string = '';

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @Min(0)
  alertThreshold: number;

  @IsString() @IsOptional()
  supplier: string = '';

  /** Unit cost of one variant. */
  @Type(() => Number) @IsNumber() @Min(0)
  acquisitionCost: number;

  @Type(() => Number) @IsNumber() @Min(0) @IsOptional()
  sellingPrice: number = 0;

  @IsString() @IsOptional()
  imageUrl?: string;

  @IsDateString()
  entryDate: string;

  @IsBoolean() @IsOptional()
  trackStock?: boolean = true;
}

export class RenameVariantGroupDto {
  @IsString()
  from: string;

  @IsString()
  to: string;
}
