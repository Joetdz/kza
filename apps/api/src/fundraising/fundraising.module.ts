import { Module } from '@nestjs/common';
import { FundraisingController } from './fundraising.controller';
import { FundraisingService } from './fundraising.service';
import { InvestorsModule } from '../investors/investors.module';

@Module({
  imports: [InvestorsModule],
  controllers: [FundraisingController],
  providers: [FundraisingService],
})
export class FundraisingModule {}
