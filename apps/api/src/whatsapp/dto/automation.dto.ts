import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class AutomationDto {
  @IsString()
  name: string;

  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsIn(['welcome', 'keyword', 'no_reply', 'out_of_hours', 'lead_status', 'tag_added'])
  trigger: string;

  @IsObject()
  triggerConfig: Record<string, any>;

  @IsIn(['send_message', 'assign_agent', 'change_status', 'add_tag', 'disable_ai'])
  action: string;

  @IsObject()
  actionConfig: Record<string, any>;
}

export class UpdateAutomationDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsIn(['welcome', 'keyword', 'no_reply', 'out_of_hours', 'lead_status', 'tag_added'])
  trigger?: string;

  @IsOptional() @IsObject()
  triggerConfig?: Record<string, any>;

  @IsOptional() @IsIn(['send_message', 'assign_agent', 'change_status', 'add_tag', 'disable_ai'])
  action?: string;

  @IsOptional() @IsObject()
  actionConfig?: Record<string, any>;
}
