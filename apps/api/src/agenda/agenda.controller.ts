import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AgendaService } from './agenda.service';
import { AgendaSettingsDto, CreateAppointmentDto, UpdateAppointmentDto } from './dto/agenda.dto';

// Open to every role: taking and moving bookings is front-desk work, operators included.
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  private biz(user: AuthUser) {
    return user.businessId || null;
  }

  @Get('settings')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.agenda.getSettings(user.ownerId, this.biz(user));
  }

  @Put('settings')
  saveSettings(@Body() dto: AgendaSettingsDto, @CurrentUser() user: AuthUser) {
    return this.agenda.saveSettings(user.ownerId, this.biz(user), dto);
  }

  /** ?from=YYYY-MM-DD&to=YYYY-MM-DD, local dates, both included */
  @Get('appointments')
  list(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: AuthUser) {
    return this.agenda.list(user.ownerId, this.biz(user), from, to ?? from);
  }

  @Post('appointments')
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthUser) {
    return this.agenda.create(user.ownerId, this.biz(user), dto);
  }

  @Patch('appointments/:id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto, @CurrentUser() user: AuthUser) {
    return this.agenda.update(user.ownerId, this.biz(user), id, dto);
  }

  @Delete('appointments/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.agenda.remove(user.ownerId, this.biz(user), id);
  }

  /** ?date=YYYY-MM-DD[&productId=…][&resource=…] → free start times */
  @Get('availability')
  availability(
    @Query('date') date: string,
    @Query('productId') productId: string | undefined,
    @Query('resource') resource: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.agenda.availability(user.ownerId, this.biz(user), date, { productId, resource });
  }
}
