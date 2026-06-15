import { Controller, Get, Post, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.prisma.userProfile.findUnique({ where: { userId: user.id } });
  }

  @Post('profile')
  upsertProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: { companyName?: string; businessSector?: string; country?: string },
  ) {
    return this.prisma.userProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...dto },
      update: { ...dto },
    });
  }
}
