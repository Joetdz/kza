import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [PrismaModule, WhatsAppModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
