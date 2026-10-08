import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsNumber, IsOptional, IsInt, IsIn, Min, Matches } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetAmount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  entryTicket: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxInvestors?: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  repaymentDueDate?: string;
}

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  targetAmount?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  entryTicket?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxInvestors?: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  repaymentDueDate?: string;

  @IsString()
  @IsIn(['active', 'closed'])
  @IsOptional()
  status?: string;
}
