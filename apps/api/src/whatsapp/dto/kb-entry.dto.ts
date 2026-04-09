import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class KbEntryDto {
  @IsIn(['faq', 'product', 'policy', 'script', 'snippet'])
  category: string;

  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsOptional() @IsString()
  closingScript?: string;

  @IsOptional() @IsString()
  productId?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}

export class UpdateKbEntryDto {
  @IsOptional() @IsIn(['faq', 'product', 'policy', 'script', 'snippet'])
  category?: string;

  @IsOptional() @IsString()
  title?: string;

  @IsOptional() @IsString()
  content?: string;

  @IsOptional() @IsString()
  closingScript?: string;

  @IsOptional() @IsString()
  productId?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}
