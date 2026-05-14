import { IsString, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
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
}
