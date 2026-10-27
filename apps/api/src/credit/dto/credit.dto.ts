import { IsArray, IsIn, IsNumber, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AddPaymentDto {
  @Type(() => Number) @IsNumber() @Min(0.01)
  amount: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @IsOptional() @IsIn(['cash', 'mobile_money', 'bank', 'other'])
  method?: string;

  @IsOptional() @IsString()
  note?: string;
}

export class InstallmentDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate: string;

  @Type(() => Number) @IsNumber() @Min(0.01)
  amount: number;
}

export class ScheduleDto {
  /** Balance due date when there is no instalment plan. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string | null;

  @IsArray() @ValidateNested({ each: true }) @Type(() => InstallmentDto)
  installments: InstallmentDto[];
}
