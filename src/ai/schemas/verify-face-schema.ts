// src/ai/schemas/verify-face-schema.ts
import { z } from 'genkit';

export const VerifyFaceInputSchema = z.object({
  registeredImageUrl: z
    .string()
    .describe(
      "The user's securely stored, registered facial scan URL."
    ),
  liveCaptureDataUri: z
    .string()
    .describe(
      "The first live camera capture of the user, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  liveCaptureFrame2: z
    .string()
    .describe(
      "A second live camera capture taken a moment later (chronologically after the first), as a data URI. Same expected format as liveCaptureDataUri."
    ),
  liveCaptureFrame3: z
    .string()
    .describe(
      "A third live camera capture taken a moment later (chronologically after the second), as a data URI. Same expected format as liveCaptureDataUri."
    ),
});
export type VerifyFaceInput = z.infer<typeof VerifyFaceInputSchema>;

export const VerifyFaceOutputSchema = z.object({
  isMatch: z
    .boolean()
    .describe(
      'Whether the face in the live captures matches the face in the registered facial scan.'
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'A number from 0 to 1 representing how confident you are in your isMatch verdict. 1 means completely certain (clear, high-quality match), low values mean uncertain, blurry, or ambiguous evidence.'
    ),
  reason: z
    .string()
    .describe('The reason for the verification result.'),
});
export type VerifyFaceOutput = z.infer<typeof VerifyFaceOutputSchema>;
