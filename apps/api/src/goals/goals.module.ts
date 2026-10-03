import { Module } from '@nestjs/common';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { BudgetForecastService } from './budget-forecast.service';

@Module({
  controllers: [GoalsController],
  providers: [GoalsService, BudgetForecastService],
})
export class GoalsModule {}
