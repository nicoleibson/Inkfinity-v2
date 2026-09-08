// src/ai/schemas/get-crypto-price-schema.ts
import { z } from 'genkit';

export const GetCryptoPriceInputSchema = z.object({
  cryptoSymbol: z.string().describe("The symbol of the cryptocurrency (e.g., 'ETH')."),
});
export type GetCryptoPriceInput = z.infer<typeof GetCryptoPriceInputSchema>;

export const GetCryptoPriceOutputSchema = z.object({
  priceUsd: z.number().describe("The price of the cryptocurrency in USD."),
});
export type GetCryptoPriceOutput = z.infer<typeof GetCryptoPriceOutputSchema>;
