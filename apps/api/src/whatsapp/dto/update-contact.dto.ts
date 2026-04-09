import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateContactDto {
  @IsOptional() @IsString()
  assignedAgent?: string;

  @IsOptional() @IsIn(['cold', 'warm', 'hot', 'converted', 'lost'])
  leadStatus?: string;

  @IsOptional() @IsBoolean()
  aiEnabled?: boolean;

  @IsOptional() @IsBoolean()
  isArchived?: boolean;

  @IsOptional() @IsBoolean()
  isRead?: boolean;

  @IsOptional() @IsString()
  displayName?: string;
}
