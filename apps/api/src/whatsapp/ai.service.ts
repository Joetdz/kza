import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI, { toFile } from 'openai';

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

  // ── Build a strict, structured knowledge base ─────────────────────────────────
  private async buildKnowledgeBlock(userId: string): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    const entries = await this.prisma.whatsAppKBEntry.findMany({
      where: { userId, enabled: true },
      orderBy: { category: 'asc' },
    });

    const lines: string[] = [];

    // ── Produits : disponibilité uniquement (pas de quantité, pas de prix brut) ─
    if (products.length > 0) {
      lines.push('## DISPONIBILITÉ DES PRODUITS');
      lines.push('(Utilise uniquement cette section pour savoir si un produit est disponible ou non. Ne mentionne jamais les quantités en stock.)');
      lines.push('');
      for (const p of products) {
        if (p.quantity <= 0) {
          lines.push(`- ${p.name} → RUPTURE DE STOCK (ne pas proposer, ne pas mentionner le prix)`);
        } else {
          const cat = p.category ? ` | Catégorie : ${p.category}` : '';
          // Prix du catalogue = fallback UNIQUEMENT si aucun prix n'est mentionné dans le script KB
          const prix = p.sellingPrice > 0 ? ` | Prix catalogue (fallback) : ${p.sellingPrice}` : '';
          lines.push(`- ${p.name} → Disponible${prix}${cat}`);
        }
      }
      lines.push('');
    }

    // ── Base de connaissance (source de vérité pour les prix et scripts) ───────
    if (entries.length > 0) {
      const grouped: Record<string, string[]> = {};
      for (const e of entries) {
        if (!grouped[e.category]) grouped[e.category] = [];
        let block = `### ${e.title}\n${e.content}`;

        // Résoudre l'image : KB entry en priorité, sinon produit lié
        const kbImage = (e as any).imageUrl as string | null;
        const linkedProduct = e.productId ? products.find(p => p.id === e.productId) : null;
        const imageUrl = kbImage || linkedProduct?.imageUrl || null;

        if (linkedProduct) {
          const dispo = linkedProduct.quantity > 0 ? 'Disponible' : 'RUPTURE DE STOCK';
          block += `\n→ Disponibilité : ${dispo}`;
          const scriptHasPrice = !!(e as any).closingScript && /\d/.test((e as any).closingScript);
          const contentHasPrice = /\d/.test(e.content);
          if (!scriptHasPrice && !contentHasPrice && linkedProduct.sellingPrice > 0) {
            block += ` | Prix : ${linkedProduct.sellingPrice}`;
          }
        }

        if ((e as any).closingScript) {
          block += `\n→ Script de closing : "${(e as any).closingScript}"`;
        }

        if (imageUrl) {
          block += `\n→ IMAGE DISPONIBLE : ${imageUrl} (utilise [IMAGE: ${imageUrl}] dans ta réponse si le client demande une photo ou que montrer l'image est pertinent)`;
        }

        grouped[e.category].push(block);
      }

      // Aussi lister les images des produits non liés à une KB
      const kbProductIds = new Set(entries.filter(e => e.productId).map(e => e.productId));
      const productsWithImage = products.filter(p => p.imageUrl && !kbProductIds.has(p.id) && p.quantity > 0);
      if (productsWithImage.length > 0) {
        if (!grouped['PRODUITS']) grouped['PRODUITS'] = [];
        for (const p of productsWithImage) {
          grouped['PRODUITS'].push(
            `### ${p.name}\n→ IMAGE DISPONIBLE : ${p.imageUrl} (utilise [IMAGE: ${p.imageUrl}] si le client demande une photo)`
          );
        }
      }

      for (const [cat, items] of Object.entries(grouped)) {
        lines.push(`## ${cat.toUpperCase()}`);
        lines.push(items.join('\n\n'));
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private isWithinActiveHours(activeHours: any): boolean {
    if (!activeHours || !Array.isArray(activeHours) || activeHours.length === 0) return true;
    const now = new Date();
    const day = now.getDay();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todaySchedule = activeHours.find((h: any) => h.day === day);
    if (!todaySchedule) return false;
    return timeStr >= todaySchedule.from && timeStr <= todaySchedule.to;
  }

  private async transcribeAudio(base64: string, mimetype: string): Promise<string> {
    const buffer = Buffer.from(base64, 'base64');
    const ext = mimetype.split('/')[1]?.split(';')[0] ?? 'ogg';
    const file = await toFile(buffer, `audio.${ext}`, { type: mimetype });
    const result = await this.openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });
    return result.text;
  }

  // ── Build the system prompt ───────────────────────────────────────────────────
  private buildSystemPrompt(aiConfig: any, kb: string, leadStatus?: string): string {
    const agentIdentity = aiConfig.systemPrompt?.trim()
      ? aiConfig.systemPrompt.trim()
      : 'Tu es un agent commercial.';

    const parts: string[] = [];

    parts.push(`# IDENTITÉ
${agentIdentity}`);

    if (aiConfig.businessObjective?.trim()) {
      parts.push(`# OBJECTIF
${aiConfig.businessObjective.trim()}`);
    }

    if (aiConfig.brandPersonality?.trim()) {
      parts.push(`# TON & PERSONNALITÉ
${aiConfig.brandPersonality.trim()}`);
    }

    parts.push(`# LANGUE
Réponds toujours dans la langue utilisée par le client. Langue par défaut : ${aiConfig.primaryLanguage ?? 'fr'}.`);

    if (kb.trim()) {
      parts.push(`# CATALOGUE & BASE DE CONNAISSANCE
${kb.trim()}`);
    }

    if (aiConfig.blacklistTopics?.length > 0) {
      parts.push(`# SUJETS INTERDITS
Ne réponds jamais aux sujets suivants : ${aiConfig.blacklistTopics.join(', ')}.
Si le client aborde ces sujets, réponds poliment que tu ne peux pas en parler.`);
    }

    parts.push(`# RÈGLES ABSOLUES — LIS ATTENTIVEMENT
1. Tu es un humain, pas une IA. Ne révèle jamais que tu es un bot ou une intelligence artificielle.
⛔ FORMAT OBLIGATOIRE : Réponds TOUJOURS en texte naturel conversationnel. JAMAIS de JSON, JAMAIS de XML, JAMAIS de markdown, JAMAIS de listes structurées. Une réponse qui commence par { ou [ sera considérée comme une erreur grave.
2. CONTEXTE OBLIGATOIRE : Avant de répondre, lis TOUTE la conversation depuis le début. Tu dois connaître exactement quel produit le client a demandé, ce qui a déjà été dit, et où en est la discussion. Ne réponds JAMAIS sans avoir analysé l'intégralité de l'historique de cet échange.
⛔ NE JAMAIS REDEMANDER une information que le client a déjà donnée dans cette conversation (produit, quantité, adresse, préférence de livraison, etc.). Si le client a déjà dit "1 pièce", "je veux X", ou "mon adresse est Y" → ces informations sont acquises. Utilise-les directement. Redemander une info déjà donnée est une faute grave.
3. ANTI-HALLUCINATION : Ne cite JAMAIS une information qui ne figure pas dans la base de connaissance ou le catalogue ci-dessus.
4. QUANTITÉS EN STOCK : Ne mentionne JAMAIS les quantités disponibles (ex: "il en reste 5", "3 unités", etc.). Dis simplement "c'est disponible" ou "c'est en stock".
5. PRIX : Si le script de closing ou le contenu de la fiche KB mentionne un prix → utilise CE prix en priorité. N'utilise le prix catalogue (fallback) que si aucun prix n'est mentionné dans la KB.
6. ⛔ SUBSTITUTION INTERDITE : Si le client demande un produit précis, réponds UNIQUEMENT sur CE produit. Ne propose JAMAIS un autre produit à la place, même si tu penses qu'il conviendrait mieux. Si le produit est en rupture de stock, dis-le et laisse le client choisir. Tu n'as pas le droit de rediriger le client vers un produit différent de celui qu'il a demandé.
7. Si tu n'as pas la réponse → réponds : "Je vais vérifier ça pour vous et reviens vers vous très vite 🙏" (adapte à la langue du client).
8. JAMAIS de markdown dans tes réponses (pas de **, pas de #, pas de tirets -). C'est WhatsApp, texte brut uniquement.
9. Réponds comme un vrai vendeur humain : naturel, chaleureux, court. Maximum 3 phrases par message.
10. MESSAGE VAGUE SANS PRODUIT : Si le message du client ne mentionne aucun produit, aucune catégorie, aucune caractéristique ("bonjour", "je veux en savoir plus", "c'est quoi vos produits ?", etc.) → pose UNE question ouverte pour découvrir son besoin. Ex : "Bien sûr ! Qu'est-ce qui vous intéresse ?" ou "Avec plaisir, vous cherchez quelque chose en particulier ?". N'évoque JAMAIS un produit avant que le client en ait parlé lui-même.
11. PRODUIT AMBIGU : Si le client mentionne un produit mais que tu n'es pas sûr duquel il s'agit exactement, pose UNE question de clarification. Ex : "Vous parlez de quel produit exactement ?". Ne devine jamais.
12. SCRIPT DE CLOSING : Utilise le script de closing d'un produit UNIQUEMENT si le client a nommé ou décrit CE produit précis dans les messages récents de CETTE conversation. Ne jamais utiliser un script de closing d'un produit que le client n'a pas mentionné dans cet échange.
13. IMAGES : Si le client demande une photo, un visuel ou que tu juges utile de montrer un produit, inclus exactement [IMAGE: url] à la fin de ton message texte (une seule image par réponse). N'invente jamais d'URL — utilise uniquement les URLs marquées "IMAGE DISPONIBLE" dans le catalogue.
14. Ne répète pas ce que tu viens de dire dans le même échange.
${leadStatus === 'converted' ? `\n⚠️ STATUT CLIENT : VENTE ACQUISE. La commande est confirmée. Ne propose plus aucun produit. Réponds uniquement aux questions logistiques (livraison, délai, suivi).` : ''}`);

    return parts.join('\n\n');
  }

  // ── Main reply ────────────────────────────────────────────────────────────────
  async reply(
    userId: string,
    _contactPhone: string,
    messages: Array<{ direction: string; content: string }>,
    newMessage: string,
    mediaBase64?: string,
    mediaMimetype?: string,
    leadStatus?: string,
  ): Promise<{ text: string; shouldEscalate: boolean; imageUrl?: string } | null> {
    const aiConfig = await this.getConfig(userId);
    if (!aiConfig.enabled) return null;

    if (!this.isWithinActiveHours(aiConfig.activeHours)) {
      return { text: aiConfig.outsideHoursMessage, shouldEscalate: false };
    }

    // Escalation keyword check
    const lowerMsg = newMessage.toLowerCase();
    const shouldEscalate = aiConfig.escalationKeywords.some(kw => lowerMsg.includes(kw.toLowerCase()));
    if (shouldEscalate) {
      return { text: aiConfig.escalationMessage, shouldEscalate: true };
    }

    const kb = await this.buildKnowledgeBlock(userId);
    const systemPrompt = this.buildSystemPrompt(aiConfig, kb, leadStatus);

    // Full conversation history — Barbara must always have complete context
    const history = messages.slice(-30).map(m => ({
      role: (m.direction === 'out' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));

    // Build user message (text, image, or transcribed audio)
    let userMessage: any;
    if (mediaBase64 && mediaMimetype) {
      const isAudio = mediaMimetype.startsWith('audio/');
      const isImage = mediaMimetype.startsWith('image/');

      if (isAudio) {
        try {
          const transcription = await this.transcribeAudio(mediaBase64, mediaMimetype);
          const text = transcription
            ? `${transcription}${newMessage ? `\n${newMessage}` : ''}`
            : newMessage || '[Message vocal incompréhensible]';
          userMessage = { role: 'user', content: text };
        } catch (err) {
          this.logger.error('Whisper error:', err);
          userMessage = { role: 'user', content: newMessage || '[Message vocal non transcrit]' };
        }
      } else if (isImage) {
        const caption = newMessage?.trim()
          || 'Le client a envoyé cette image. Identifie ce que tu vois (produit, demande, contexte) et réponds en tant qu\'agent commercial selon ton catalogue.';
        const content: any[] = [
          { type: 'image_url', image_url: { url: `data:${mediaMimetype};base64,${mediaBase64}`, detail: 'high' } },
          { type: 'text', text: caption },
        ];
        userMessage = { role: 'user', content };
      } else {
        userMessage = { role: 'user', content: newMessage || '[Fichier reçu]' };
      }
    } else {
      userMessage = { role: 'user', content: newMessage };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          userMessage,
        ],
        temperature: 0.3,   // low = stays grounded, no invention
        max_tokens: 200,    // forces short replies
        presence_penalty: 0.6,  // avoids repeating itself
        frequency_penalty: 0.3,
      });

      let raw = response.choices[0]?.message?.content?.trim() ?? '';
      if (!raw) return null;

      // Safety net: if GPT returns JSON despite instructions, retry once with a harder nudge
      const looksLikeJson = /^\s*[\[{]/.test(raw);
      if (looksLikeJson) {
        this.logger.warn('AI returned JSON — retrying with stricter instruction');
        const retry = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            userMessage,
            {
              role: 'assistant',
              content: raw,
            },
            {
              role: 'user',
              content: 'Réponds en texte naturel uniquement, sans JSON, sans accolades, sans crochets. Réécris ta réponse précédente en message WhatsApp conversationnel.',
            },
          ],
          temperature: 0.4,
          max_tokens: 200,
        });
        raw = retry.choices[0]?.message?.content?.trim() ?? '';
        if (!raw || /^\s*[\[{]/.test(raw)) return null;
      }

      // Extract [IMAGE: url] marker if present
      const imageMatch = raw.match(/\[IMAGE:\s*(https?:\/\/[^\]]+)\]/i);
      const imageUrl = imageMatch?.[1]?.trim() ?? undefined;
      // Remove the marker from the text sent to client
      const text = raw.replace(/\[IMAGE:\s*[^\]]+\]/gi, '').trim();

      return { text, shouldEscalate: false, imageUrl };
    } catch (err) {
      this.logger.error('OpenAI error:', err);
      return null;
    }
  }

  // ── Lead qualification ────────────────────────────────────────────────────────
  async qualify(
    _userId: string,
    messages: Array<{ direction: string; content: string }>,
  ): Promise<Partial<LeadQualification> | null> {
    if (messages.length < 2) return null;

    const conversation = messages
      .slice(-10)
      .map(m => `${m.direction === 'in' ? 'Client' : 'Agent'}: ${m.content}`)
      .join('\n');

    const prompt = `Tu analyses une conversation WhatsApp d'une boutique.
Extrait les informations du prospect. Réponds UNIQUEMENT en JSON valide, sans texte autour.

Champs (null si information absente ou non confirmée par le client):
{
  "leadName": string|null,
  "leadNeed": string|null,
  "leadBudget": string|null,
  "leadCity": string|null,
  "leadUrgency": "faible"|"moyenne"|"haute"|null,
  "leadProduct": string|null,
  "leadScore": number entre 0 et 100,
  "leadStatus": "cold"|"warm"|"hot"|"converted"|"lost"
}

Critères de score:
- cold (0-30): curieux, pas d'intention d'achat claire
- warm (31-60): intérêt réel, pose des questions
- hot (61-85): mentionne budget OU urgence OU demande prix précis
- converted (86-100): achat confirmé ou rendez-vous pris
- lost: a dit non, pas intéressé, ou a stoppé la conversation

Conversation:
${conversation}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 250,
        response_format: { type: 'json_object' },
      });

      const json = JSON.parse(response.choices[0]?.message?.content ?? '{}');
      return json as Partial<LeadQualification>;
    } catch (err) {
      this.logger.error('Qualify error:', err);
      return null;
    }
  }

  // ── Silent product mention classifier (runs on every incoming message) ────────
  async classifyProductMention(
    text: string,
    products: { id: string; name: string }[],
  ): Promise<{ productId: string | null; productName: string | null }> {
    if (!text?.trim() || products.length === 0) return { productId: null, productName: null };

    const list = products.map(p => `- ${p.name} (id:${p.id})`).join('\n');
    const prompt = `Tu analyses un message WhatsApp d'un client pour identifier quel produit est mentionné.

Produits disponibles :
${list}

Message client : "${text.substring(0, 300)}"

Si le message mentionne clairement un produit de la liste (ou une variante proche), réponds en JSON :
{"productId":"<id>","productName":"<nom exact du produit>"}

Si aucun produit n'est clairement mentionné, réponds :
{"productId":null,"productName":null}

Réponds UNIQUEMENT en JSON, rien d'autre.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 60,
        response_format: { type: 'json_object' },
      });
      const raw = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw);
      return {
        productId: parsed.productId ?? null,
        productName: parsed.productName ?? null,
      };
    } catch {
      return { productId: null, productName: null };
    }
  }

  // ── Extract order details from conversation for auto-draft ────────────────────
  // Name and phone come from WhatsApp directly — AI only extracts order details.
  async extractOrderDetails(
    history: Array<{ direction: string; content: string }>,
    catalog: Array<{ id: string; name: string; sellingPrice: number }>,
  ): Promise<{
    productId: string | null;
    productName: string | null;
    productQuantity: number;
    agreedPriceUsd: number | null;
    deliveryFeeCdf: number | null;
    city: string | null;
    address: string | null;
    expectedDeliveryDate: string | null;
    notes: string | null;
  }> {
    const conversation = history
      .slice(-40)
      .map(m => `${m.direction === 'in' ? 'Client' : 'Vendeur'}: ${m.content}`)
      .join('\n');

    const catalogLines = catalog.length > 0
      ? catalog.map(p => `- ${p.name} (id: ${p.id})${p.sellingPrice > 0 ? ` — prix catalogue: ${p.sellingPrice}$` : ''}`).join('\n')
      : '(catalogue vide)';

    const prompt = `Tu es un extracteur de données de commande. Lis la conversation WhatsApp ci-dessous et extrais uniquement les informations EXPLICITEMENT mentionnées.

⛔ RÈGLE ABSOLUE : Tu n'inventes RIEN. Si une information n'est pas littéralement dans la conversation → null. Pas de déduction, pas d'estimation.

Catalogue produits disponibles :
${catalogLines}

Conversation :
${conversation}

Réponds UNIQUEMENT en JSON valide :
{
  "productId": string|null,
  "productName": string|null,
  "productQuantity": number,
  "agreedPriceUsd": number|null,
  "deliveryFeeCdf": number|null,
  "city": string|null,
  "address": string|null,
  "expectedDeliveryDate": string|null,
  "notes": string|null
}

Règles :
- productId : id du produit du catalogue qui correspond à ce que le client a commandé. Si le produit n'est pas dans le catalogue → null pour productId, mais mets le nom dans productName.
- productName : nom exact du produit commandé tel que mentionné dans la conversation. null si non mentionné.
- productQuantity : quantité explicitement mentionnée. 1 si non précisée.
- agreedPriceUsd : prix en $ USD du produit convenu dans la conversation (pas la livraison). null si non mentionné.
- deliveryFeeCdf : frais de livraison en FC convenus dans la conversation. null si non mentionné.
- city : ville explicitement mentionnée. null si absente.
- address : adresse complète telle qu'écrite par le client (avenue, quartier, commune, numéro, références). null si absente.
- expectedDeliveryDate : date de livraison prévue au format ISO YYYY-MM-DD. Interprète les expressions comme "lundi", "demain", "dans 2 jours", "le 15" en date absolue par rapport à aujourd'hui (${new Date().toISOString().split('T')[0]}). null si non mentionnée.
- notes : tout commentaire, attente particulière, instruction spéciale ou information supplémentaire du client qui ne rentre pas dans les autres champs. null si rien.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 250,
        response_format: { type: 'json_object' },
      });
      const raw = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw);
      return {
        productId: parsed.productId ?? null,
        productName: parsed.productName ?? null,
        productQuantity: Number(parsed.productQuantity) || 1,
        agreedPriceUsd: parsed.agreedPriceUsd != null ? Number(parsed.agreedPriceUsd) : null,
        deliveryFeeCdf: parsed.deliveryFeeCdf != null ? Number(parsed.deliveryFeeCdf) : null,
        city: parsed.city ?? null,
        address: parsed.address ?? null,
        expectedDeliveryDate: parsed.expectedDeliveryDate ?? null,
        notes: parsed.notes ?? null,
      };
    } catch {
      return {
        productId: null, productName: null, productQuantity: 1,
        agreedPriceUsd: null, deliveryFeeCdf: null, city: null, address: null,
        expectedDeliveryDate: null, notes: null,
      };
    }
  }

  // ── Order recap sent automatically when leadStatus = converted ────────────────
  async generateOrderRecap(
    history: Array<{ direction: string; content: string }>,
    language = 'fr',
  ): Promise<string | null> {
    const conversation = history
      .slice(-10)
      .map(m => `${m.direction === 'in' ? 'Client' : 'Agent'}: ${m.content}`)
      .join('\n');

    const prompt = `Tu es un agent commercial. La commande vient d'être confirmée après que le client a donné son adresse.

Rédige un message de récapitulatif de commande naturel et chaleureux, en texte brut (zéro markdown, zéro **).

Structure exacte à respecter :
1. Remercier pour les infos
2. Récapituler le produit commandé (tel que mentionné dans la conversation)
3. Mentionner le coût de livraison pour la zone du client (tel que mentionné dans la conversation)
4. Donner le total (prix produit + livraison, tels que mentionnés)
5. Terminer avec : "Un livreur va vous contacter tout à l'heure. Si vous avez des questions, n'hésitez pas !"

Langue : ${language}
Maximum 4-5 lignes. N'invente aucun prix ou produit — utilise uniquement ce qui est dans la conversation.

Conversation :
${conversation}

Écris uniquement le message, rien d'autre.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      });
      return response.choices[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      this.logger.error('generateOrderRecap error:', err);
      return null;
    }
  }

  async generateClosingScript(product: {
    name: string;
    price?: string | number;
    category?: string;
    quantity?: number;
  }): Promise<string | null> {
    const priceClause = product.price ? `Prix : ${product.price}` : null;
    const catClause = product.category ? `Catégorie : ${product.category}` : null;
    const stockClause = product.quantity !== undefined ? `Stock : ${product.quantity} unité(s)` : null;
    const productInfo = [product.name, priceClause, catClause, stockClause].filter(Boolean).join(' | ');

    const prompt = `Tu es un closer WhatsApp expert en vente e-commerce en Afrique francophone (Congo, Sénégal, Côte d'Ivoire).

Génère un script de vente WhatsApp COMPLET pour ce produit : ${productInfo}

STRUCTURE OBLIGATOIRE — génère exactement ces 5 sections avec les titres markdown :

## 🟢 PREMIER MESSAGE (lead froid)
[Message d'accroche : salutation + bénéfices en bullets ✔️ + prix + pack si applicable + question fermée "Je vous mets 1 ou 2 ?" ou "Je vous en mets 1 ?"]

## 🔵 CLOSE (après accord)
[Demande commune/adresse pour livraison]

## 💣 OBJECTIONS
### ❌ "Ça marche vraiment ?"
[Réponse rassurante + question fermée]
### ❌ "Je réfléchis"
[Urgence douce + réservation + question fermée]
### ❌ "C'est cher"
[Justification valeur + question fermée]
### ❌ "Livraison ?"
[Réponse sur la livraison + demande de commune]

## 🔁 RELANCE
### ⏱️ 2-3h après
[Message de relance court]
### ⏱️ Lendemain
[Rappel stock + close]

## 🧠 RÈGLE CLÉ
[La question assumptive principale du produit — ex: "je vous mets 1 ou 2 ?" pas "vous voulez combien ?"]

RÈGLES ABSOLUES :
- Ton chaleureux, humain, direct — pas corporate
- Question FERMÉE assumptive (suppose déjà la vente)
- Emojis stratégiques : ✔️ 💰 🔥 👉 👌 😊 ⏱️
- N'invente aucun prix si non fourni
- Français naturel, pas traduit
- Messages courts — WhatsApp, pas email

Écris uniquement le script formaté, rien d'autre.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 900,
      });
      return response.choices[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      this.logger.error('generateClosingScript error:', err);
      return null;
    }
  }

  // ── Relance personnalisée ────────────────────────────────────────────────────

  async generateRelanceMessage(
    conversationHistory: { direction: string; content: string }[],
    orderInfo: { customerName: string; productName: string; orderNumber: string },
  ): Promise<string | null> {
    if (!conversationHistory.length) return null;
    const convo = conversationHistory
      .slice(-15)
      .map(m => `${m.direction === 'in' ? 'Client' : 'Nous'}: ${m.content}`)
      .join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Tu es un assistant commercial. Voici la conversation WhatsApp avec un client :

${convo}

Génère un message de relance naturel et court (2-3 lignes max) basé sur cette conversation.
- Client : ${orderInfo.customerName}
- Commande : #${orderInfo.orderNumber} (${orderInfo.productName})
- Fais référence à la conversation précédente si pertinent
- Ton chaleureux, pas trop formel
- Ne mentionne pas que tu es une IA
Réponds UNIQUEMENT avec le texte du message.`,
        }],
        max_tokens: 200,
        temperature: 0.8,
      });
      return response.choices[0]?.message?.content?.trim() ?? null;
    } catch {
      return null;
    }
  }

  // ── Détection de promesse de retour ─────────────────────────────────────────
  // Retourne la date à laquelle le client dit qu'il reviendra, ou null

  private readonly RETURN_KEYWORDS = /revien|ferai signe|rappellerai|prochaine semaine|semaine prochaine|le mois prochain|demain|après-demain|dans \d|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i;

  async detectReturnDate(messageText: string): Promise<Date | null> {
    if (!this.RETURN_KEYWORDS.test(messageText)) return null;

    const today = new Date().toISOString().split('T')[0];
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Aujourd'hui : ${today}.
Message client : "${messageText}"
Si ce message contient une promesse de revenir ou de recontacter (ex: "je reviendrai la semaine prochaine", "je vous ferai signe demain"), extrais la date correspondante au format YYYY-MM-DD.
Si aucune promesse de retour : réponds null
Réponds UNIQUEMENT avec la date YYYY-MM-DD ou null.`,
        }],
        max_tokens: 15,
        temperature: 0,
      });
      const text = response.choices[0]?.message?.content?.trim() ?? 'null';
      if (!text || text === 'null') return null;
      const date = new Date(text);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  }
}
