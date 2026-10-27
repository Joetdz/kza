import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.guard';
import { CreditService } from './credit.service';
import { AddPaymentDto, ScheduleDto } from './dto/credit.dto';

// Money owed by customers is finance — same access as sales.
@Controller('credit')
@Roles('owner', 'manager')
export class CreditController {
  constructor(private readonly credit: CreditService) {}

  private biz(user: AuthUser) {
    return user.businessId || null;
  }

  @Get('receivables')
  receivables(@CurrentUser() user: AuthUser) {
    return this.credit.receivables(user.ownerId, this.biz(user));
  }

  @Post('sales/:id/payments')
  addPayment(@Param('id') id: string, @Body() dto: AddPaymentDto, @CurrentUser() user: AuthUser) {
    return this.credit.addPayment(id, user.ownerId, this.biz(user), dto);
  }

  @Delete('payments/:id')
  removePayment(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.credit.removePayment(id, user.ownerId, this.biz(user));
  }

  @Put('sales/:id/schedule')
  setSchedule(@Param('id') id: string, @Body() dto: ScheduleDto, @CurrentUser() user: AuthUser) {
    return this.credit.setSchedule(id, user.ownerId, this.biz(user), dto);
  }

  @Post('sales/:id/remind')
  remind(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.credit.remindNow(id, user.ownerId, this.biz(user));
  }
}
