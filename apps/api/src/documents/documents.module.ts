import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [SalesModule, WhatsAppModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
