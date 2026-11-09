import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { AddressInput, CustomersService, OtpPurpose } from './customers.service';

// Customer accounts of the online stores. Public for the merchants' guard (Supabase):
// the customer's own session token, sent as "Authorization: Bearer", is checked here.
@Controller('customers')
export class CustomersController {
  constructor(private customers: CustomersService) {}

  // ── Sign-up, login, forgotten password ─────────────────────────────────────

  @Public()
  @Post('otp')
  requestOtp(@Body() body: { phone?: string; purpose?: OtpPurpose; storeSlug?: string }) {
    return this.customers.requestOtp(body.phone, body.purpose ?? 'signup', body.storeSlug);
  }

  @Public()
  @Post('signup')
  signup(@Body() body: { phone?: string; code?: string; name?: string; password?: string; deviceVisitorId?: string }) {
    return this.customers.signup(body);
  }

  @Public()
  @Post('login')
  login(@Body() body: { phone?: string; password?: string; deviceVisitorId?: string }) {
    return this.customers.login(body);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() body: { phone?: string; code?: string; password?: string; deviceVisitorId?: string }) {
    return this.customers.resetPassword(body);
  }

  @Public()
  @Post('logout')
  logout(@Headers('authorization') auth?: string) {
    return this.customers.logout(auth);
  }

  @Public()
  @Get('categories')
  categories() {
    return this.customers.categories();
  }

  // ── Signed-in customer ─────────────────────────────────────────────────────

  @Public()
  @Get('me')
  async me(@Headers('authorization') auth?: string) {
    return this.customers.publicCustomer(await this.customers.requireCustomer(auth));
  }

  @Public()
  @Patch('me')
  async updateMe(@Headers('authorization') auth: string | undefined, @Body() body: { name?: string; preferredCategories?: string[] }) {
    return this.customers.updateProfile(await this.customers.requireCustomer(auth), body);
  }

  @Public()
  @Post('me/password')
  async changePassword(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    return this.customers.changePassword(await this.customers.requireCustomer(auth), body.currentPassword, body.newPassword);
  }

  @Public()
  @Get('me/orders')
  async orders(@Headers('authorization') auth?: string) {
    return this.customers.orders(await this.customers.requireCustomer(auth));
  }

  @Public()
  @Get('me/following')
  async following(@Headers('authorization') auth?: string) {
    return this.customers.following(await this.customers.requireCustomer(auth));
  }

  @Public()
  @Get('me/addresses')
  async addresses(@Headers('authorization') auth?: string) {
    return this.customers.addresses(await this.customers.requireCustomer(auth));
  }

  @Public()
  @Post('me/addresses')
  async addAddress(@Headers('authorization') auth: string | undefined, @Body() body: AddressInput) {
    return this.customers.addAddress(await this.customers.requireCustomer(auth), body);
  }

  @Public()
  @Patch('me/addresses/:id')
  async updateAddress(@Headers('authorization') auth: string | undefined, @Param('id') id: string, @Body() body: AddressInput) {
    return this.customers.updateAddress(await this.customers.requireCustomer(auth), id, body);
  }

  @Public()
  @Delete('me/addresses/:id')
  async removeAddress(@Headers('authorization') auth: string | undefined, @Param('id') id: string) {
    return this.customers.removeAddress(await this.customers.requireCustomer(auth), id);
  }
}
