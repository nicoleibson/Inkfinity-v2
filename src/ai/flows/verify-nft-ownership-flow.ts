
'use server';
/**
 * @fileOverview Provides a function to verify NFT ownership using an AI agent.
 * 
 * - verifyNftOwnership - A function that handles the NFT ownership verification process.
 * - VerifyNftOwnershipInput - The input type for the verifyNftOwnership function.
 * - VerifyNftOwnershipOutput - The return type for the verifyNftOwnership function.
 */
import { verifyNftOwnershipFlow } from '@/ai/agents/verify-nft-ownership-agent';
import { VerifyNftOwnershipInput, VerifyNftOwnershipOutput } from '@/ai/schemas/verify-nft-ownership-schema';


export async function verifyNftOwnership(input: VerifyNftOwnershipInput): Promise<VerifyNftOwnershipOutput> {
  return verifyNftOwnershipFlow(input);
}
