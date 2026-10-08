import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvestorsService } from '../investors/investors.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';
import { CreateInvestmentDto, UpdateInvestmentDto } from './dto/investment.dto';

@Injectable()
export class FundraisingService {
  constructor(
    private prisma: PrismaService,
    private investors: InvestorsService,
  ) {}

  private async getOwnedCampaign(id: string, userId: string, businessId?: string) {
    const campaign = await this.prisma.fundraisingCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Cagnotte introuvable');
    if (businessId ? campaign.businessId !== businessId : campaign.userId !== userId) {
      throw new NotFoundException('Cagnotte introuvable');
    }
    return campaign;
  }

  listCampaigns(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    return this.prisma.fundraisingCampaign.findMany({
      where,
      include: { investments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaign(id: string, userId: string, businessId?: string) {
    const campaign = await this.getOwnedCampaign(id, userId, businessId);
    return this.prisma.fundraisingCampaign.findUnique({
      where: { id: campaign.id },
      include: { investments: { include: { investor: true }, orderBy: { investedAt: 'desc' } } },
    });
  }

  createCampaign(dto: CreateCampaignDto, userId: string, businessId?: string) {
    return this.prisma.fundraisingCampaign.create({
      data: {
        userId,
        businessId: businessId ?? null,
        name: dto.name,
        description: dto.description ?? '',
        targetAmount: dto.targetAmount,
        entryTicket: dto.entryTicket,
        maxInvestors: dto.maxInvestors ?? null,
        repaymentDueDate: dto.repaymentDueDate ?? null,
      },
      include: { investments: true },
    });
  }

  async updateCampaign(id: string, dto: UpdateCampaignDto, userId: string, businessId?: string) {
    const campaign = await this.getOwnedCampaign(id, userId, businessId);
    return this.prisma.fundraisingCampaign.update({
      where: { id: campaign.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.targetAmount !== undefined && { targetAmount: dto.targetAmount }),
        ...(dto.entryTicket !== undefined && { entryTicket: dto.entryTicket }),
        ...(dto.maxInvestors !== undefined && { maxInvestors: dto.maxInvestors }),
        ...(dto.repaymentDueDate !== undefined && { repaymentDueDate: dto.repaymentDueDate }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: { investments: true },
    });
  }

  async removeCampaign(id: string, userId: string, businessId?: string) {
    const campaign = await this.getOwnedCampaign(id, userId, businessId);
    const investmentCount = await this.prisma.fundraisingInvestment.count({ where: { campaignId: campaign.id } });
    if (investmentCount > 0) {
      throw new BadRequestException('Cette cagnotte a déjà des investisseurs — clôture-la plutôt que de la supprimer');
    }
    await this.prisma.fundraisingCampaign.delete({ where: { id: campaign.id } });
    return { id };
  }

  async listInvestments(campaignId: string, userId: string, businessId?: string) {
    const campaign = await this.getOwnedCampaign(campaignId, userId, businessId);
    return this.prisma.fundraisingInvestment.findMany({
      where: { campaignId: campaign.id },
      include: { investor: true },
      orderBy: { investedAt: 'desc' },
    });
  }

  async addInvestment(campaignId: string, dto: CreateInvestmentDto, userId: string, businessId?: string) {
    const campaign = await this.getOwnedCampaign(campaignId, userId, businessId);

    if (campaign.maxInvestors) {
      const distinctInvestors = await this.prisma.fundraisingInvestment.findMany({
        where: { campaignId: campaign.id },
        select: { investorId: true },
        distinct: ['investorId'],
      });
      const investor = await this.prisma.investor.findUnique({ where: { email: dto.investorEmail.toLowerCase().trim() } });
      const alreadyIn = investor ? distinctInvestors.some(d => d.investorId === investor.id) : false;
      if (!alreadyIn && distinctInvestors.length >= campaign.maxInvestors) {
        throw new BadRequestException(`Cette cagnotte a déjà atteint son nombre maximum d'investisseurs (${campaign.maxInvestors})`);
      }
    }

    const investor = await this.investors.findOrCreateInvestor(
      dto.investorEmail,
      dto.investorName,
      dto.investorPhone,
      dto.investorPassword ?? '',
    );

    return this.prisma.fundraisingInvestment.create({
      data: {
        campaignId: campaign.id,
        investorId: investor.id,
        amount: dto.amount,
        repaymentAmount: dto.repaymentAmount ?? dto.amount,
        repaymentDueDate: dto.repaymentDueDate ?? campaign.repaymentDueDate ?? null,
        investedAt: dto.investedAt ?? new Date().toISOString().slice(0, 10),
      },
      include: { investor: true },
    });
  }

  private async getOwnedInvestment(id: string, userId: string, businessId?: string) {
    const investment = await this.prisma.fundraisingInvestment.findUnique({ where: { id }, include: { campaign: true } });
    if (!investment) throw new NotFoundException('Investissement introuvable');
    const campaign = investment.campaign;
    if (businessId ? campaign.businessId !== businessId : campaign.userId !== userId) {
      throw new NotFoundException('Investissement introuvable');
    }
    return investment;
  }

  async updateInvestment(id: string, dto: UpdateInvestmentDto, userId: string, businessId?: string) {
    const investment = await this.getOwnedInvestment(id, userId, businessId);

    const repaymentAmount = dto.repaymentAmount ?? investment.repaymentAmount;
    const repaidAmount = dto.repaidAmount ?? investment.repaidAmount;
    // Statut dérivé automatiquement du remboursé vs promis, sauf si explicitement forcé.
    const status = dto.status ?? (
      repaidAmount <= 0 ? 'pending' : repaidAmount >= repaymentAmount ? 'repaid' : 'partially_repaid'
    );
    const repaidAt = dto.repaidAt ?? (
      status === 'repaid' && investment.status !== 'repaid' ? new Date().toISOString().slice(0, 10) : undefined
    );

    return this.prisma.fundraisingInvestment.update({
      where: { id: investment.id },
      data: {
        ...(dto.repaymentAmount !== undefined && { repaymentAmount: dto.repaymentAmount }),
        ...(dto.repaymentDueDate !== undefined && { repaymentDueDate: dto.repaymentDueDate }),
        ...(dto.repaidAmount !== undefined && { repaidAmount: dto.repaidAmount }),
        status,
        ...(repaidAt !== undefined && { repaidAt }),
      },
      include: { investor: true },
    });
  }

  async removeInvestment(id: string, userId: string, businessId?: string) {
    const investment = await this.getOwnedInvestment(id, userId, businessId);
    await this.prisma.fundraisingInvestment.delete({ where: { id: investment.id } });
    return { id };
  }
}
