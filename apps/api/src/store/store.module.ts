import { Module } from '@nestjs/common';
import { StoreController } from './store.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PrismaModule, WhatsAppModule, PushModule],
  controllers: [StoreController],
})
export class StoreModule {}
