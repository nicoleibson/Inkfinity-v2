// src/ai/schemas/watermark-image-schema.ts
import { z } from 'genkit';

export const WatermarkImageInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "A photo of the artwork, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type WatermarkImageInput = z.infer<typeof WatermarkImageInputSchema>;

export const WatermarkImageOutputSchema = z.object({
    watermarkedImageDataUri: z
    .string()
    .describe(
      "The watermarked artwork image, as a data URI."
    ),
});
export type WatermarkImageOutput = z.infer<typeof WatermarkImageOutputSchema>;
