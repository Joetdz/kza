import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { IkeleController } from './ikele.controller';

@Module({
  imports: [PrismaModule, CustomersModule],
  controllers: [IkeleController],
})
export class IkeleModule {}
