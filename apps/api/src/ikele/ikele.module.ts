import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { IkeleController } from './ikele.controller';
import { IkeleStatsService } from './ikele-stats.service';

@Module({
  imports: [PrismaModule, CustomersModule],
  controllers: [IkeleController],
  providers: [IkeleStatsService],
  exports: [IkeleStatsService],
})
export class IkeleModule {}
