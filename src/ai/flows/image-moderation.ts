// src/ai/flows/image-moderation.ts
'use server';

/**
 * @fileOverview Provides a function to moderate images for inappropriate content using an AI agent.
 *
 * - moderateImage - A function that moderates an image.
 * - ModerateImageInput - The input type for the moderateImage function.
 * - ModerateImageOutput - The return type for the moderateImage function.
 */

import { moderateImageFlow } from '@/ai/agents/image-moderation-agent';
import { ModerateImageInput, ModerateImageOutput } from '@/ai/schemas/image-moderation-schema';

export async function moderateImage(input: ModerateImageInput): Promise<ModerateImageOutput> {
  return moderateImageFlow(input);
}
