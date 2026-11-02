import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, type Product } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lockProducts, reservedByProduct } from '../movements/stock-rules';
import { CreateProductDto, CreateVariantsDto } from './dto/create-product.dto';

const clean = (s: string | null | undefined): string | null => s?.replace(/\s+/g, ' ').trim() || null;
const variantName = (group: string, label: string) => `${group} — ${label}`;

// Keeps only usable tiers, sorted by quantity; none left → no volume pricing.
const cleanTiers = (tiers: { minQty: number; unitPrice: number }[] | null | undefined) => {
  const ok = (tiers ?? [])
    .map(t => ({ minQty: Number(t.minQty), unitPrice: Number(t.unitPrice) }))
    .filter(t => t.minQty > 0 && t.unitPrice > 0)
    .sort((a, b) => a.minQty - b.minQty);
  return ok.length ? ok : null;
};

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    return this.prisma.product.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateProductDto, userId: string, businessId?: string) {
    let sku = dto.sku?.trim() || '';
    if (!sku) {
      let attempts = 0;
      do {
        sku = 'PRD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        const exists = await this.prisma.product.findFirst({ where: { userId, sku } });
        if (!exists) break;
      } while (++attempts < 10);
    }

    const group = clean(dto.variantGroup);
    const label = clean(dto.variantLabel);
    const product = await this.prisma.product.create({
      data: {
        name: group && label ? variantName(group, label) : dto.name,
        variantGroup: group && label ? group : null,
        variantLabel: group && label ? label : null,
        sku,
        category: dto.category ?? '',
        quantity: dto.quantity,
        alertThreshold: dto.alertThreshold,
        supplier: dto.supplier ?? '',
        acquisitionCost: dto.acquisitionCost,
        sellingPrice: dto.sellingPrice ?? 0,
        imageUrl: dto.imageUrl ?? null,
        entryDate: new Date(dto.entryDate),
        trackStock: dto.trackStock ?? true,
        durationMinutes: dto.durationMinutes ?? null,
        priceTiers: cleanTiers(dto.priceTiers) ?? undefined,
        userId,
        ...(businessId ? { businessId } : {}),
      },
    });

    if (dto.quantity > 0 && (dto.trackStock ?? true)) {
      await this.prisma.stockMovement.create({
        data: {
          productId: product.id,
          type: 'in',
          kind: 'initial',
          unitCost: dto.acquisitionCost || null,
          quantity: dto.quantity,
          reason: 'Stock initial',
          date: new Date(dto.entryDate),
          userId,
          ...(businessId ? { businessId } : {}),
        },
      });
    }

    return product;
  }

  async update(id: string, dto: Partial<CreateProductDto>, userId: string, businessId?: string) {
    const existing = await this.findOneOrFail(id, userId, businessId);

    // A variant's name is always derived from its model + label, never typed freely.
    const group = dto.variantGroup !== undefined ? clean(dto.variantGroup) : existing.variantGroup;
    const label = dto.variantLabel !== undefined ? clean(dto.variantLabel) : existing.variantLabel;
    const name = group && label ? variantName(group, label) : dto.name;

    // Once a product tracks stock, these only change through stock movements. The alert
    // threshold stays editable: it is a setting, not stock data.
    const stockLocked = existing.trackStock && dto.trackStock !== false;
    if (stockLocked) {
      delete dto.quantity;
      delete dto.acquisitionCost;
      delete dto.entryDate;
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(dto.variantGroup !== undefined && { variantGroup: group }),
        ...(dto.variantLabel !== undefined && { variantLabel: label }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.alertThreshold !== undefined && { alertThreshold: dto.alertThreshold }),
        ...(dto.supplier !== undefined && { supplier: dto.supplier }),
        ...(dto.acquisitionCost !== undefined && { acquisitionCost: dto.acquisitionCost }),
        ...(dto.sellingPrice !== undefined && { sellingPrice: dto.sellingPrice }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.entryDate !== undefined && { entryDate: new Date(dto.entryDate) }),
        ...(dto.trackStock !== undefined && { trackStock: dto.trackStock }),
        ...(dto.durationMinutes !== undefined && { durationMinutes: dto.durationMinutes }),
        ...(dto.priceTiers !== undefined && { priceTiers: cleanTiers(dto.priceTiers) ?? Prisma.DbNull }),
      },
    });

    const tracksStock = dto.trackStock !== undefined ? dto.trackStock : (existing as any).trackStock ?? true;
    if (dto.quantity !== undefined && dto.quantity !== existing.quantity && tracksStock) {
      const delta = dto.quantity - existing.quantity;
      if (delta !== 0) {
        await this.prisma.stockMovement.create({
          data: {
            productId: id,
            type: delta > 0 ? 'in' : 'out',
            kind: 'inventory',
            quantity: Math.abs(delta),
            reason: 'Ajustement manuel',
            date: new Date(),
            userId,
            ...(businessId ? { businessId } : {}),
          },
        });
      }
    }

    return updated;
  }

  // Creates a model's variants in one go. Labels the model already has are skipped,
  // so "add sizes to an existing model" is the same call.
  async createVariants(dto: CreateVariantsDto, userId: string, businessId?: string) {
    const group = clean(dto.group);
    if (!group) throw new BadRequestException('Le nom du modèle est requis.');
    const where = businessId ? { businessId } : { userId };
    const existing = await this.prisma.product.findMany({
      where: { ...where, variantGroup: group },
      select: { variantLabel: true },
    });
    const taken = new Set(existing.map(p => p.variantLabel?.toLowerCase()));
    const labels = [...new Set(dto.labels.map(l => clean(l)).filter((l): l is string => !!l))]
      .filter(l => !taken.has(l.toLowerCase()));
    if (labels.length === 0) throw new BadRequestException('Ces variantes existent déjà.');

    // One base SKU for the model, one suffix per variant — readable on a label printer.
    const base = 'PRD-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const created: Awaited<ReturnType<ProductsService['create']>>[] = [];
    for (const label of labels) {
      const suffix = label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '').toUpperCase().slice(0, 8) || String(created.length + 1);
      created.push(await this.create({
        name: variantName(group, label),
        variantGroup: group,
        variantLabel: label,
        sku: `${base}-${suffix}`,
        category: dto.category ?? '',
        quantity: Math.max(0, Number(dto.quantities?.[label] ?? 0)),
        alertThreshold: dto.alertThreshold,
        supplier: dto.supplier ?? '',
        acquisitionCost: dto.acquisitionCost,
        sellingPrice: Number(dto.prices?.[label] ?? dto.sellingPrice ?? 0),
        imageUrl: dto.imageUrl,
        entryDate: dto.entryDate,
        trackStock: dto.trackStock ?? true,
      }, userId, businessId));
    }
    return created;
  }

  // Renaming a model renames every one of its variants.
  async renameVariantGroup(from: string, to: string, userId: string, businessId?: string) {
    const target = clean(to);
    if (!target) throw new BadRequestException('Le nom du modèle est requis.');
    const where = businessId ? { businessId } : { userId };
    const variants = await this.prisma.product.findMany({ where: { ...where, variantGroup: from } });
    return Promise.all(variants.map(v => this.prisma.product.update({
      where: { id: v.id },
      data: { variantGroup: target, name: variantName(target, v.variantLabel ?? '') },
    })));
  }

  async remove(id: string, userId: string, businessId?: string) {
    await this.findOneOrFail(id, userId, businessId);
    await this.prisma.product.delete({ where: { id } });
    return { id };
  }

  /** Units promised to pending sales, per product (see reservedByProduct). */
  async reservations(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    return Object.fromEntries(await reservedByProduct(this.prisma, where));
  }

  async reconcile(userId: string, businessId?: string) {
    const where = businessId ? { businessId } : { userId };
    const products = await this.prisma.product.findMany({ where });

    // Reasons auto-generated by the sales engine — excluded from manual movements
    // so we don't double-count with the SaleItem direct query below
    const SALE_REASONS = [
      'Vente', 'Vente confirmée',
      'Retour — vente annulée', 'Retour — vente suspendue', 'Retour — vente supprimée',
    ];

    const net = (movements: { type: string; quantity: number }[]) =>
      movements.reduce((acc, m) => (m.type === 'in' ? acc + m.quantity : acc - m.quantity), 0);

    let fixedCount = 0;
    const updated: Product[] = [];

    // One at a time, each locked: a sale landing mid-recount would otherwise be overwritten.
    for (const { id } of products.filter(p => p.trackStock)) {
      updated.push(await this.prisma.$transaction(async tx => {
        const [product] = await lockProducts(tx, [id]);

        // The last physical count is the truth at its date. Everything since then wrote its
        // movement, so old sales and old drift no longer matter.
        const count = await tx.stockMovement.findFirst({
          where: { productId: id, kind: 'inventory', countedQuantity: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { countedQuantity: true, createdAt: true },
        });

        let computed: number;
        if (count) {
          const since = await tx.stockMovement.findMany({
            where: { productId: id, createdAt: { gt: count.createdAt } },
            select: { type: true, quantity: true },
          });
          computed = count.countedQuantity! + net(since);
        } else {
          // 1. Manual stock movements (stock initial, restocks, manual adjustments)
          //    Filter by productId only — businessId is null on old records
          const movements = await tx.stockMovement.findMany({
            where: {
              productId: id,
              // Delivered orders also record a sale, counted in step 2; a return cancels it.
              NOT: [
                { reason: { in: SALE_REASONS } },
                { reason: { startsWith: 'Commande #' } },
                { reason: { startsWith: 'Retour — commande #' } },
              ],
            },
            select: { type: true, quantity: true },
          });

          // 2. All sale items whose stock has left (paid or credit) — source of truth for
          //    deductions. Covers old sales that never created a StockMovement record.
          const paidItems = await tx.saleItem.findMany({
            where: { productId: id, sale: { status: { in: ['paid', 'credit'] } } },
            select: { quantity: true },
          });

          computed = net(movements) - paidItems.reduce((acc, i) => acc + i.quantity, 0);
        }

        const quantity = Math.max(0, computed);

        if (Math.abs(quantity - product.quantity) < 0.001) return product;

        fixedCount++;
        return tx.product.update({ where: { id }, data: { quantity } });
      }));
    }

    return { products: updated, fixedCount };
  }

  private async findOneOrFail(id: string, userId: string, businessId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produit introuvable');
    if (businessId && product.businessId && product.businessId !== businessId) {
      throw new NotFoundException('Produit introuvable');
    }
    if (!businessId && product.userId !== userId) throw new NotFoundException('Produit introuvable');
    return product;
  }
}
