import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { BusinessService } from './business.service';
import { CreateBusinessDto, UpdateBusinessDto } from './dto/create-business.dto';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@Controller('businesses')
export class BusinessController {
  constructor(private readonly service: BusinessService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBusinessDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }

  @Post(':id/set-default')
  setDefault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.setDefault(user.id, id);
  }
}
