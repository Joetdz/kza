import { Module } from '@nestjs/common';
import { StoreController } from './store.controller';
import { VideoCompressorService } from './video-compressor.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PushModule } from '../push/push.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { CustomersModule } from '../customers/customers.module';
import { IkeleModule } from '../ikele/ikele.module';

@Module({
  imports: [PrismaModule, WhatsAppModule, PushModule, LogisticsModule, CustomersModule, IkeleModule],
  controllers: [StoreController],
  providers: [VideoCompressorService],
})
export class StoreModule {}
