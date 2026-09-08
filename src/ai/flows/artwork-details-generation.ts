// src/ai/flows/artwork-details-generation.ts
'use server';

/**
 * @fileOverview Provides a function to generate artwork details using an AI agent.
 *
 * - generateArtworkDetails - A function that generates artwork details.
 * - ArtworkDetailsInput - The input type for the generateArtworkDetails function.
 * - ArtworkDetailsOutput - The return type for the generateArtworkDetails function.
 */

import { artworkDetailsGenerationFlow } from '@/ai/agents/artwork-details-generation-agent';
import { ArtworkDetailsInput, ArtworkDetailsOutput } from '@/ai/schemas/artwork-details-generation';


export async function generateArtworkDetails(
  input: ArtworkDetailsInput
): Promise<ArtworkDetailsOutput> {
  return artworkDetailsGenerationFlow(input);
}
