import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly JWKS: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    this.JWKS = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: unknown }>();
    const headers = request.headers as unknown as Record<string, string>;

    // Allow internal endpoints authenticated by secret + userId headers
    const devSecret = process.env.INTERNAL_SYNC_SECRET;
    const devUserId = headers['x-dev-userid'];
    if (devSecret && devUserId && headers['x-dev-secret'] === devSecret) {
      request.user = { id: devUserId, email: 'internal' };
      return true;
    }

    const auth = headers['authorization'];
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException();

    const token = auth.slice(7);
    try {
      const { payload } = await jwtVerify(token, this.JWKS);
      if (!payload.sub) throw new Error('No sub in token');
      request.user = { id: payload.sub, email: payload['email'] as string ?? '' };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
