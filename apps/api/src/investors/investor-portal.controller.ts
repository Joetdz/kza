import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

// Structure identique à partner-portal.controller.ts : un seul contrôleur plat,
// @Public() sur chaque route, pas de garde ni de décorateur séparés. L'email et
// le mot de passe ne servent qu'à la connexion initiale ; une fois authentifié,
// le portail réutilise le jeton fixe de l'investisseur (Investor.token) dans
// l'URL de chaque appel suivant, exactement comme :token pour le partenaire.
@Controller('investor-portal')
export class InvestorPortalController {
  constructor(private prisma: PrismaService) {}

  // ── Auth ──────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const investor = await this.prisma.investor.findUnique({ where: { email: body.email.toLowerCase().trim() } });
    if (!investor) return { ok: false, error: 'invalid_credentials' };

    const valid = await bcrypt.compare(body.password, investor.passwordHash);
    if (!valid) return { ok: false, error: 'invalid_credentials' };

    return {
      ok: true,
      token: investor.token,
      investor: { id: investor.id, email: investor.email, name: investor.name, phone: investor.phone },
    };
  }

  // ── Data ──────────────────────────────────────────────────────────

  @Public()
  @Get(':token/me')
  async getMe(@Param('token') token: string) {
    const investor = await this.prisma.investor.findUnique({ where: { token } });
    if (!investor) return null;
    return { id: investor.id, email: investor.email, name: investor.name, phone: investor.phone };
  }

  @Public()
  @Get(':token/investments')
  async getInvestments(@Param('token') token: string) {
    const investor = await this.prisma.investor.findUnique({ where: { token } });
    if (!investor) return null;

    const investments = await this.prisma.fundraisingInvestment.findMany({
      where: { investorId: investor.id },
      include: { campaign: true },
      orderBy: { investedAt: 'desc' },
    });

    const businessIds = [...new Set(
      investments.map(i => i.campaign.businessId).filter((id): id is string => !!id),
    )];
    const businesses = businessIds.length
      ? await this.prisma.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, name: true } })
      : [];
    const businessNameById = new Map(businesses.map(b => [b.id, b.name]));

    return investments.map(inv => ({
      id: inv.id,
      amount: inv.amount,
      repaymentAmount: inv.repaymentAmount,
      repaymentDueDate: inv.repaymentDueDate,
      repaidAmount: inv.repaidAmount,
      repaidAt: inv.repaidAt,
      status: inv.status,
      investedAt: inv.investedAt,
      campaign: {
        id: inv.campaign.id,
        name: inv.campaign.name,
        description: inv.campaign.description,
        status: inv.campaign.status,
        businessName: inv.campaign.businessId ? businessNameById.get(inv.campaign.businessId) ?? null : null,
      },
    }));
  }

  @Public()
  @Patch(':token/password')
  async changePassword(@Param('token') token: string, @Body() body: { currentPassword: string; newPassword: string }) {
    const investor = await this.prisma.investor.findUnique({ where: { token } });
    if (!investor) return { ok: false, error: 'invalid_token' };

    const valid = await bcrypt.compare(body.currentPassword, investor.passwordHash);
    if (!valid) return { ok: false, error: 'wrong_password' };

    if (!body.newPassword || body.newPassword.length < 6) {
      return { ok: false, error: 'password_too_short' };
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await this.prisma.investor.update({ where: { id: investor.id }, data: { passwordHash } });
    return { ok: true };
  }
}
