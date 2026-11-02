import { ArrayMinSize, IsArray, IsString, IsNumber, IsDateString, IsOptional, IsUUID, Min, IsIn, IsPositive, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { CreateMovementDto as ICreateMovementDto, MovementKind } from '@kza/shared';
import { MOVEMENT_TYPES } from '@kza/shared';

export class CreateMovementDto implements ICreateMovementDto {
  @IsString()
  productId: string;

  @IsIn(MOVEMENT_TYPES)
  type: typeof MOVEMENT_TYPES[number];

  // Sales, initial stock and inventory counts write their own movements.
  @IsIn(['purchase', 'return', 'loss', 'other'])
  @IsOptional()
  kind?: MovementKind;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @IsString()
  @IsOptional()
  reason: string = '';

  @IsDateString()
  date: string;

  // Stock-in only: what one unit of this delivery cost, freight included.
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  unitCost?: number;
}

export class InventoryLineDto {
  @IsUUID()
  productId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  countedQuantity: number;
}

export class CreateInventoryDto {
  @IsDateString()
  date: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InventoryLineDto)
  lines: InventoryLineDto[];
}
