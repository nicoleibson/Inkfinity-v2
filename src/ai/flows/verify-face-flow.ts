
'use server';
/**
 * @fileOverview Provides a function to verify a user's identity via facial comparison using an AI agent.
 *
 * - verifyFace - A function that handles the face verification process.
 * - VerifyFaceInput - The input type for the verifyFace function.
 * - VerifyFaceOutput - The return type for the verifyFace function.
 */

import { verifyFaceFlow } from '@/ai/agents/verify-face-agent';
import type { VerifyFaceInput, VerifyFaceOutput } from '@/ai/schemas/verify-face-schema';

export async function verifyFace(
  input: VerifyFaceInput
): Promise<VerifyFaceOutput> {
  return verifyFaceFlow(input);
}
