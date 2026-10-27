import {
  IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DOCUMENT_TYPES, INVOICE_STATUSES, QUOTE_STATUSES } from '@kza/shared';

export class DocumentLineDto {
  @IsOptional() @IsUUID()
  productId?: string | null;

  @IsString() @MinLength(1)
  description: string;

  @Type(() => Number) @IsNumber() @Min(0.001)
  quantity: number;

  @Type(() => Number) @IsNumber() @Min(0)
  unitPrice: number;
}

export class SaveDocumentDto {
  @IsIn(DOCUMENT_TYPES)
  type: 'quote' | 'invoice';

  @IsString() @MinLength(1)
  customerName: string;

  @IsOptional() @IsString()
  customerPhone?: string;

  @IsOptional() @IsString()
  customerAddress?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => DocumentLineDto)
  items: DocumentLineDto[];

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  discount?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  taxRate?: number;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsIn([...QUOTE_STATUSES, ...INVOICE_STATUSES])
  status?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issueDate: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string | null;
}

export class CreateSaleFromDocumentDto {
  @IsIn(['paid', 'pending', 'credit'])
  status: 'paid' | 'pending' | 'credit';
}

export class SendDocumentDto {
  @IsString()
  pdfBase64: string;

  @IsOptional() @IsString()
  phone?: string;
}
