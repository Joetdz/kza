import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn } from 'class-validator';
import { ALL_MODULE_KEYS } from '@kza/shared';

export class CreateBusinessDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsString() @IsOptional()
  sector?: string;

  /** Omitted → the sector's preset. */
  @IsOptional() @IsArray() @IsIn(ALL_MODULE_KEYS, { each: true })
  modules?: string[];

  @IsString() @IsOptional()
  country?: string;

  @IsString() @IsOptional()
  currency?: string;

  @IsString() @IsNotEmpty()
  whatsappPhone: string;

  @IsString() @IsOptional()
  phone?: string;

  @IsString() @IsOptional()
  city?: string;

  @IsString() @IsOptional()
  logoUrl?: string;
}

export class UpdateBusinessDto {
  @IsString() @IsOptional()
  name?: string;

  @IsString() @IsOptional()
  sector?: string;

  @IsOptional() @IsArray() @IsIn(ALL_MODULE_KEYS, { each: true })
  modules?: string[];

  @IsString() @IsOptional()
  country?: string;

  @IsString() @IsOptional()
  currency?: string;

  @IsString() @IsOptional()
  whatsappPhone?: string;

  @IsString() @IsOptional()
  phone?: string;

  @IsString() @IsOptional()
  city?: string;

  @IsString() @IsOptional()
  logoUrl?: string;
}
