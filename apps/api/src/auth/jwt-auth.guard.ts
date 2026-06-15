import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PrismaService } from '../prisma/prisma.service';

// Cache businessId lookups to avoid 1-2 DB queries per request (pool limit is 5)
const bizCache = new Map<string, { id: string; ts: number }>();
const BIZ_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
      const biz = await this.resolveBusinessId(devUserId, headers['x-business-id']);
      request.user = { id: devUserId, email: 'internal', businessId: biz };
      return true;
    }

    const auth = headers['authorization'];
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();

    const token = auth.slice(7);
    try {
      const { payload } = await jwtVerify(token, this.JWKS);
      if (!payload.sub) throw new Error('No sub in token');
      const userId = payload.sub;
      const businessId = await this.resolveBusinessId(userId, headers['x-business-id']);
      request.user = { id: userId, email: payload['email'] as string ?? '', businessId };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async resolveBusinessId(userId: string, headerBizId?: string): Promise<string> {
    const cacheKey = `${userId}:${headerBizId ?? ''}`;
    const hit = bizCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < BIZ_CACHE_TTL) return hit.id;

    let result = '';

    if (headerBizId) {
      const biz = await this.prisma.business.findFirst({
        where: { id: headerBizId, userId },
        select: { id: true },
      });
      if (biz) result = biz.id;
    }

    if (!result) {
      const def = await this.prisma.business.findFirst({
        where: { userId, isDefault: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (def) result = def.id;
    }

    bizCache.set(cacheKey, { id: result, ts: Date.now() });
    return result;
  }
}
