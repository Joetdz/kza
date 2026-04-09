import { IsString, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { CreateProductDto as ICreateProductDto } from '@kza/shared';

export class CreateProductDto implements ICreateProductDto {
  @IsString()
  name: string;

  @IsString()
  sku: string;

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
