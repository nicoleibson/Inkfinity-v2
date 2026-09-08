// src/ai/agents/watermark-image-agent.ts
'use server';
/**
 * @fileOverview Defines the AI agent for applying a watermark to an image using Nano Banana.
 */

import {ai} from '@/ai/genkit';
import { WatermarkImageInputSchema, WatermarkImageOutputSchema } from '@/ai/schemas/watermark-image-schema';


export const watermarkImageFlow = ai.defineFlow(
  {
    name: 'watermarkImageFlow',
    inputSchema: WatermarkImageInputSchema,
    outputSchema: WatermarkImageOutputSchema,
  },
  async ({imageDataUri}) => {
    let watermarkedImageDataUri = imageDataUri; // Fallback to original
    try {
      const {media} = await ai.generate({
        model: 'googleai/gemini-3.1-flash-lite-image',
        prompt: [
          {media: {url: imageDataUri}},
          {text: 'Subtly and artistically add a small, semi-transparent watermark with the text "Inkfinity" to the bottom right corner of this image.'},
        ],
        config: {
          responseModalities: ['IMAGE', 'TEXT'],
        },
      });

      if (media?.url) {
          watermarkedImageDataUri = media.url;
      }
    } catch (error) {
      console.warn('Fallo al aplicar marca de agua (posible limitacion de API o modelo). Devolviendo imagen original sin marca.', error);
    }

    return { watermarkedImageDataUri };
  }
);
