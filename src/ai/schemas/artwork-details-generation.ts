// src/ai/schemas/artwork-details-generation.ts
import { z } from 'genkit';

export const ArtworkDetailsInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "A photo of the artwork, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ArtworkDetailsInput = z.infer<typeof ArtworkDetailsInputSchema>;

export const ArtworkDetailsOutputSchema = z.object({
  title: z
    .string()
    .describe('A creative and fitting title for the artwork. Should be concise and evocative.'),
  description: z
    .string()
    .describe('A compelling, professional description of the artwork. Highlight the style, subject, and mood. (2-3 sentences).'),
  tags: z
    .array(z.string())
    .describe('An array of 3-5 relevant tags for the artwork. Include style, theme, and key elements.'),
});
export type ArtworkDetailsOutput = z.infer<typeof ArtworkDetailsOutputSchema>;
