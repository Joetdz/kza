import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import type { AuthUser, BusinessRole } from './current-user.decorator';

export const ROLES_KEY = 'businessRoles';

/**
 * Restrict a route to certain business roles.
 *   @Roles('owner')             → team management, deleting the business
 *   @Roles('owner', 'manager')  → finances: sales, expenses, goals, reporting
 * Routes with no decorator are open to every role, operators included.
 */
export const Roles = (...roles: BusinessRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<BusinessRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    // No user means the route is public (JwtAuthGuard let it through) — nothing to check.
    if (!user) return true;

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        user.role === 'operator'
          ? "Votre rôle d'opérateur ne donne pas accès à cette section."
          : "Cette action est réservée au propriétaire du business.",
      );
    }
    return true;
  }
}
