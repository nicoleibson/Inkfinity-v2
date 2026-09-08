
'use server';
/**
 * @fileOverview Defines the AI agent for retrieving cryptocurrency prices.
 *
 * This file contains the Genkit flow, tools, and Zod schemas for price lookups.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { GetCryptoPriceInputSchema, GetCryptoPriceOutputSchema } from '@/ai/schemas/get-crypto-price-schema';


const getEthPriceTool = ai.defineTool(
  {
    name: 'getEthPriceTool',
    description: 'Gets the current price of Ethereum (ETH) in USD.',
    inputSchema: z.object({}), // No input needed as it's specific to ETH
    outputSchema: GetCryptoPriceOutputSchema,
  },
  async () => {
    // This is a mock price.
    // A real implementation would use a fetch call to a crypto price API 
    // like CoinGecko or CoinMarketCap.
    return {
      priceUsd: 3500.00,
    };
  }
);


export const getCryptoPriceFlow = ai.defineFlow(
  {
    name: 'getCryptoPriceFlow',
    inputSchema: GetCryptoPriceInputSchema,
    outputSchema: GetCryptoPriceOutputSchema,
  },
  async (input) => {
    // For now, we only support ETH. In the future, this could have more logic.
    if (input.cryptoSymbol.toUpperCase() === 'ETH') {
        return await getEthPriceTool({});
    }
    // Default or throw error if other symbols are not supported.
    return {
        priceUsd: 0,
    }
  }
);
