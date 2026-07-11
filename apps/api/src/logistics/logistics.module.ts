import { Module, forwardRef } from '@nestjs/common';
import { LogisticsController } from './logistics.controller';
import { PartnerPortalController } from './partner-portal.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [forwardRef(() => WhatsAppModule)],
  controllers: [LogisticsController, PartnerPortalController],
})
export class LogisticsModule {}
