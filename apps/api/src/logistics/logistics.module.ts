import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LogisticsController } from './logistics.controller';
import { PartnerPortalController } from './partner-portal.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FollowUpService } from './followup.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, forwardRef(() => WhatsAppModule)],
  controllers: [LogisticsController, PartnerPortalController],
  providers: [FollowUpService],
})
export class LogisticsModule {}
