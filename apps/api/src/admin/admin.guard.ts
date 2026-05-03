import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guard that restricts access to admin users only.
 * Set the ADMIN_EMAILS env variable with a comma-separated list of authorised emails.
 * Example: ADMIN_EMAILS=you@example.com,other@example.com
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as { id: string; email: string } | undefined;
    if (!user?.email) throw new ForbiddenException('Not authenticated');

    const adminEmails = (this.config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    if (!adminEmails.includes(user.email.toLowerCase())) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
