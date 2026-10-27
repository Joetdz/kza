import { Module, forwardRef } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppGateway } from './whatsapp.gateway';
import { AiService } from './ai.service';
import { AutomationService } from './automation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { CustomerHistoryService } from '../common/customer-history.service';
import { AgendaModule } from '../agenda/agenda.module';

@Module({
  imports: [PrismaModule, PushModule, forwardRef(() => AgendaModule)],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppGateway, AiService, AutomationService, CustomerHistoryService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
