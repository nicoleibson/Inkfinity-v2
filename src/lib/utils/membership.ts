import type { UserProfile } from '@/types/user';

type PayingRole = 'Tattoo Artist' | 'Studio' | 'Supply Store';

const PAYING_ROLES: readonly string[] = ['Tattoo Artist', 'Studio', 'Supply Store'];

/**
 * Whether the account holds a currently valid paid annual membership.
 *
 * Facial verification is gated on this, so the check has to fail closed: a lapsed
 * period must not be resurrected by an old `paymentDate` sitting in the profile.
 * `paymentDate` only counts for Studio / Supply Store accounts, which are activated
 * by a one-off registration payment and carry no `trialEndsAt` period.
 */
export function hasActiveMembership(profile: Partial<UserProfile> | null | undefined): boolean {
  if (!profile?.role) return false;

  // Platform operators sit outside the membership scheme.
  if (profile.role === 'Administrator' || profile.role === 'Super-Administrator') return true;

  // Client accounts are free, so facial verification stays unavailable to them.
  if (!PAYING_ROLES.includes(profile.role)) return false;

  if (profile.status !== 'active') return false;

  if (profile.trialEndsAt) {
    const endsAt = new Date(profile.trialEndsAt).getTime();
    if (Number.isNaN(endsAt) || endsAt <= Date.now()) return false;
    return true;
  }

  return PAYING_ROLES.includes(profile.role) && Boolean(profile.paymentDate);
}

export type { PayingRole };