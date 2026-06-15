import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateBusinessDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsString() @IsOptional()
  sector?: string;

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
