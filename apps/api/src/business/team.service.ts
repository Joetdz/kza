import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { invalidateBusinessAccessCache } from '../auth/jwt-auth.guard';

const INVITE_TTL_DAYS = 7;
const ROLES = ['manager', 'operator'] as const;
type MemberRole = (typeof ROLES)[number];

function normalizeRole(role?: string): MemberRole {
  return role === 'manager' ? 'manager' : 'operator';
}

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService) {}

  /** Team management is the owner's alone — never a manager's. */
  private async assertOwner(userId: string, businessId: string) {
    const biz = await this.prisma.business.findFirst({ where: { id: businessId, userId } });
    if (!biz) throw new ForbiddenException('Seul le propriétaire gère son équipe.');
    return biz;
  }

  // ── Membres ────────────────────────────────────────────────────────────────

  async listMembers(userId: string, businessId: string) {
    await this.assertOwner(userId, businessId);

    const [members, invites] = await Promise.all([
      this.prisma.businessMember.findMany({
        where: { businessId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.businessInvite.findMany({
        where: { businessId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      members: members.map(m => ({
        id: m.id,
        userId: m.userId,
        email: m.email,
        displayName: m.displayName,
        role: m.role,
        createdAt: m.createdAt,
      })),
      pendingInvites: invites.map(i => ({
        id: i.id,
        token: i.token,
        role: i.role,
        label: i.label,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    };
  }

  async updateMemberRole(userId: string, businessId: string, memberId: string, role: string) {
    await this.assertOwner(userId, businessId);
    const member = await this.prisma.businessMember.findFirst({ where: { id: memberId, businessId } });
    if (!member) throw new NotFoundException('Membre introuvable');

    const updated = await this.prisma.businessMember.update({
      where: { id: memberId },
      data: { role: normalizeRole(role) },
    });
    invalidateBusinessAccessCache(businessId);
    return updated;
  }

  async removeMember(userId: string, businessId: string, memberId: string) {
    await this.assertOwner(userId, businessId);
    const member = await this.prisma.businessMember.findFirst({ where: { id: memberId, businessId } });
    if (!member) throw new NotFoundException('Membre introuvable');

    await this.prisma.businessMember.delete({ where: { id: memberId } });
    invalidateBusinessAccessCache(businessId);
    return { id: memberId };
  }

  // ── Invitations ────────────────────────────────────────────────────────────

  async createInvite(userId: string, businessId: string, role: string, label?: string) {
    await this.assertOwner(userId, businessId);

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 3600 * 1000);
    const invite = await this.prisma.businessInvite.create({
      data: {
        businessId,
        token: randomBytes(24).toString('base64url'),
        role: normalizeRole(role),
        label: label?.trim() || null,
        createdBy: userId,
        expiresAt,
      },
    });

    return { id: invite.id, token: invite.token, role: invite.role, label: invite.label, expiresAt };
  }

  async revokeInvite(userId: string, businessId: string, inviteId: string) {
    await this.assertOwner(userId, businessId);
    const invite = await this.prisma.businessInvite.findFirst({ where: { id: inviteId, businessId } });
    if (!invite) throw new NotFoundException('Invitation introuvable');

    await this.prisma.businessInvite.update({
      where: { id: inviteId },
      data: { revokedAt: new Date() },
    });
    return { id: inviteId };
  }

  /** Public-ish preview so the invitee sees what they're joining before accepting. */
  async peekInvite(token: string) {
    const invite = await this.prisma.businessInvite.findUnique({
      where: { token },
      include: { business: { select: { name: true, city: true, logoUrl: true } } },
    });
    if (!invite) throw new NotFoundException('Invitation introuvable');

    const status = invite.revokedAt
      ? 'revoked'
      : invite.acceptedAt
        ? 'accepted'
        : invite.expiresAt < new Date()
          ? 'expired'
          : 'pending';

    return {
      status,
      role: invite.role,
      businessName: invite.business.name,
      businessCity: invite.business.city,
      businessLogo: invite.business.logoUrl,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(userId: string, email: string, token: string) {
    const invite = await this.prisma.businessInvite.findUnique({
      where: { token },
      include: { business: { select: { id: true, userId: true, name: true } } },
    });
    if (!invite) throw new NotFoundException('Invitation introuvable');
    if (invite.revokedAt) throw new BadRequestException('Cette invitation a été annulée.');
    if (invite.acceptedAt) throw new BadRequestException('Cette invitation a déjà été utilisée.');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Cette invitation a expiré.');
    if (invite.business.userId === userId) {
      throw new BadRequestException('Vous êtes déjà propriétaire de ce business.');
    }

    const already = await this.prisma.businessMember.findFirst({
      where: { businessId: invite.businessId, userId },
    });
    if (already) {
      await this.prisma.businessInvite.update({
        where: { id: invite.id },
        data: { acceptedBy: userId, acceptedAt: new Date() },
      });
      return { businessId: invite.businessId, businessName: invite.business.name, role: already.role };
    }

    // The invite is single-use: consume it and create the membership together, so a
    // link shared twice can't onboard two people.
    const [, member] = await this.prisma.$transaction([
      this.prisma.businessInvite.update({
        where: { id: invite.id },
        data: { acceptedBy: userId, acceptedAt: new Date() },
      }),
      this.prisma.businessMember.create({
        data: {
          businessId: invite.businessId,
          userId,
          email: email || null,
          role: normalizeRole(invite.role),
        },
      }),
    ]);

    invalidateBusinessAccessCache(invite.businessId);
    return { businessId: invite.businessId, businessName: invite.business.name, role: member.role };
  }
}
