// src/ai/agents/artwork-details-generation-agent.ts
'use server';

/**
 * @fileOverview Defines the AI agent for generating artwork details using Gemini 2.5 Flash-Lite.
 */

import {ai} from '@/ai/genkit';
import { ArtworkDetailsInputSchema, ArtworkDetailsOutputSchema } from '@/ai/schemas/artwork-details-generation';

const prompt = ai.definePrompt({
  name: 'artworkDetailsGenerationPrompt',
  model: 'googleai/gemini-3.5-flash-lite',
  input: {schema: ArtworkDetailsInputSchema},
  output: {schema: ArtworkDetailsOutputSchema},
  prompt: `You are an expert art curator. Based on the artwork image provided, generate a creative title, a compelling professional description, and an array of 3-5 relevant tags.

Your response must be professional and appropriate for an art marketplace.

Analyze the following artwork:
Image: {{media url=imageDataUri}}
`,
});

export const artworkDetailsGenerationFlow = ai.defineFlow(
  {
    name: 'artworkDetailsGenerationFlow',
    inputSchema: ArtworkDetailsInputSchema,
    outputSchema: ArtworkDetailsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
