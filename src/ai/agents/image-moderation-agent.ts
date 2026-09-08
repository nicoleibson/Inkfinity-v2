// src/ai/agents/image-moderation-agent.ts
'use server';

/**
 * @fileOverview Defines the AI agent for image moderation using Gemini 2.5 Flash-Lite.
 */

import {ai} from '@/ai/genkit';
import { ModerateImageInputSchema, ModerateImageOutputSchema } from '@/ai/schemas/image-moderation-schema';


const moderateImageFilterPrompt = ai.definePrompt({
  name: 'moderateImageFilterPrompt',
  model: 'googleai/gemini-3.5-flash-lite',
  input: {schema: ModerateImageInputSchema},
  output: {schema: ModerateImageOutputSchema},
  prompt: `You are an AI image moderation expert. Your job is to determine if an image contains inappropriate content. Inappropriate content includes but is not limited to:

*   Nudity
*   Violence
*   Hate speech
*   Illegal activities

Analyze the image provided and determine if it is safe for general audiences. If the image is safe, return isSafe: true. If the image is unsafe, explain why by providing a reason and set isSafe: false.

Image: {{media url=photoDataUri}}`,
});

export const moderateImageFlow = ai.defineFlow(
  {
    name: 'moderateImageFilterFlow',
    inputSchema: ModerateImageInputSchema,
    outputSchema: ModerateImageOutputSchema,
  },
  async input => {
    const {output} = await moderateImageFilterPrompt(input);
    return output!;
  }
);
