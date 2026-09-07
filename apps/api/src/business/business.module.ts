import { Module } from '@nestjs/common';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { TeamController, InviteController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  controllers: [BusinessController, TeamController, InviteController],
  providers: [BusinessService, TeamService],
  exports: [BusinessService, TeamService],
})
export class BusinessModule {}
