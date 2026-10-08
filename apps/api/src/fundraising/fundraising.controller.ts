import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { FundraisingService } from './fundraising.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
import { CreateInvestmentDto, UpdateInvestmentDto } from './dto/investment.dto';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.guard';

@Controller('fundraising')
@Roles('owner', 'manager')
export class FundraisingController {
  constructor(private readonly service: FundraisingService) {}

  @Get('campaigns')
  listCampaigns(@CurrentUser() user: AuthUser) {
    return this.service.listCampaigns(user.ownerId, user.businessId || undefined);
  }

  @Post('campaigns')
  createCampaign(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.service.createCampaign(dto, user.ownerId, user.businessId || undefined);
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.getCampaign(id, user.ownerId, user.businessId || undefined);
  }

  @Patch('campaigns/:id')
  updateCampaign(@Param('id') id: string, @Body() dto: UpdateCampaignDto, @CurrentUser() user: AuthUser) {
    return this.service.updateCampaign(id, dto, user.ownerId, user.businessId || undefined);
  }

  @Delete('campaigns/:id')
  removeCampaign(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeCampaign(id, user.ownerId, user.businessId || undefined);
  }

  @Get('campaigns/:id/investments')
  listInvestments(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.listInvestments(id, user.ownerId, user.businessId || undefined);
  }

  @Post('campaigns/:id/investments')
  addInvestment(@Param('id') id: string, @Body() dto: CreateInvestmentDto, @CurrentUser() user: AuthUser) {
    return this.service.addInvestment(id, dto, user.ownerId, user.businessId || undefined);
  }

  @Patch('investments/:id')
  updateInvestment(@Param('id') id: string, @Body() dto: UpdateInvestmentDto, @CurrentUser() user: AuthUser) {
    return this.service.updateInvestment(id, dto, user.ownerId, user.businessId || undefined);
  }

  @Delete('investments/:id')
  removeInvestment(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.removeInvestment(id, user.ownerId, user.businessId || undefined);
  }
}
