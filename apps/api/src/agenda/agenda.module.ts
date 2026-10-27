import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

@Module({
  imports: [PrismaModule, forwardRef(() => WhatsAppModule)],
  controllers: [AgendaController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
