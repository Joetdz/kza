import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MigrationCheckService } from './migration-check.service';

@Global()
@Module({
  providers: [PrismaService, MigrationCheckService],
  exports: [PrismaService],
})
export class PrismaModule {}
