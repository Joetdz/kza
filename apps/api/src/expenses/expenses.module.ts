import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { RecurringExpenseService } from './recurring-expense.service';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, RecurringExpenseService],
})
export class ExpensesModule {}
