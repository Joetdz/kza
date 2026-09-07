import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PrismaService } from '../prisma/prisma.service';

// Cache business resolution to avoid 1-2 DB queries per request (pool limit is 5)
type Resolved = { businessId: string; ownerId: string; role: 'owner' | 'manager' | 'operator' };
const bizCache = new Map<string, { value: Resolved; ts: number }>();
const BIZ_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/** Drop cached resolutions for a business — call when its membership changes. */
export function invalidateBusinessAccessCache(businessId?: string): void {
  if (!businessId) { bizCache.clear(); return; }
  for (const [key, entry] of bizCache) {
    if (entry.value.businessId === businessId) bizCache.delete(key);
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly JWKS: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    config: ConfigService,
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    this.JWKS = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user: unknown }>();
    const headers = request.headers as unknown as Record<string, string>;

    // Internal endpoints authenticated by secret + userId headers
    const devSecret = process.env.INTERNAL_SYNC_SECRET;
    const devUserId = headers['x-dev-userid'];
    if (devSecret && devUserId && headers['x-dev-secret'] === devSecret) {
      const r = await this.resolveAccess(devUserId, headers['x-business-id']);
      request.user = { id: devUserId, email: 'internal', ...r };
      return true;
    }

    const auth = headers['authorization'];
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();

    const token = auth.slice(7);
    try {
      const { payload } = await jwtVerify(token, this.JWKS);
      if (!payload.sub) throw new Error('No sub in token');
      const userId = payload.sub;
      const r = await this.resolveAccess(userId, headers['x-business-id']);
      request.user = { id: userId, email: payload['email'] as string ?? '', ...r };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  /**
   * Resolve which business this request acts on and with what rights.
   * A user reaches a business either by owning it or by holding a membership on it;
   * `ownerId` is the account whose data the business holds, so an invited member
   * reads exactly what the owner reads.
   */
  private async resolveAccess(userId: string, headerBizId?: string): Promise<Resolved> {
    const cacheKey = `${userId}:${headerBizId ?? ''}`;
    const hit = bizCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < BIZ_CACHE_TTL) return hit.value;

    const empty: Resolved = { businessId: '', ownerId: userId, role: 'owner' };
    let result: Resolved | null = null;

    if (headerBizId) {
      const owned = await this.prisma.business.findFirst({
        where: { id: headerBizId, userId },
        select: { id: true },
      });
      if (owned) {
        result = { businessId: owned.id, ownerId: userId, role: 'owner' };
      } else {
        const membership = await this.prisma.businessMember.findFirst({
          where: { businessId: headerBizId, userId },
          select: { role: true, business: { select: { id: true, userId: true } } },
        });
        if (membership?.business) {
          result = {
            businessId: membership.business.id,
            ownerId: membership.business.userId,
            role: membership.role === 'manager' ? 'manager' : 'operator',
          };
        }
      }
    }

    // No usable header — fall back to the user's own default business, then to any
    // business they were invited to.
    if (!result) {
      const def = await this.prisma.business.findFirst({
        where: { userId, isDefault: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (def) result = { businessId: def.id, ownerId: userId, role: 'owner' };
    }

    if (!result) {
      const first = await this.prisma.business.findFirst({
        where: { userId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (first) result = { businessId: first.id, ownerId: userId, role: 'owner' };
    }

    if (!result) {
      const membership = await this.prisma.businessMember.findFirst({
        where: { userId },
        select: { role: true, business: { select: { id: true, userId: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (membership?.business) {
        result = {
          businessId: membership.business.id,
          ownerId: membership.business.userId,
          role: membership.role === 'manager' ? 'manager' : 'operator',
        };
      }
    }

    const value = result ?? empty;
    bizCache.set(cacheKey, { value, ts: Date.now() });
    return value;
  }
}
