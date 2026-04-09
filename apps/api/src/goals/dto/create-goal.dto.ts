import { Type } from 'class-transformer';
import { IsString, IsInt, Min } from 'class-validator';
import type { CreateGoalDto as ICreateGoalDto } from '@kza/shared';

export class CreateGoalDto implements ICreateGoalDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetQty: number;
}
