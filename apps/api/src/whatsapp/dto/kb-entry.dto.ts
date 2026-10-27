import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

// 'learned' = drafted from a human's manual reply; 'unanswered' = a customer question the
// AI couldn't answer, waiting for the owner to write the answer.
export const KB_CATEGORIES = [
  'faq', 'product', 'policy', 'script', 'snippet', 'correction', 'website', 'social', 'history', 'learned', 'unanswered',
];

export class KbEntryDto {
  @IsIn(KB_CATEGORIES)
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
  @IsOptional() @IsIn(KB_CATEGORIES)
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
