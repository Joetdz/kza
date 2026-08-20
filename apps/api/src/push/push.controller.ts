import { Controller, Post, Delete, Body, HttpCode } from '@nestjs/common';
import { PushService } from './push.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { IsString, IsObject } from 'class-validator';
import { Public } from '../auth/public.decorator';

class SubscribeDto {
  @IsString() endpoint: string;
  @IsObject() keys: { p256dh: string; auth: string };
}

class UnsubscribeDto {
  @IsString() endpoint: string;
}

@Controller('push')
export class PushController {
  constructor(private push: PushService) {}

  @Post('subscribe')
  subscribe(@Body() dto: SubscribeDto, @CurrentUser() user: AuthUser) {
    return this.push.subscribe(user.id, dto);
  }

  @Delete('subscribe')
  @HttpCode(204)
  unsubscribe(@Body() dto: UnsubscribeDto) {
    return this.push.unsubscribe(dto.endpoint);
  }

  // Dev-only: test a push to yourself
  @Post('test')
  test(@CurrentUser() user: AuthUser) {
    return this.push.sendToUser(user.id, {
      title: '🔔 Test KZA',
      body: 'Les notifications push fonctionnent parfaitement !',
      url: '/',
    });
  }
}
