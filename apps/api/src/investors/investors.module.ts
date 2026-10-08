import { Module } from '@nestjs/common';
import { InvestorPortalController } from './investor-portal.controller';
import { InvestorsService } from './investors.service';

@Module({
  controllers: [InvestorPortalController],
  providers: [InvestorsService],
  exports: [InvestorsService],
})
export class InvestorsModule {}
