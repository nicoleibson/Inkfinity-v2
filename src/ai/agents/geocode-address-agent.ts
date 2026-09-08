'use server';
/**
 * @fileOverview Defines the AI agent for reverse geocoding using Gemini 2.5 Flash-Lite.
 */

import { ai } from '@/ai/genkit';
import { GeocodeAddressInputSchema, GeocodeAddressOutputSchema } from '@/ai/schemas/geocode-address-schema';

const reverseGeocodePrompt = ai.definePrompt({
  name: 'reverseGeocodePrompt',
  model: 'googleai/gemini-3.5-flash-lite',
  input: { schema: GeocodeAddressInputSchema },
  output: { schema: GeocodeAddressOutputSchema },
  prompt: `You are a reverse geocoding assistant. Given a latitude and longitude, return a formatted city-level address (e.g., "City, State, Country" or "City, Country").

  Latitude: {{{lat}}}
  Longitude: {{{lng}}}

  Your response must be a valid JSON object with an 'address' field.
  `,
});


export const geocodeAddressFlow = ai.defineFlow(
  {
    name: 'geocodeAddressFlow',
    inputSchema: GeocodeAddressInputSchema,
    outputSchema: GeocodeAddressOutputSchema,
  },
  async (input) => {
    const {output} = await reverseGeocodePrompt(input);
    return output!;
  }
);
