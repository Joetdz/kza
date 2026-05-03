import { Controller, Post, Body, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import OpenAI from 'openai';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Controller('business-ai')
export class BusinessAiController {
  private openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(private prisma: PrismaService) {}

  // ── Build full business context for this client ───────────────────────────

  private async buildContext(userId: string): Promise<string> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      profile,
      products,
      salesRaw,
      expensesRaw,
      leads,
      audienceCount,
      salesLast30,
      expensesLast30,
      topProducts,
      leadsBreakdown,
    ] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.product.findMany({
        where: { userId },
        select: { name: true, category: true, sellingPrice: true, quantity: true, acquisitionCost: true },
      }),
      this.prisma.sale.findMany({
        where: { userId },
        include: { items: true },
      }),
      this.prisma.expense.findMany({ where: { userId } }),
      this.prisma.whatsAppContact.count({ where: { userId } }),
      this.prisma.waCampaignContact.count({ where: { clientId: userId } }),
      this.prisma.sale.findMany({
        where: { userId, date: { gte: thirtyDaysAgo } },
        include: { items: true },
      }),
      this.prisma.expense.findMany({
        where: { userId, date: { gte: thirtyDaysAgo } },
      }),
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where: { sale: { userId } },
        _sum: { quantity: true },
        _count: { id: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      this.prisma.whatsAppContact.groupBy({
        by: ['leadStatus'],
        where: { userId },
        _count: { id: true },
      }),
    ]);

    // Revenue calculations
    const totalRevenue = salesRaw.reduce(
      (sum, s) => sum + s.items.reduce((si, i) => si + i.quantity * i.unitPrice, 0), 0
    );
    const totalExpenses = expensesRaw.reduce((sum, e) => sum + e.amount, 0);
    const revenue30d = salesLast30.reduce(
      (sum, s) => sum + s.items.reduce((si, i) => si + i.quantity * i.unitPrice, 0), 0
    );
    const expenses30d = expensesLast30.reduce((sum, e) => sum + e.amount, 0);
    const profit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : '0';

    // Lead breakdown
    const leadsMap: Record<string, number> = {};
    for (const row of leadsBreakdown) leadsMap[row.leadStatus] = row._count.id;
    const totalLeads = Object.values(leadsMap).reduce((a, b) => a + b, 0);
    const conversionRate = totalLeads > 0
      ? (((leadsMap['converted'] ?? 0) / totalLeads) * 100).toFixed(1)
      : '0';

    // Top products names
    const productMap = new Map(products.map(p => [p.name, p]));
    const topProductIds = topProducts.map(t => t.productId).filter(Boolean);
    const topProductNames = await this.prisma.product.findMany({
      where: { id: { in: topProductIds as string[] } },
      select: { id: true, name: true },
    });
    const topProductNamesMap = new Map(topProductNames.map(p => [p.id, p.name]));

    // Channel breakdown
    const channelMap: Record<string, number> = {};
    for (const sale of salesRaw) {
      channelMap[sale.channel] = (channelMap[sale.channel] ?? 0) + 1;
    }

    return `
=== DONNÉES BUSINESS DU CLIENT ===

PROFIL:
- Entreprise: ${profile?.companyName ?? 'Non défini'}
- Secteur: ${profile?.businessSector ?? 'Non défini'}

FINANCES GLOBALES:
- Chiffre d'affaires total: ${totalRevenue.toFixed(0)} FCFA / ${salesRaw.length} ventes
- Dépenses totales: ${totalExpenses.toFixed(0)} FCFA
- Bénéfice net: ${profit.toFixed(0)} FCFA
- Marge bénéficiaire: ${margin}%

30 DERNIERS JOURS:
- CA: ${revenue30d.toFixed(0)} FCFA / ${salesLast30.length} ventes
- Dépenses: ${expenses30d.toFixed(0)} FCFA
- Bénéfice: ${(revenue30d - expenses30d).toFixed(0)} FCFA

PRODUITS (${products.length} références):
${products.slice(0, 10).map(p =>
  `- ${p.name} | Catégorie: ${p.category} | Prix vente: ${p.sellingPrice} FCFA | Stock: ${p.quantity} | Coût achat: ${p.acquisitionCost} FCFA`
).join('\n')}
${products.length > 10 ? `... et ${products.length - 10} autres produits` : ''}

TOP 5 PRODUITS LES PLUS VENDUS:
${topProducts.map((t, i) =>
  `${i + 1}. ${topProductNamesMap.get(t.productId!) ?? 'Inconnu'} — ${t._sum.quantity ?? 0} unités vendues`
).join('\n')}

CANAUX DE VENTE:
${Object.entries(channelMap).map(([k, v]) => `- ${k}: ${v} ventes`).join('\n')}

CRM / LEADS (${totalLeads} contacts):
- Froids (cold): ${leadsMap['cold'] ?? 0}
- Tièdes (warm): ${leadsMap['warm'] ?? 0}
- Chauds (hot): ${leadsMap['hot'] ?? 0}
- Convertis: ${leadsMap['converted'] ?? 0}
- Perdus: ${leadsMap['lost'] ?? 0}
- Taux de conversion: ${conversionRate}%

AUDIENCE WHATSAPP:
- Contacts synchronisés: ${audienceCount}
- Leads CRM actifs: ${leads}

DATE ACTUELLE: ${now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
`;
  }

  // ── Chat endpoint ────────────────────────────────────────────────────────

  @Post('chat')
  async chat(
    @CurrentUser() user: AuthUser,
    @Body() body: { message: string; history?: ChatMessage[] },
  ) {
    const context = await this.buildContext(user.id);

    const systemPrompt = `Tu es un Business Developer IA expert et consultant stratégique personnel pour ce client.
Tu as accès à toutes ses données commerciales en temps réel (ci-dessous).
Tu parles TOUJOURS en français, tu es proactif, direct et concret.

Ton rôle:
1. Analyser les données et identifier des opportunités de croissance
2. Donner des conseils stratégiques actionnables et précis
3. Identifier les problèmes (stock faible, leads froids, faible conversion, etc.)
4. Proposer des actions prioritaires avec un impact estimé
5. Répondre aux questions avec des chiffres concrets tirés des données

Style: expert, bienveillant, direct. Utilise des bullet points et des chiffres. Sois proactif — si tu vois un problème dans les données, mentionne-le même si on ne t'en a pas parlé.

${context}`;

    const messages = [
      ...(body.history ?? []).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: body.message },
    ];

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 800,
      temperature: 0.7,
    });

    return {
      message: completion.choices[0]?.message?.content ?? 'Désolé, je n\'ai pas pu générer une réponse.',
    };
  }

  // ── Quick insights (called on open) ──────────────────────────────────────

  @Get('insights')
  async getInsights(@CurrentUser() user: AuthUser) {
    const context = await this.buildContext(user.id);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Tu es un Business Developer IA. Analyse les données suivantes et génère 3 insights clés ultra-concis (1 ligne chacun) avec une priorité (🔴 urgent, 🟡 important, 🟢 opportunité). Réponds en JSON: {"insights": [{"priority": "🔴", "text": "..."}]}.\n\n${context}`,
        },
        { role: 'user', content: 'Donne-moi les 3 insights les plus importants sur mon business.' },
      ],
      max_tokens: 300,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    try {
      return JSON.parse(completion.choices[0]?.message?.content ?? '{"insights":[]}');
    } catch {
      return { insights: [] };
    }
  }
}
