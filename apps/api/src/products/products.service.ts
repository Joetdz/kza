import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.product.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateProductDto, userId: string) {
    let sku = dto.sku?.trim() || '';
    if (!sku) {
      let attempts = 0;
      do {
        sku = 'PRD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        const exists = await this.prisma.product.findFirst({ where: { userId, sku } });
        if (!exists) break;
      } while (++attempts < 10);
    }

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        sku,
        category: dto.category ?? '',
        quantity: dto.quantity,
        alertThreshold: dto.alertThreshold,
        supplier: dto.supplier ?? '',
        acquisitionCost: dto.acquisitionCost,
        sellingPrice: dto.sellingPrice ?? 0,
        imageUrl: dto.imageUrl ?? null,
        entryDate: new Date(dto.entryDate),
        userId,
      },
    });

    // Créer un mouvement initial si quantité > 0
    if (dto.quantity > 0) {
      await this.prisma.stockMovement.create({
        data: {
          productId: product.id,
          type: 'in',
          quantity: dto.quantity,
          reason: 'Stock initial',
          date: new Date(dto.entryDate),
          userId,
        },
      });
    }

    return product;
  }

  async update(id: string, dto: Partial<CreateProductDto>, userId: string) {
    const existing = await this.findOneOrFail(id, userId);

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
        ...(dto.alertThreshold !== undefined && { alertThreshold: dto.alertThreshold }),
        ...(dto.supplier !== undefined && { supplier: dto.supplier }),
        ...(dto.acquisitionCost !== undefined && { acquisitionCost: dto.acquisitionCost }),
        ...(dto.sellingPrice !== undefined && { sellingPrice: dto.sellingPrice }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.entryDate !== undefined && { entryDate: new Date(dto.entryDate) }),
      },
    });

    // Si la quantité est modifiée manuellement, créer un mouvement d'ajustement
    if (dto.quantity !== undefined && dto.quantity !== existing.quantity) {
      const delta = dto.quantity - existing.quantity;
      if (delta !== 0) {
        await this.prisma.stockMovement.create({
          data: {
            productId: id,
            type: delta > 0 ? 'in' : 'out',
            quantity: Math.abs(delta),
            reason: 'Ajustement manuel',
            date: new Date(),
            userId,
          },
        });
      }
    }

    return updated;
  }

  async remove(id: string, userId: string) {
    await this.findOneOrFail(id, userId);
    await this.prisma.product.delete({ where: { id } });
    return { id };
  }

  private async findOneOrFail(id: string, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || product.userId !== userId) throw new NotFoundException('Produit introuvable');
    return product;
  }
}
