import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { IkeleModule } from '../ikele/ikele.module';

@Module({
  imports: [PrismaModule, IkeleModule],
  controllers: [AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
