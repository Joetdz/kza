import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private prisma: PrismaService) {}

  // ── Global stats ──────────────────────────────────────────────────────────────

  @Get('stats')
  async getStats() {
    const [
      totalSessions,
      waConnected,
      totalAudience,
      totalCrmContacts,
      totalProducts,
      totalSales,
      totalExpenses,
      leadsRaw,
      recentSyncs,
    ] = await Promise.all([
      // Distinct clients who ever connected a WA account
      this.prisma.whatsAppSession.count(),
      // Currently connected
      this.prisma.whatsAppSession.count({ where: { connected: true } }),
      // Total audience contacts across all clients
      this.prisma.waCampaignContact.count(),
      // Total CRM contacts
      this.prisma.whatsAppContact.count(),
      // Total products across all clients
      this.prisma.product.count(),
      // Total sales
      this.prisma.sale.count(),
      // Total expense records
      this.prisma.expense.count(),
      // Lead status breakdown
      this.prisma.whatsAppContact.groupBy({
        by: ['leadStatus'],
        _count: { id: true },
      }),
      // Last 7 synced contacts (most recent audience syncs)
      this.prisma.waCampaignContact.findMany({
        orderBy: { syncedAt: 'desc' },
        take: 5,
        select: { clientId: true, syncedAt: true, waAccountId: true },
      }),
    ]);

    // Lead funnel
    const leadsBreakdown: Record<string, number> = {
      cold: 0, warm: 0, hot: 0, converted: 0, lost: 0,
    };
    for (const row of leadsRaw) {
      leadsBreakdown[row.leadStatus] = row._count.id;
    }
    const totalLeads = Object.values(leadsBreakdown).reduce((a, b) => a + b, 0);

    return {
      totalClients: totalSessions,
      waConnected,
      totalAudience,
      totalCrmContacts,
      totalLeads,
      totalProducts,
      totalSales,
      totalExpenses,
      leadsBreakdown,
      recentSyncs,
    };
  }

  // ── Per-client table ──────────────────────────────────────────────────────────

  @Get('clients')
  async getClients() {
    const [sessions, profiles, audienceCounts, crmCounts] = await Promise.all([
      this.prisma.whatsAppSession.findMany({
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.userProfile.findMany(),
      // Audience size per client
      this.prisma.waCampaignContact.groupBy({
        by: ['clientId'],
        _count: { id: true },
      }),
      // CRM contacts per client
      this.prisma.whatsAppContact.groupBy({
        by: ['userId'],
        _count: { id: true },
      }),
    ]);

    const profileMap = new Map(profiles.map(p => [p.userId, p]));
    const audienceMap = new Map(audienceCounts.map(a => [a.clientId, a._count.id]));
    const crmMap = new Map(crmCounts.map(c => [c.userId, c._count.id]));

    return sessions.map(s => ({
      userId: s.userId,
      companyName: profileMap.get(s.userId)?.companyName ?? null,
      businessSector: profileMap.get(s.userId)?.businessSector ?? null,
      waConnected: s.connected,
      waPhone: s.phone,
      audienceCount: audienceMap.get(s.userId) ?? 0,
      crmContactCount: crmMap.get(s.userId) ?? 0,
      lastSeenAt: s.updatedAt,
    }));
  }

  // ── Audience growth (last 30 days, grouped by date) ───────────────────────────

  @Get('audience-growth')
  async getAudienceGrowth() {
    // Raw query: count new campaign contacts per day over last 30 days
    const rows = await this.prisma.$queryRaw<{ day: string; count: bigint }[]>`
      SELECT
        DATE_TRUNC('day', created_at)::date AS day,
        COUNT(*) AS count
      FROM wa_campaign_contacts
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY day
      ORDER BY day ASC
    `;
    return rows.map(r => ({ day: r.day, count: Number(r.count) }));
  }

  // ── Lead conversion funnel (all clients combined) ─────────────────────────────

  @Get('lead-funnel')
  async getLeadFunnel() {
    const rows = await this.prisma.whatsAppContact.groupBy({
      by: ['leadStatus'],
      _count: { id: true },
      orderBy: { leadStatus: 'asc' },
    });
    const order = ['cold', 'warm', 'hot', 'converted', 'lost'];
    return order.map(status => ({
      status,
      count: rows.find(r => r.leadStatus === status)?._count.id ?? 0,
    }));
  }

  // ── Full contact directory (all clients) ──────────────────────────────────────

  @Get('contacts')
  async getContacts(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('clientId') clientId?: string,
    @Query('consentStatus') consentStatus?: string,
    @Query('contactStatus') contactStatus?: string,
    @Query('source') source?: string,
  ) {
    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (consentStatus) where.consentStatus = consentStatus;
    if (contactStatus) where.contactStatus = contactStatus;
    if (source) where.source = source;
    if (search) {
      where.OR = [
        { phoneNumber: { contains: search } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { businessSector: { contains: search, mode: 'insensitive' } },
        { waAccountId: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.waCampaignContact.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.waCampaignContact.count({ where }),
    ]);

    // Enrich with company name from UserProfile
    const clientIds = [...new Set(data.map(c => c.clientId))];
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: clientIds } },
      select: { userId: true, companyName: true, businessSector: true },
    });
    const profileMap = new Map(profiles.map(p => [p.userId, p]));

    return {
      data: data.map(c => ({
        ...c,
        clientCompany: profileMap.get(c.clientId)?.companyName ?? null,
        clientSector: profileMap.get(c.clientId)?.businessSector ?? null,
      })),
      total,
      page: Number(page),
      limit: Number(limit),
    };
  }

  // ── CRM leads directory (all clients) ────────────────────────────────────────

  @Get('leads')
  async getLeads(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('clientId') clientId?: string,
    @Query('leadStatus') leadStatus?: string,
  ) {
    const where: any = {};
    if (clientId) where.userId = clientId;
    if (leadStatus) where.leadStatus = leadStatus;
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { leadName: { contains: search, mode: 'insensitive' } },
        { leadProduct: { contains: search, mode: 'insensitive' } },
        { leadCity: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.whatsAppContact.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { lastMessageAt: 'desc' },
        include: { tags: { include: { tag: true } } },
      }),
      this.prisma.whatsAppContact.count({ where }),
    ]);

    const clientIds = [...new Set(data.map(c => c.userId))];
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: clientIds } },
      select: { userId: true, companyName: true },
    });
    const profileMap = new Map(profiles.map(p => [p.userId, p]));

    return {
      data: data.map(c => ({
        ...c,
        clientCompany: profileMap.get(c.userId)?.companyName ?? null,
      })),
      total,
      page: Number(page),
      limit: Number(limit),
    };
  }
}
