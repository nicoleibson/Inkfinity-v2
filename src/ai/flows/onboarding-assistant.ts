
// src/ai/flows/onboarding-assistant.ts
'use server';
/**
 * @fileOverview Provides a function to generate onboarding content (bio, avatar) for new users via an AI agent.
 *
 * - generateOnboardingContent - A function that generates a professional bio and avatar for new users.
 * - GenerateOnboardingContentInput - The input type for the generateOnboardingContent function.
 * - GenerateOnboardingContentOutput - The return type for the generateOnboardingContent function.
 */
import { generateOnboardingContentFlow } from '@/ai/agents/onboarding-assistant-agent';
import { GenerateOnboardingContentInput, GenerateOnboardingContentOutput } from '@/ai/schemas/onboarding-assistant-schema';

export async function generateOnboardingContent(input: GenerateOnboardingContentInput): Promise<GenerateOnboardingContentOutput> {
  const result = await generateOnboardingContentFlow(input);
  // We explicitly create a new, plain object here to ensure that no complex, non-serializable
  // properties from the Genkit flow's return value are passed to the client.
  // This prevents serialization errors with Next.js Server Actions.
  return {
    bio: result.bio,
  };
}
