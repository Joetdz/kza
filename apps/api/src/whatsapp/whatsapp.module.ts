import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppGateway } from './whatsapp.gateway';
import { AiService } from './ai.service';
import { AutomationService } from './automation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PrismaModule, PushModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppGateway, AiService, AutomationService],
  exports: [WhatsAppService, AiService],
})
export class WhatsAppModule {}
