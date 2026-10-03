import { Module } from '@nestjs/common';
import { StoreController } from './store.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PushModule } from '../push/push.module';
import { LogisticsModule } from '../logistics/logistics.module';

@Module({
  imports: [PrismaModule, WhatsAppModule, PushModule, LogisticsModule],
  controllers: [StoreController],
})
export class StoreModule {}
