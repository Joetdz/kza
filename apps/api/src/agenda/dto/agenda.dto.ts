import {
  IsArray, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateNested, IsIn, IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OpeningRangeDto {
  @IsInt() @Min(0) @Max(6)
  day: number;

  @Matches(/^\d{2}:\d{2}$/)
  from: string;

  @Matches(/^\d{2}:\d{2}$/)
  to: string;
}

export class AgendaSettingsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => OpeningRangeDto)
  openingHours: OpeningRangeDto[];

  @Type(() => Number) @IsInt() @Min(5) @Max(240)
  slotMinutes: number;

  @Type(() => Number) @IsInt() @Min(5) @Max(1440)
  defaultDurationMinutes: number;

  @IsArray() @IsString({ each: true })
  resources: string[];

  @Type(() => Number) @IsInt() @Min(1) @Max(100)
  capacity: number;

  @Type(() => Number) @IsInt() @Min(0) @Max(168)
  reminderHours: number;
}

export class CreateAppointmentDto {
  @IsString()
  customerName: string;

  @IsOptional() @IsString()
  customerPhone?: string;

  @IsOptional() @IsUUID()
  productId?: string;

  @IsOptional() @IsString()
  resource?: string;

  /** Local date of the business, "YYYY-MM-DD" */
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  /** Local time of the business, "HH:MM" */
  @Matches(/^\d{2}:\d{2}$/)
  time: string;

  /** Defaults to the service's duration, then the agenda's default. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440)
  durationMinutes?: number;

  @IsOptional() @IsString()
  notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsIn(['confirmed', 'done', 'no_show', 'cancelled'])
  status?: string;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsString()
  customerName?: string;

  @IsOptional() @IsString()
  customerPhone?: string;

  @IsOptional() @IsString()
  resource?: string;

  /** Reschedule: both date and time, local to the business. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional() @Matches(/^\d{2}:\d{2}$/)
  time?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440)
  durationMinutes?: number;
}
