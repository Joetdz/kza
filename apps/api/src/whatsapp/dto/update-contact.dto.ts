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

  // Pass null to reactivate the AI on this contact before its pause window elapses
  // on its own (a "reactivate AI" button in the Inbox).
  @IsOptional()
  aiPausedUntil?: string | null;
}
