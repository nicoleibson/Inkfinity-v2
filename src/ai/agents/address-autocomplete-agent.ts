'use server';
/**
 * @fileOverview Defines an AI agent for autocompleting addresses using Gemini 2.5 Flash-Lite.
 */

import {ai} from '@/ai/genkit';
import { AutocompleteAddressInputSchema, AutocompleteAddressOutputSchema } from '@/ai/schemas/address-autocomplete-schema';

const prompt = ai.definePrompt({
  name: 'autocompleteAddressPrompt',
  model: 'googleai/gemini-3.5-flash-lite',
  input: {schema: AutocompleteAddressInputSchema},
  output: {schema: AutocompleteAddressOutputSchema},
  prompt: `You are a geocoding assistant. Given a partial address query, return a list of up to 5 potential full address matches with their corresponding latitude and longitude.

  Query: {{{query}}}

  Provide realistic latitude and longitude for each address. Your response must be a valid JSON object.
  `,
});

export const autocompleteAddressAgentFlow = ai.defineFlow(
  {
    name: 'autocompleteAddressAgentFlow',
    inputSchema: AutocompleteAddressInputSchema,
    outputSchema: AutocompleteAddressOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    return output!;
  }
);
