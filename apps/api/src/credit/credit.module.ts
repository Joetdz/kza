import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [CreditController],
  providers: [CreditService],
})
export class CreditModule {}
