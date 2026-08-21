import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LogisticsController } from './logistics.controller';
import { PartnerPortalController } from './partner-portal.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FollowUpService } from './followup.service';

@Module({
  imports: [ScheduleModule.forRoot(), forwardRef(() => WhatsAppModule)],
  controllers: [LogisticsController, PartnerPortalController],
  providers: [FollowUpService],
})
export class LogisticsModule {}
