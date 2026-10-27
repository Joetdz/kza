import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { documentTotals, toInternationalPhone, type DocumentLine } from '@kza/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { CreateSaleDto } from '../sales/dto/create-sale.dto';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { SaveDocumentDto } from './dto/document.dto';

const PREFIX = { quote: 'DEV', invoice: 'FAC' } as const;

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private sales: SalesService,
    private whatsapp: WhatsAppService,
  ) {}

  private withTotals<T extends { items: Prisma.JsonValue; discount: number; taxRate: number }>(doc: T) {
    return { ...doc, ...documentTotals({ items: doc.items as unknown as DocumentLine[], discount: doc.discount, taxRate: doc.taxRate }) };
  }

  private async find(id: string, userId: string, businessId: string | null) {
    const doc = await this.prisma.commercialDocument.findFirst({ where: { id, userId, businessId } });
    if (!doc) throw new NotFoundException('Document introuvable');
    return doc;
  }

  async list(userId: string, businessId: string | null, type?: string) {
    const docs = await this.prisma.commercialDocument.findMany({
      where: { userId, businessId, ...(type ? { type } : {}) },
      orderBy: [{ year: 'desc' }, { seq: 'desc' }],
    });
    return docs.map(d => this.withTotals(d));
  }

  private cleanLines(items: DocumentLine[]): DocumentLine[] {
    const lines = items
      .map(l => ({
        productId: l.productId || null,
        description: l.description.trim(),
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
      }))
      .filter(l => l.description && l.quantity > 0);
    if (lines.length === 0) throw new BadRequestException('Ajoutez au moins une ligne.');
    return lines;
  }

  /**
   * Next number for this business, type and year. The unique index on
   * (business, type, year, seq) is the real guard: on a collision with a concurrent
   * create, try the next number.
   */
  async create(userId: string, businessId: string | null, dto: SaveDocumentDto, extra: { sourceQuoteId?: string } = {}) {
    const year = Number(dto.issueDate.slice(0, 4));
    const items = this.cleanLines(dto.items) as unknown as Prisma.InputJsonValue;
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await this.prisma.commercialDocument.findFirst({
        where: { userId, businessId, type: dto.type, year },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });
      const seq = (last?.seq ?? 0) + 1;
      try {
        const doc = await this.prisma.commercialDocument.create({
          data: {
            userId, businessId, type: dto.type, year, seq,
            number: `${PREFIX[dto.type]}-${year}-${String(seq).padStart(4, '0')}`,
            customerName: dto.customerName.trim(),
            customerPhone: dto.customerPhone?.trim() || null,
            customerAddress: dto.customerAddress?.trim() || null,
            items,
            discount: dto.discount ?? 0,
            taxRate: dto.taxRate ?? 0,
            notes: dto.notes?.trim() || null,
            status: dto.status ?? (dto.type === 'quote' ? 'draft' : 'unpaid'),
            issueDate: new Date(dto.issueDate),
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
            sourceQuoteId: extra.sourceQuoteId ?? null,
          },
        });
        return this.withTotals(doc);
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
      }
    }
    throw new BadRequestException('Numérotation impossible, réessayez.');
  }

  async update(id: string, userId: string, businessId: string | null, dto: Partial<SaveDocumentDto>) {
    const doc = await this.find(id, userId, businessId);
    const updated = await this.prisma.commercialDocument.update({
      where: { id: doc.id },
      data: {
        ...(dto.customerName !== undefined && { customerName: dto.customerName.trim() }),
        ...(dto.customerPhone !== undefined && { customerPhone: dto.customerPhone?.trim() || null }),
        ...(dto.customerAddress !== undefined && { customerAddress: dto.customerAddress?.trim() || null }),
        ...(dto.items !== undefined && { items: this.cleanLines(dto.items) as unknown as Prisma.InputJsonValue }),
        ...(dto.discount !== undefined && { discount: dto.discount }),
        ...(dto.taxRate !== undefined && { taxRate: dto.taxRate }),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.issueDate !== undefined && { issueDate: new Date(dto.issueDate) }),
        ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }),
      },
    });
    return this.withTotals(updated);
  }

  async remove(id: string, userId: string, businessId: string | null) {
    const doc = await this.find(id, userId, businessId);
    await this.prisma.commercialDocument.delete({ where: { id: doc.id } });
    return { id };
  }

  /** Accepted quote → invoice with the same lines; the quote is marked accepted. */
  async quoteToInvoice(id: string, userId: string, businessId: string | null) {
    const quote = await this.find(id, userId, businessId);
    if (quote.type !== 'quote') throw new BadRequestException("Ce document n'est pas un devis.");
    const existing = await this.prisma.commercialDocument.findFirst({ where: { userId, businessId, sourceQuoteId: quote.id } });
    if (existing) return this.withTotals(existing);

    const today = new Date().toISOString().slice(0, 10);
    const invoice = await this.create(userId, businessId, {
      type: 'invoice',
      customerName: quote.customerName,
      customerPhone: quote.customerPhone ?? undefined,
      customerAddress: quote.customerAddress ?? undefined,
      items: quote.items as unknown as DocumentLine[],
      discount: quote.discount,
      taxRate: quote.taxRate,
      notes: quote.notes ?? undefined,
      issueDate: today,
      dueDate: null,
    }, { sourceQuoteId: quote.id });
    await this.prisma.commercialDocument.update({ where: { id: quote.id }, data: { status: 'accepted' } });
    return invoice;
  }

  /**
   * Records the document as a sale, so stock and revenue follow. Product lines take
   * stock out (paid / credit); free-text lines are kept as amounts only.
   */
  async createSale(id: string, userId: string, businessId: string | null, status: 'paid' | 'pending' | 'credit') {
    const doc = await this.find(id, userId, businessId);
    if (doc.saleId) throw new BadRequestException('Une vente a déjà été créée pour ce document.');
    const lines = doc.items as unknown as DocumentLine[];
    const { subtotal, total } = documentTotals({ items: lines, discount: doc.discount, taxRate: doc.taxRate });
    // Discount and tax are spread over the lines so the sale adds up to the document total.
    const factor = subtotal > 0 ? total / subtotal : 1;

    const sale = await this.sales.create({
      channel: 'Autre',
      date: new Date().toISOString().slice(0, 10),
      note: `${doc.number}${doc.notes ? ` — ${doc.notes}` : ''}`,
      status,
      customerName: doc.customerName,
      customerPhone: doc.customerPhone ?? undefined,
      items: lines.map(l => ({
        productId: l.productId ?? undefined,
        quantity: l.quantity,
        unitPrice: Math.round(l.unitPrice * factor * 100) / 100,
      })),
    // Free-text lines have no productId: stored as amounts, no stock movement.
    } as unknown as CreateSaleDto, userId, businessId ?? undefined);

    await this.prisma.commercialDocument.update({
      where: { id: doc.id },
      data: {
        saleId: sale.id,
        ...(doc.type === 'invoice' && status === 'paid' ? { status: 'paid' } : {}),
        ...(doc.type === 'quote' ? { status: 'accepted' } : {}),
      },
    });
    return sale;
  }

  async send(id: string, userId: string, businessId: string | null, pdfBase64: string, phone?: string) {
    const doc = await this.find(id, userId, businessId);
    const biz = businessId ? await this.prisma.business.findUnique({ where: { id: businessId }, select: { country: true } }) : null;
    const to = toInternationalPhone(phone || doc.customerPhone || '', biz?.country ?? 'CD');
    if (!to) throw new BadRequestException('Numéro WhatsApp du client manquant ou invalide.');
    await this.whatsapp.sendDocument(userId, businessId, to, Buffer.from(pdfBase64, 'base64'), `${doc.number}.pdf`, 'application/pdf');
    if (doc.type === 'quote' && doc.status === 'draft') {
      await this.prisma.commercialDocument.update({ where: { id: doc.id }, data: { status: 'sent' } });
    }
    return { success: true };
  }
}
