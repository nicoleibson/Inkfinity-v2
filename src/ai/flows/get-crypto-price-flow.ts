
'use server';
/**
 * @fileOverview Provides a function to retrieve cryptocurrency prices using an AI agent.
 *
 * - getCryptoPrice - A function that gets the crypto price.
 * - GetCryptoPriceInput - The input type for the getCryptoPrice function.
 * - GetCryptoPriceOutput - The return type for the getCryptoPrice function.
 */

import { getCryptoPriceFlow } from '@/ai/agents/get-crypto-price-agent';
import { GetCryptoPriceInput, GetCryptoPriceOutput } from '@/ai/schemas/get-crypto-price-schema';

export async function getCryptoPrice(input: GetCryptoPriceInput): Promise<GetCryptoPriceOutput> {
  return getCryptoPriceFlow(input);
}
