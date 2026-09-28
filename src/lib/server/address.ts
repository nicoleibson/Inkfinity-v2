/**
 * Address comparison helpers.
 *
 * Every payment is attributed by comparing the address that actually sent the
 * transfer on-chain against an address we recorded server-side. These comparisons
 * are only ever safe in EIP-55 checksum or lowercase form, never by string
 * equality, so they are centralised here.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isValidAddress(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS_RE.test(value.trim());
}

export function isSameAddress(a: unknown, b: unknown): boolean {
  if (!isValidAddress(a) || !isValidAddress(b)) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Normalises a list of recorded addresses into a lowercase set for cheap lookup,
 * dropping anything that is not a valid address.
 */
export function addressSet(values: unknown[]): Set<string> {
  const set = new Set<string>();
  for (const value of values) {
    if (isValidAddress(value)) set.add(value.trim().toLowerCase());
  }
  return set;
}
