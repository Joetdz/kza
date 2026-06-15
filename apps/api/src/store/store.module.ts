import { Module } from '@nestjs/common';
import { StoreController } from './store.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, WhatsAppModule],
  controllers: [StoreController],
})
export class StoreModule {}
