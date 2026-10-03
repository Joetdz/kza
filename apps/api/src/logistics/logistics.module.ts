import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { LogisticsController } from './logistics.controller';
import { PartnerPortalController } from './partner-portal.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FollowUpService } from './followup.service';
import { CustomerHistoryService } from '../common/customer-history.service';
import { LogisticsService } from './logistics.service';

@Module({
  imports: [ScheduleModule.forRoot(), forwardRef(() => WhatsAppModule)],
  controllers: [LogisticsController, PartnerPortalController],
  providers: [FollowUpService, CustomerHistoryService, LogisticsService],
  exports: [CustomerHistoryService, LogisticsService],
})
export class LogisticsModule {}
