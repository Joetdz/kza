import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type BusinessRole = 'owner' | 'manager' | 'operator';

export interface AuthUser {
  /** Supabase id of the person making the request — use for authorship, never for data scoping. */
  id: string;
  email: string;
  /** Business the request is scoped to. */
  businessId: string;
  /**
   * Who owns the data of that business. Equals `id` for the owner; for an invited
   * member it points at the owner, so both see the same records. Scope data by this.
   */
  ownerId: string;
  role: BusinessRole;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);
