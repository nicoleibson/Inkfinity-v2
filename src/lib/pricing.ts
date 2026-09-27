/**
 * Shared crypto price lookup used by BOTH the client (to quote a booking deposit) and
 * the server (`/api/verify-booking-payment`, to bound what a valid deposit transfer is).
 *
 * Both sides must agree on the price, otherwise a legitimate payment could be rejected.
 * The old flow used a hardcoded mock (3500 USD) returned by the Genkit
 * `get-crypto-price` flow, which also priced WLD payments with the ETH price. That is
 * replaced here by a real quote.
 *
 * Configuration (server-side env):
 *   PRICE_API_BASE_URL  Optional. Defaults to the CoinGecko simple price endpoint.
 *   ALLOW_MOCK_PRICES   Set to "true" to allow the legacy hardcoded 3500 USD fallback.
 *                       Intended for local development only; in production the server
 *                       fails closed when no price is available, because it cannot
 *                       bound the amount of a deposit transfer without one.
 */

export type TokenSymbol = 'WLD' | 'ETH';

const COINGECKO_IDS: Record<TokenSymbol, string> = {
  WLD: 'worldcoin-wld',
  ETH: 'ethereum',
};

const DEFAULT_PRICE_API_BASE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_TTL_MS = 30_000;
const MOCK_PRICE_USD = 3500;

/** WorldChain settles in its native token WLD; Polygon in ETH. */
export function tokenSymbolForNetwork(network: string | undefined | null): TokenSymbol {
  return network === 'worldchain' || network === 'worldchainSepolia' ? 'WLD' : 'ETH';
}

function allowMockPrices(): boolean {
  return (process.env.ALLOW_MOCK_PRICES || '').toString().toLowerCase() === 'true';
}

let cache: { symbol: TokenSymbol; price: number; at: number } | null = null;

/**
 * Returns the USD price of `symbol`, or null when it cannot be determined.
 * Never throws, so callers must handle null explicitly (server: fail closed).
 */
export async function getTokenPriceUsd(symbol: TokenSymbol): Promise<number | null> {
  if (cache && cache.symbol === symbol && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.price;
  }

  const base = (process.env.PRICE_API_BASE_URL || DEFAULT_PRICE_API_BASE_URL).replace(/\/$/, '');
  const id = COINGECKO_IDS[symbol];

  try {
    const res = await fetch(`${base}?ids=${id}&vs_currencies=usd`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number }>;
    const price = json?.[id]?.usd;
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      throw new Error('malformed response');
    }
    cache = { symbol, price, at: Date.now() };
    return price;
  } catch {
    if (allowMockPrices()) return MOCK_PRICE_USD;
    return null;
  }
}

/**
 * Minimum on-chain amount (in wei) that counts as a valid settlement of a USD amount.
 *
 * A tolerance is required because the price moves between the moment the client quotes
 * the deposit and the moment the transfer is mined; without it, honest payments would be
 * rejected. 10% keeps the bound meaningful (a 1-wei dust transfer is still worthless)
 * while absorbing normal price movement.
 */
export const DEPOSIT_PRICE_TOLERANCE = 0.9;

export function usdToWeiFloor(usdAmount: number, priceUsd: number): bigint {
  const tokenAmount = (usdAmount * DEPOSIT_PRICE_TOLERANCE) / priceUsd;
  // 18 decimals for both WLD and ETH.
  const wei = BigInt(Math.floor(tokenAmount * 1e18));
  return wei > BigInt(0) ? wei : BigInt(1);
}
