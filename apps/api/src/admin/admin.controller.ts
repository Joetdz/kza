import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private prisma: PrismaService) {}

  // ── Business overview (CA, ventes, dépenses, utilisateurs, produits) ─────────

  @Get('overview')
  async getOverview() {
    const [
      totalBusinesses,
      totalUsersRaw,
      waConnected,
      salesByStatus,
      totalSalesCount,
      revenueRaw,
      expensesAgg,
      totalProducts,
      revenueByDayRaw,
      topBizRaw,
      businesses,
    ] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*)::text AS count FROM auth.users`,
      this.prisma.whatsAppSession.count({ where: { connected: true } }),
      this.prisma.sale.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.sale.count(),
      this.prisma.$queryRaw<[{ total: string }]>`
        SELECT COALESCE(SUM(si.quantity * si.unit_price), 0)::text AS total
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.status = 'paid'
      `,
      this.prisma.expense.aggregate({ _sum: { amount: true } }),
      this.prisma.product.count(),
      this.prisma.$queryRaw<{ day: string; revenue: string; sales_count: string }[]>`
        SELECT
          s.date::text AS day,
          COALESCE(SUM(si.quantity * si.unit_price), 0)::text AS revenue,
          COUNT(DISTINCT s.id)::text AS sales_count
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.status = 'paid'
          AND s.date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY s.date
        ORDER BY s.date ASC
      `,
      this.prisma.$queryRaw<{ business_id: string; revenue: string; sale_count: string; expense_total: string; product_count: string }[]>`
        SELECT
          b.id::text AS business_id,
          COALESCE(rev.revenue, 0)::text AS revenue,
          COALESCE(rev.sale_count, 0)::text AS sale_count,
          COALESCE(exp.expense_total, 0)::text AS expense_total,
          COALESCE(prod.product_count, 0)::text AS product_count
        FROM businesses b
        LEFT JOIN (
          SELECT s.business_id,
            SUM(si.quantity * si.unit_price) AS revenue,
            COUNT(DISTINCT s.id) AS sale_count
          FROM sales s
          JOIN sale_items si ON si.sale_id = s.id
          WHERE s.status = 'paid'
          GROUP BY s.business_id
        ) rev ON rev.business_id = b.id
        LEFT JOIN (
          SELECT business_id, SUM(amount) AS expense_total
          FROM expenses
          GROUP BY business_id
        ) exp ON exp.business_id = b.id
        LEFT JOIN (
          SELECT business_id, COUNT(*) AS product_count
          FROM products
          GROUP BY business_id
        ) prod ON prod.business_id = b.id
        ORDER BY revenue::numeric DESC
        LIMIT 10
      `,
      this.prisma.business.findMany({
        select: { id: true, name: true, currency: true, logoUrl: true, userId: true },
      }),
    ]);

    const salesBreakdown: Record<string, number> = { paid: 0, pending: 0, cancelled: 0 };
    for (const row of salesByStatus) {
      salesBreakdown[row.status] = row._count.id;
    }

    const totalRevenue = parseFloat(revenueRaw[0]?.total ?? '0');
    const totalExpenses = expensesAgg._sum.amount ?? 0;
    const bizMap = new Map(businesses.map(b => [b.id, b]));

    return {
      totalUsers: Number((totalUsersRaw as any)[0]?.count ?? 0),
      totalBusinesses,
      waConnected,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      totalSalesCount,
      salesBreakdown,
      totalProducts,
      revenueByDay: revenueByDayRaw.map(r => ({
        day: r.day,
        revenue: parseFloat(r.revenue),
        salesCount: parseInt(r.sales_count, 10),
      })),
      topBusinesses: topBizRaw.map(r => {
        const biz = bizMap.get(r.business_id);
        const revenue = parseFloat(r.revenue);
        const expenseTotal = parseFloat(r.expense_total);
        return {
          id: r.business_id,
          name: biz?.name ?? '—',
          currency: biz?.currency ?? 'USD',
          logoUrl: biz?.logoUrl ?? null,
          revenue,
          saleCount: parseInt(r.sale_count, 10),
          expenseTotal,
          productCount: parseInt(r.product_count, 10),
          profit: revenue - expenseTotal,
        };
      }),
    };
  }

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

  // ── Detail: Revenue (CA) ─────────────────────────────────────────────────────

  @Get('detail/revenue')
  async getRevenueDetail() {
    const [byChannel, topSales, byBusiness] = await Promise.all([
      this.prisma.$queryRaw<{ channel: string; revenue: string; count: string }[]>`
        SELECT s.channel,
          COALESCE(SUM(si.quantity * si.unit_price), 0)::text AS revenue,
          COUNT(DISTINCT s.id)::text AS count
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.status = 'paid'
        GROUP BY s.channel
        ORDER BY revenue::numeric DESC
      `,
      this.prisma.$queryRaw<{ id: string; date: string; channel: string; customer: string | null; total: string; business_name: string | null }[]>`
        SELECT s.id::text, s.date::text, s.channel,
          s.customer_name AS customer,
          SUM(si.quantity * si.unit_price)::text AS total,
          b.name AS business_name
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        LEFT JOIN businesses b ON b.id = s.business_id
        WHERE s.status = 'paid'
        GROUP BY s.id, s.date, s.channel, s.customer_name, b.name
        ORDER BY total::numeric DESC
        LIMIT 20
      `,
      this.prisma.$queryRaw<{ name: string; currency: string; revenue: string; sale_count: string }[]>`
        SELECT b.name, b.currency,
          COALESCE(SUM(si.quantity * si.unit_price), 0)::text AS revenue,
          COUNT(DISTINCT s.id)::text AS sale_count
        FROM businesses b
        LEFT JOIN sales s ON s.business_id = b.id AND s.status = 'paid'
        LEFT JOIN sale_items si ON si.sale_id = s.id
        GROUP BY b.id, b.name, b.currency
        ORDER BY revenue::numeric DESC
      `,
    ]);

    return {
      byChannel: byChannel.map(r => ({ channel: r.channel, revenue: parseFloat(r.revenue), count: parseInt(r.count, 10) })),
      topSales: topSales.map(r => ({ id: r.id, date: r.date, channel: r.channel, customer: r.customer, total: parseFloat(r.total), businessName: r.business_name })),
      byBusiness: byBusiness.map(r => ({ name: r.name, currency: r.currency, revenue: parseFloat(r.revenue), saleCount: parseInt(r.sale_count, 10) })),
    };
  }

  // ── Detail: Sales ─────────────────────────────────────────────────────────────

  @Get('detail/sales')
  async getSalesDetail() {
    const [byChannel, recentSales] = await Promise.all([
      this.prisma.$queryRaw<{ channel: string; status: string; count: string }[]>`
        SELECT channel, status, COUNT(*)::text AS count
        FROM sales
        GROUP BY channel, status
        ORDER BY count::integer DESC
      `,
      this.prisma.$queryRaw<{ id: string; date: string; channel: string; status: string; customer: string | null; total: string; business_name: string | null }[]>`
        SELECT s.id::text, s.date::text, s.channel, s.status,
          s.customer_name AS customer,
          COALESCE(SUM(si.quantity * si.unit_price), 0)::text AS total,
          b.name AS business_name
        FROM sales s
        LEFT JOIN sale_items si ON si.sale_id = s.id
        LEFT JOIN businesses b ON b.id = s.business_id
        GROUP BY s.id, s.date, s.channel, s.status, s.customer_name, s.created_at, b.name
        ORDER BY s.created_at DESC
        LIMIT 30
      `,
    ]);

    return {
      byChannel: byChannel.map(r => ({ channel: r.channel, status: r.status, count: parseInt(r.count, 10) })),
      recentSales: recentSales.map(r => ({ id: r.id, date: r.date, channel: r.channel, status: r.status, customer: r.customer, total: parseFloat(r.total), businessName: r.business_name })),
    };
  }

  // ── Detail: Expenses ──────────────────────────────────────────────────────────

  @Get('detail/expenses')
  async getExpensesDetail() {
    const [byCategory, byBusiness, recent] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['category'],
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
      this.prisma.$queryRaw<{ name: string; total: string; count: string }[]>`
        SELECT b.name,
          COALESCE(SUM(e.amount), 0)::text AS total,
          COUNT(e.id)::text AS count
        FROM businesses b
        LEFT JOIN expenses e ON e.business_id = b.id
        GROUP BY b.id, b.name
        HAVING COALESCE(SUM(e.amount), 0) > 0
        ORDER BY total::numeric DESC
      `,
      this.prisma.$queryRaw<{ id: string; category: string; amount: string; description: string; date: string; business_name: string | null }[]>`
        SELECT e.id::text, e.category, e.amount::text, e.description, e.date::text,
          b.name AS business_name
        FROM expenses e
        LEFT JOIN businesses b ON b.id = e.business_id
        ORDER BY e.created_at DESC
        LIMIT 25
      `,
    ]);

    return {
      byCategory: byCategory.map(r => ({ category: r.category, total: r._sum.amount ?? 0, count: r._count.id })),
      byBusiness: byBusiness.map(r => ({ name: r.name, total: parseFloat(r.total), count: parseInt(r.count, 10) })),
      recent: recent.map(r => ({ id: r.id, category: r.category, amount: parseFloat(r.amount), description: r.description, date: r.date, businessName: r.business_name })),
    };
  }

  // ── Detail: Products ──────────────────────────────────────────────────────────

  @Get('detail/products')
  async getProductsDetail() {
    const [topByRevenue, lowStockCount, activeCount] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; name: string; revenue: string; qty_sold: string; business_name: string | null; stock: string }[]>`
        SELECT p.id::text, p.name,
          COALESCE(SUM(si.quantity * si.unit_price), 0)::text AS revenue,
          COALESCE(SUM(si.quantity), 0)::text AS qty_sold,
          b.name AS business_name,
          p.quantity::text AS stock
        FROM products p
        LEFT JOIN sale_items si ON si.product_id = p.id
        LEFT JOIN sales s ON s.id = si.sale_id AND s.status = 'paid'
        LEFT JOIN businesses b ON b.id = p.business_id
        GROUP BY p.id, p.name, b.name, p.quantity
        ORDER BY revenue::numeric DESC
        LIMIT 25
      `,
      this.prisma.product.count({ where: { quantity: { lte: 0 } } }),
      this.prisma.product.count({ where: { quantity: { gt: 0 } } }),
    ]);

    return {
      topByRevenue: topByRevenue.map(r => ({
        id: r.id, name: r.name, revenue: parseFloat(r.revenue),
        qtySold: parseFloat(r.qty_sold), businessName: r.business_name, stock: parseFloat(r.stock),
      })),
      lowStockCount,
      activeCount,
    };
  }

  // ── Detail: Users ─────────────────────────────────────────────────────────────

  @Get('detail/users')
  async getUsersDetail() {
    const [authUsers, businesses, waSessions] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; email: string; created_at: string }[]>`
        SELECT id::text, email, created_at::text FROM auth.users ORDER BY created_at DESC LIMIT 200
      `,
      this.prisma.business.findMany({ select: { userId: true, name: true, currency: true } }),
      this.prisma.whatsAppSession.findMany({ select: { userId: true, connected: true } }),
    ]);

    const bizByUser = new Map<string, typeof businesses>();
    for (const b of businesses) {
      if (!bizByUser.has(b.userId)) bizByUser.set(b.userId, []);
      bizByUser.get(b.userId)!.push(b);
    }
    const waByUser = new Map(waSessions.map(s => [s.userId, s.connected]));

    return (authUsers as any[]).map((u: any) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      businessCount: bizByUser.get(u.id)?.length ?? 0,
      businesses: (bizByUser.get(u.id) ?? []).map(b => b.name),
      waConnected: waByUser.get(u.id) ?? false,
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

  // ── Businesses table ─────────────────────────────────────────────────────────

  @Get('businesses')
  async getBusinesses() {
    const [businesses, waSessions, productCounts, saleCounts, authUsers] = await Promise.all([
      this.prisma.business.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.whatsAppSession.findMany({ select: { userId: true, connected: true, phone: true } }),
      this.prisma.product.groupBy({ by: ['businessId'], _count: { id: true } }),
      this.prisma.sale.groupBy({ by: ['businessId'], _count: { id: true } }),
      this.prisma.$queryRaw<{ id: string; email: string }[]>`SELECT id::text, email FROM auth.users`,
    ]);

    const waMap = new Map(waSessions.map(s => [s.userId, s]));
    const productMap = new Map(productCounts.map(p => [p.businessId ?? '', p._count.id]));
    const saleMap = new Map(saleCounts.map(s => [s.businessId ?? '', s._count.id]));
    const emailMap = new Map(authUsers.map(u => [u.id, u.email]));

    return businesses.map(b => ({
      id: b.id,
      name: b.name,
      ownerEmail: emailMap.get(b.userId) ?? null,
      sector: b.sector,
      city: b.city,
      country: b.country,
      currency: b.currency,
      whatsappPhone: b.whatsappPhone,
      phone: b.phone,
      logoUrl: b.logoUrl,
      isDefault: b.isDefault,
      waConnected: waMap.get(b.userId)?.connected ?? false,
      productCount: productMap.get(b.id) ?? 0,
      saleCount: saleMap.get(b.id) ?? 0,
      createdAt: b.createdAt,
    }));
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
