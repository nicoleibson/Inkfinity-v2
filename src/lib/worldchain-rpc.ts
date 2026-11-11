/**
 * Single source of truth for the World Chain mainnet RPC URL.
 *
 * `RPC_WORLDCHAIN_URL` is the canonical name used across the app. Two aliases
 * are still honoured so older deployments (and the public Mini App bundle) keep
 * working instead of silently dropping to the rate-limited public endpoint:
 *
 *   RPC_WORLDCHAIN_URL           canonical
 *   WORLDCHAIN_RPC_URL           legacy alias (used by the referral payouts)
 *   NEXT_PUBLIC_WORLDCHAIN_RPC_URL  public alias exposed to the client bundle
 *
 * Not marked `server-only`: `lib/nft-verification.ts` may be imported from
 * client components, where only the `NEXT_PUBLIC_` alias is defined.
 */
export const PUBLIC_WORLDCHAIN_RPC = 'https://worldchain-mainnet.g.alchemy.com/public';

export function getWorldChainRpcUrl(): string {
  const candidates = [
    process.env.RPC_WORLDCHAIN_URL,
    process.env.WORLDCHAIN_RPC_URL,
    process.env.NEXT_PUBLIC_WORLDCHAIN_RPC_URL,
  ];

  for (const candidate of candidates) {
    const url = (candidate || '').trim();
    if (url) return url;
  }

  return PUBLIC_WORLDCHAIN_RPC;
}
