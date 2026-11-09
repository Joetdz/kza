import { Module } from '@nestjs/common';
import { StoreController } from './store.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PushModule } from '../push/push.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [PrismaModule, WhatsAppModule, PushModule, LogisticsModule, CustomersModule],
  controllers: [StoreController],
})
export class StoreModule {}
