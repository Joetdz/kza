import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

export interface LeadQualification {
  leadName?: string;
  leadNeed?: string;
  leadBudget?: string;
  leadCity?: string;
  leadUrgency?: string;
  leadProduct?: string;
  leadScore: number;
  leadStatus: 'cold' | 'warm' | 'hot' | 'converted' | 'lost';
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  private async getConfig(userId: string) {
    return this.prisma.whatsAppAIConfig.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  private async getKnowledgeBase(userId: string): Promise<string> {
    const entries = await this.prisma.whatsAppKBEntry.findMany({
      where: { userId, enabled: true },
      orderBy: { category: 'asc' },
    });

    if (entries.length === 0) return '';

    const grouped: Record<string, string[]> = {};
    for (const e of entries) {
      if (!grouped[e.category]) grouped[e.category] = [];

      let block = `**${e.title}**\n${e.content}`;
      if (e.closingScript) {
        block += `\n\n📌 Script de closing pour ce produit:\n"${e.closingScript}"`;
      }
      grouped[e.category].push(block);
    }

    return Object.entries(grouped)
      .map(([cat, items]) => `=== ${cat.toUpperCase()} ===\n${items.join('\n\n')}`)
      .join('\n\n');
  }

  private isWithinActiveHours(activeHours: any): boolean {
    if (!activeHours || !Array.isArray(activeHours) || activeHours.length === 0) return true;
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon, ...
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const todaySchedule = activeHours.find((h: any) => h.day === day);
    if (!todaySchedule) return false;
    return timeStr >= todaySchedule.from && timeStr <= todaySchedule.to;
  }

  async reply(
    userId: string,
    contactPhone: string,
    messages: Array<{ direction: string; content: string }>,
    newMessage: string,
  ): Promise<{ text: string; shouldEscalate: boolean } | null> {
    const aiConfig = await this.getConfig(userId);

    if (!aiConfig.enabled) return null;

    // Check horaires
    if (!this.isWithinActiveHours(aiConfig.activeHours)) {
      return { text: aiConfig.outsideHoursMessage, shouldEscalate: false };
    }

    // Check escalation keywords
    const lowerMsg = newMessage.toLowerCase();
    const shouldEscalate = aiConfig.escalationKeywords.some(kw => lowerMsg.includes(kw.toLowerCase()));
    if (shouldEscalate) {
      return { text: aiConfig.escalationMessage, shouldEscalate: true };
    }

    const kb = await this.getKnowledgeBase(userId);

    const systemPrompt = [
      aiConfig.systemPrompt || 'Tu es un assistant commercial professionnel et chaleureux.',
      aiConfig.businessObjective ? `Objectif business: ${aiConfig.businessObjective}` : '',
      aiConfig.brandPersonality ? `Personnalité de marque: ${aiConfig.brandPersonality}` : '',
      `Langue principale: ${aiConfig.primaryLanguage}`,
      aiConfig.blacklistTopics.length > 0
        ? `Sujets à éviter: ${aiConfig.blacklistTopics.join(', ')}`
        : '',
      kb ? `\n\n--- BASE DE CONNAISSANCE ---\n${kb}` : '',
      '\nRéponds de façon concise (2-4 phrases max). Réponds dans la langue du client.',
      kb ? '\nSi un produit correspond à la demande du client et qu\'un script de closing est disponible, utilise-le naturellement en fin de réponse.' : '',
    ].filter(Boolean).join('\n');

    // Construire l'historique (5 derniers messages max)
    const history = messages.slice(-5).map(m => ({
      role: (m.direction === 'out' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: newMessage },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const text = response.choices[0]?.message?.content?.trim() ?? '';
      if (!text) return null;

      return { text, shouldEscalate: false };
    } catch (err) {
      this.logger.error('OpenAI error:', err);
      return null;
    }
  }

  async qualify(
    userId: string,
    messages: Array<{ direction: string; content: string }>,
  ): Promise<Partial<LeadQualification> | null> {
    if (messages.length < 2) return null;

    const conversation = messages
      .slice(-10)
      .map(m => `${m.direction === 'in' ? 'Client' : 'Agent'}: ${m.content}`)
      .join('\n');

    const prompt = `Analyse cette conversation WhatsApp et extrait les informations du prospect.
Réponds UNIQUEMENT en JSON valide avec ces champs (null si inconnu):
{
  "leadName": string|null,
  "leadNeed": string|null,
  "leadBudget": string|null,
  "leadCity": string|null,
  "leadUrgency": "faible"|"moyenne"|"haute"|null,
  "leadProduct": string|null,
  "leadScore": number (0-100),
  "leadStatus": "cold"|"warm"|"hot"|"converted"|"lost"
}

Critères de score:
- cold (0-30): juste curieux, pas d'intention claire
- warm (31-60): intérêt exprimé, quelques questions
- hot (61-85): budget mentionné OU urgence haute OU demande de prix précis
- converted (86-100): achat confirmé ou rendez-vous pris

Conversation:
${conversation}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const json = JSON.parse(response.choices[0]?.message?.content ?? '{}');
      return json as Partial<LeadQualification>;
    } catch (err) {
      this.logger.error('Qualify error:', err);
      return null;
    }
  }
}
