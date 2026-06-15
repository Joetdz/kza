import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'joeltondozi@gmail.com';

const SEED_CATEGORIES = [
  'Vêtements & Chaussures',
  'Maroquinerie & Accessoires',
  'Beauté & Cosmétiques',
  'Alimentation & Boissons',
  'Électronique & High-Tech',
  'Téléphonie & Accessoires',
  'Mobilier & Décoration',
  'Santé & Pharmacie',
  'Sports & Loisirs',
  'Auto & Moto',
  'Services & Prestations',
  'Matériaux & Construction',
  'Livres & Papeterie',
  'Jouets & Enfants',
  'Autre',
];

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Controller('categories')
export class CategoriesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  getAll() {
    return this.prisma.productCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  @Get('all')
  getAllIncludingInactive(@CurrentUser() user: AuthUser) {
    if (user.email !== ADMIN_EMAIL) throw new ForbiddenException();
    return this.prisma.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  @Post('seed')
  async seed(@CurrentUser() user: AuthUser) {
    if (user.email !== ADMIN_EMAIL) throw new ForbiddenException();
    const count = await this.prisma.productCategory.count();
    if (count > 0) return { skipped: true, count };

    await this.prisma.productCategory.createMany({
      data: SEED_CATEGORIES.map((name, i) => ({
        name,
        slug: toSlug(name),
        sortOrder: i,
      })),
      skipDuplicates: true,
    });
    return { seeded: SEED_CATEGORIES.length };
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: { name: string }) {
    if (user.email !== ADMIN_EMAIL) throw new ForbiddenException();
    const name = (body.name ?? '').trim();
    return this.prisma.productCategory.create({
      data: { name, slug: toSlug(name) },
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { name?: string; active?: boolean; sortOrder?: number },
  ) {
    if (user.email !== ADMIN_EMAIL) throw new ForbiddenException();
    return this.prisma.productCategory.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim(), slug: toSlug(body.name) }),
        ...(body.active !== undefined && { active: body.active }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
    });
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (user.email !== ADMIN_EMAIL) throw new ForbiddenException();
    return this.prisma.productCategory.delete({ where: { id } });
  }
}
