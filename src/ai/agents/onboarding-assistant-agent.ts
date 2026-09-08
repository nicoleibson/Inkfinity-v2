// src/ai/agents/onboarding-assistant-agent.ts
'use server';
/**
 * @fileOverview Defines the AI agent for generating user onboarding content.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { GenerateOnboardingContentInputSchema, GenerateOnboardingContentOutputSchema } from '@/ai/schemas/onboarding-assistant-schema';

const onboardingPrompt = ai.definePrompt({
  name: 'onboardingPrompt',
  model: 'googleai/gemini-3.5-flash-lite',
  input: {schema: GenerateOnboardingContentInputSchema},
  output: {schema: z.object({ 
    bio: z.string().describe('A professional biography for the user.'),
  })},
  prompt: `You are an onboarding assistant for a tattoo artwork platform.

  Based on the user's information, generate a professional biography.

  User First Name: {{{firstName}}}
  User Last Name: {{{lastName}}}
  User Role: {{{role}}}
  Style Preferences: {{{stylePreferences}}}

  Compose a short professional bio (1-2 sentences) that highlights their role and style preferences. Write the bio in the first person.

  Ensure that the output is valid JSON and adheres to the specified schema.
`,
});

export const generateOnboardingContentFlow = ai.defineFlow(
  {
    name: 'generateOnboardingContentFlow',
    inputSchema: GenerateOnboardingContentInputSchema,
    outputSchema: GenerateOnboardingContentOutputSchema,
  },
  async input => {
    const {output} = await onboardingPrompt(input);
    const bioText = output?.bio ?? 'I am a new user.';
    
    return {
      bio: bioText,
    };
  }
);
