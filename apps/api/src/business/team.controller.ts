import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { TeamService } from './team.service';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.guard';
import { Public } from '../auth/public.decorator';

@Controller('businesses')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  // ── Gestion de l'équipe — propriétaire uniquement ──────────────────────────

  @Get(':id/team')
  @Roles('owner')
  listMembers(@CurrentUser() user: AuthUser, @Param('id') businessId: string) {
    return this.team.listMembers(user.id, businessId);
  }

  @Post(':id/team/invites')
  @Roles('owner')
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param('id') businessId: string,
    @Body() body: { role?: string; label?: string },
  ) {
    return this.team.createInvite(user.id, businessId, body.role ?? 'operator', body.label);
  }

  @Delete(':id/team/invites/:inviteId')
  @Roles('owner')
  revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param('id') businessId: string,
    @Param('inviteId') inviteId: string,
  ) {
    return this.team.revokeInvite(user.id, businessId, inviteId);
  }

  @Patch(':id/team/members/:memberId')
  @Roles('owner')
  updateMemberRole(
    @CurrentUser() user: AuthUser,
    @Param('id') businessId: string,
    @Param('memberId') memberId: string,
    @Body() body: { role: string },
  ) {
    return this.team.updateMemberRole(user.id, businessId, memberId, body.role);
  }

  @Delete(':id/team/members/:memberId')
  @Roles('owner')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') businessId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.team.removeMember(user.id, businessId, memberId);
  }
}

// Invitation side.
@Controller('invites')
export class InviteController {
  constructor(private readonly team: TeamService) {}

  // Public — whoever opens the link previews it before they even have an account,
  // so this must not require a session. JwtAuthGuard skips auth entirely for it,
  // meaning request.user is never populated here even if a token is attached.
  @Get()
  @Public()
  peek(@Query('token') token: string) {
    return this.team.peekInvite(token);
  }

  @Post('accept')
  accept(@CurrentUser() user: AuthUser, @Body() body: { token: string }) {
    return this.team.acceptInvite(user.id, user.email, body.token);
  }
}
