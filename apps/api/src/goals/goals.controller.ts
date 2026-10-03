import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { BudgetForecastService } from './budget-forecast.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateBudgetForecastDto, SetForecastProductsDto, CreateForecastExpenseDto } from './dto/budget-forecast.dto';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.guard';

@Controller('goals')
@Roles('owner', 'manager')
export class GoalsController {
  constructor(
    private readonly service: GoalsService,
    private readonly forecast: BudgetForecastService,
  ) {}

  @Get('budget-forecast')
  getForecast(@CurrentUser() user: AuthUser) {
    return this.forecast.getOrCreate(user.ownerId, user.businessId || undefined);
  }

  @Patch('budget-forecast')
  updateForecast(@Body() dto: UpdateBudgetForecastDto, @CurrentUser() user: AuthUser) {
    return this.forecast.update(dto, user.ownerId, user.businessId || undefined);
  }

  @Post('budget-forecast/products')
  setForecastProducts(@Body() dto: SetForecastProductsDto, @CurrentUser() user: AuthUser) {
    return this.forecast.setProducts(dto, user.ownerId, user.businessId || undefined);
  }

  @Post('budget-forecast/expenses')
  addForecastExpense(@Body() dto: CreateForecastExpenseDto, @CurrentUser() user: AuthUser) {
    return this.forecast.addExpense(dto, user.ownerId, user.businessId || undefined);
  }

  @Patch('budget-forecast/expenses/:id')
  updateForecastExpense(@Param('id') id: string, @Body() dto: Partial<CreateForecastExpenseDto>, @CurrentUser() user: AuthUser) {
    return this.forecast.updateExpense(id, dto, user.ownerId, user.businessId || undefined);
  }

  @Delete('budget-forecast/expenses/:id')
  removeForecastExpense(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.forecast.removeExpense(id, user.ownerId, user.businessId || undefined);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.service.findAll(user.ownerId, user.businessId || undefined);
  }

  @Post()
  create(@Body() dto: CreateGoalDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.ownerId, user.businessId || undefined);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateGoalDto>, @CurrentUser() user: AuthUser) {
    return this.service.update(id, dto, user.ownerId, user.businessId || undefined);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.ownerId, user.businessId || undefined);
  }
}
