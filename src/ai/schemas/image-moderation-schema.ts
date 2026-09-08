// src/ai/schemas/image-moderation-schema.ts
import { z } from 'genkit';

export const ModerateImageInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo to be scanned for inappropriate content, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ModerateImageInput = z.infer<typeof ModerateImageInputSchema>;

export const ModerateImageOutputSchema = z.object({
  isSafe: z.boolean().describe('Whether the image is safe or not.'),
  reason: z.string().describe('The reason why the image is not safe, if applicable.'),
});
export type ModerateImageOutput = z.infer<typeof ModerateImageOutputSchema>;
