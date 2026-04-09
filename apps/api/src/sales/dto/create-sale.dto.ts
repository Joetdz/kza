import { Type } from 'class-transformer';
import {
  IsString, IsArray, IsDateString, IsOptional,
  IsNumber, Min, ValidateNested, IsIn,
} from 'class-validator';
import type { CreateSaleDto as ICreateSaleDto, SaleItem as ISaleItem } from '@kza/shared';
import { SALE_CHANNELS, SALE_STATUSES } from '@kza/shared';

export class SaleItemDto implements ISaleItem {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.1)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateSaleDto implements ICreateSaleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsIn(SALE_CHANNELS)
  channel: typeof SALE_CHANNELS[number];

  @IsDateString()
  date: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsIn(SALE_STATUSES)
  @IsOptional()
  status: typeof SALE_STATUSES[number] = 'paid';

  @IsString()
  @IsOptional()
  deliveryZone?: string;
}
