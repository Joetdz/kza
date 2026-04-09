import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SendMessageDto {
  @IsString() @IsNotEmpty()
  message: string;

  @IsOptional() @IsString()
  quotedMsgId?: string;
}
