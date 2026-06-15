import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { MovementsService } from './movements.service';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

@Controller('movements')
export class MovementsController {
  constructor(private readonly service: MovementsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.id, user.businessId || undefined);
  }

  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string, @CurrentUser() user: AuthUser) {
    return this.service.findByProduct(productId, user.id, user.businessId || undefined);
  }

  @Post()
  create(@Body() dto: CreateMovementDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id, user.businessId || undefined);
  }
}
