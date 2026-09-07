import { useStore, type BusinessRole } from '../store/useStore';

/**
 * Role held on the business currently selected.
 *
 * The server enforces this on every request — these flags only decide what the UI
 * bothers to show, so a stale value can never grant access it shouldn't.
 */
export function useRole() {
  const businesses = useStore(s => s.businesses);
  const currentBusinessId = useStore(s => s.currentBusinessId);

  const current = businesses.find(b => b.id === currentBusinessId);
  const role: BusinessRole = current?.role ?? 'owner';

  return {
    role,
    isOwner: role === 'owner',
    /** Owner or manager — everything except team management. */
    canManage: role === 'owner' || role === 'manager',
    /** Sales, expenses, goals, analytics, the AI advisor. */
    canSeeFinances: role === 'owner' || role === 'manager',
    /** Only the owner invites people or removes them. */
    canManageTeam: role === 'owner',
  };
}
