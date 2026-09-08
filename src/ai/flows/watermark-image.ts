
'use server';
/**
 * @fileOverview Provides a function to apply a watermark to an image using an AI agent.
 *
 * - watermarkImage - A function that adds a watermark to an image.
 * - WatermarkImageInput - The input type for the watermarkImage function.
 * - WatermarkImageOutput - The return type for the watermarkImage function.
 */

import { watermarkImageFlow } from '@/ai/agents/watermark-image-agent';
import { WatermarkImageInput, WatermarkImageOutput } from '@/ai/schemas/watermark-image-schema';


export async function watermarkImage(input: WatermarkImageInput): Promise<WatermarkImageOutput> {
  return watermarkImageFlow(input);
}
