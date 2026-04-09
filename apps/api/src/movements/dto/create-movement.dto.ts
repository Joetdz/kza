import { IsString, IsNumber, IsDateString, IsOptional, Min, IsIn, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import type { CreateMovementDto as ICreateMovementDto } from '@kza/shared';
import { MOVEMENT_TYPES } from '@kza/shared';

export class CreateMovementDto implements ICreateMovementDto {
  @IsString()
  productId: string;

  @IsIn(MOVEMENT_TYPES)
  type: typeof MOVEMENT_TYPES[number];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity: number;

  @IsString()
  @IsOptional()
  reason: string = '';

  @IsDateString()
  date: string;
}
