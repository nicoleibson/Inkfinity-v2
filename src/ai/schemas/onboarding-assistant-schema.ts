// src/ai/schemas/onboarding-assistant-schema.ts
import { z } from 'genkit';

export const GenerateOnboardingContentInputSchema = z.object({
  userId: z.string().describe('The ID of the user.'), // Added this line
  firstName: z.string().describe('The first name of the user.'),
  lastName: z.string().describe('The last name of the user.'),
  role: z.string().describe('The role of the user (e.g., Tattoo Artist, Client, Studio, Supply Store).'),
  stylePreferences: z.string().describe('The user\'s style preferences (e.g., Traditional, Neo-Traditional, Illustrative).'),
});
export type GenerateOnboardingContentInput = z.infer<typeof GenerateOnboardingContentInputSchema>;

export const GenerateOnboardingContentOutputSchema = z.object({
  bio: z.string().describe('A professional biography for the user.'),
});
export type GenerateOnboardingContentOutput = z.infer<typeof GenerateOnboardingContentOutputSchema>;
