import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

// Utilisé par FundraisingService quand le propriétaire ajoute un investisseur —
// crée le compte de connexion s'il n'existe pas encore pour cet email. Le reste
// de l'auth investisseur (login, portail) vit dans InvestorPortalController,
// à plat, comme partner-portal.controller.ts.
@Injectable()
export class InvestorsService {
  constructor(private prisma: PrismaService) {}

  async findOrCreateInvestor(email: string, name: string, phone: string | undefined, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.prisma.investor.findUnique({ where: { email: normalizedEmail } });
    if (existing) return existing;

    if (!password || password.length < 6) {
      throw new BadRequestException('Un mot de passe (6 caractères minimum) est requis pour créer le compte de ce nouvel investisseur');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      return await this.prisma.investor.create({ data: { email: normalizedEmail, name, phone, passwordHash } });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Un investisseur avec cet email existe déjà');
      throw e;
    }
  }
}
