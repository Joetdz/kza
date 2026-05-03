import { Module } from '@nestjs/common';
import { BusinessAiController } from './business-ai.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessAiController],
})
export class BusinessAiModule {}
