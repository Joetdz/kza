import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AccountInput, TreasuryService } from './treasury.service';

@Controller('treasury')
export class TreasuryController {
  constructor(private treasury: TreasuryService) {}

  @Get('accounts')
  accounts(@CurrentUser() user: AuthUser) {
    return this.treasury.accounts(user);
  }

  @Post('accounts')
  createAccount(@CurrentUser() user: AuthUser, @Body() body: AccountInput) {
    return this.treasury.createAccount(user, body);
  }

  @Patch('accounts/:id')
  updateAccount(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AccountInput) {
    return this.treasury.updateAccount(user, id, body);
  }

  @Delete('accounts/:id')
  removeAccount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.treasury.removeAccount(user, id);
  }

  @Get('movements')
  movements(
    @CurrentUser() user: AuthUser,
    @Query('accountId') accountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.treasury.movements(user, { accountId, from, to });
  }

  @Post('movements')
  addMovement(
    @CurrentUser() user: AuthUser,
    @Body() body: { accountId?: string; direction?: 'in' | 'out'; amount?: number; date?: string; label?: string },
  ) {
    return this.treasury.addMovement(user, body);
  }

  @Post('transfers')
  transfer(
    @CurrentUser() user: AuthUser,
    @Body() body: { fromId?: string; toId?: string; amount?: number; amountTo?: number; date?: string; label?: string },
  ) {
    return this.treasury.transfer(user, body);
  }

  @Delete('movements/:id')
  removeMovement(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.treasury.removeMovement(user, id);
  }
}
