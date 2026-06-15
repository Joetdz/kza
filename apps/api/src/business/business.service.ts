import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto, UpdateBusinessDto } from './dto/create-business.dto';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.business.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateBusinessDto) {
    const count = await this.prisma.business.count({ where: { userId } });
    const isFirst = count === 0;

    return this.prisma.business.create({
      data: {
        userId,
        name: dto.name,
        sector: dto.sector,
        country: dto.country ?? 'CD',
        currency: dto.currency ?? 'USD',
        whatsappPhone: dto.whatsappPhone,
        phone: dto.phone,
        city: dto.city,
        logoUrl: dto.logoUrl,
        isDefault: isFirst,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateBusinessDto) {
    await this.assertOwns(userId, id);
    return this.prisma.business.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sector !== undefined && { sector: dto.sector }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.whatsappPhone !== undefined && { whatsappPhone: dto.whatsappPhone }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwns(userId, id);
    const count = await this.prisma.business.count({ where: { userId } });
    if (count <= 1) {
      throw new BadRequestException('Impossible de supprimer le seul business du compte.');
    }
    const biz = await this.prisma.business.findUnique({ where: { id } });
    await this.prisma.business.delete({ where: { id } });
    // If it was the default, promote the oldest remaining
    if (biz?.isDefault) {
      const oldest = await this.prisma.business.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (oldest) {
        await this.prisma.business.update({ where: { id: oldest.id }, data: { isDefault: true } });
      }
    }
    return { id };
  }

  async setDefault(userId: string, id: string) {
    await this.assertOwns(userId, id);
    await this.prisma.business.updateMany({ where: { userId }, data: { isDefault: false } });
    return this.prisma.business.update({ where: { id }, data: { isDefault: true } });
  }

  private async assertOwns(userId: string, id: string) {
    const biz = await this.prisma.business.findFirst({ where: { id, userId } });
    if (!biz) throw new NotFoundException('Business introuvable');
    return biz;
  }
}
