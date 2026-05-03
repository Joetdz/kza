import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateAudienceContactDto {
  @IsOptional() @IsString() consentStatus?: string;
  @IsOptional() @IsString() contactStatus?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) segments?: string[];
}

export class UpdateUserProfileDto {
  @IsOptional() @IsString() businessSector?: string;
  @IsOptional() @IsString() companyName?: string;
}
