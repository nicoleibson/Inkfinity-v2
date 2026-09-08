// src/ai/agents/verify-face-agent.ts
'use server';
/**
 * @fileOverview Defines the AI agent for facial comparison using Gemini 2.5 Flash-Lite.
 */

import {ai} from '@/ai/genkit';
import { VerifyFaceInputSchema, VerifyFaceOutputSchema } from '@/ai/schemas/verify-face-schema';


const prompt = ai.definePrompt({
  name: 'verifyFacePrompt',
  model: 'googleai/gemini-3.5-flash-lite',
  input: {schema: VerifyFaceInputSchema},
  output: {schema: VerifyFaceOutputSchema},
  prompt: `You are a highly advanced AI security expert specializing in biometric face verification. Your task is to determine if the person in the live captures is the same person as in the registered facial scan.

You will be given one registered facial scan and three live camera captures taken moments apart. Compare them meticulously and check that the three live captures all show the SAME person consistently.

Analyze facial features, structure, and unique identifiers. Account for minor variations in lighting, angle, and expression, but be strict about identity. If the live frames show different people from each other, fail the verification.

Set isMatch to true only if the live captures clearly show the registered user. Otherwise set isMatch to false.

Set confidence to a number from 0 to 1 reflecting how certain you are. Use high confidence (0.9+) only for clear, well-lit evidence. Use lower confidence for blurry, dark, or ambiguous frames.

Registered Facial Scan:
{{media url=registeredImageUrl}}

Live Camera Captures (chronological order):
{{media url=liveCaptureDataUri}}
{{media url=liveCaptureFrame2}}
{{media url=liveCaptureFrame3}}
`,
});

export const verifyFaceFlow = ai.defineFlow(
  {
    name: 'verifyFaceFlow',
    inputSchema: VerifyFaceInputSchema,
    outputSchema: VerifyFaceOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    return output!;
  }
);
