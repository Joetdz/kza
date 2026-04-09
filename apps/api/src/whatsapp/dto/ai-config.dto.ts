import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';

export class AiConfigDto {
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsString()
  systemPrompt?: string;

  @IsOptional() @IsString()
  businessObjective?: string;

  @IsOptional() @IsString()
  brandPersonality?: string;

  @IsOptional() @IsString()
  primaryLanguage?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  blacklistTopics?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  escalationKeywords?: string[];

  @IsOptional() @IsString()
  escalationMessage?: string;

  @IsOptional()
  activeHours?: any;

  @IsOptional() @IsString()
  outsideHoursMessage?: string;

  @IsOptional() @IsInt() @Min(0)
  simulatedDelayMs?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  confidenceThreshold?: number;
}
