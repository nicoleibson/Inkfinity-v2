'use server';
/**
 * @fileOverview Defines the AI agent for verifying NFT ownership.
 *
 * This file contains the Genkit flow and tool that check token ownership
 * directly on-chain (reads the contract's ownerOf/balanceOf).
 */

import { ai } from '@/ai/genkit';
import { VerifyNftOwnershipInputSchema, VerifyNftOwnershipOutputSchema } from '@/ai/schemas/verify-nft-ownership-schema';
import { verifyOwnershipOnChain } from '@/lib/nft-verification';

/**
 * A tool that queries the blockchain in real time to verify NFT ownership.
 * Supports ERC-721 (ownerOf) and ERC-1155 (balanceOf).
 */
const isNftOwner = ai.defineTool(
  {
    name: 'isNftOwner',
    description: 'Checks if a given wallet address is the owner of a specific NFT on-chain.',
    inputSchema: VerifyNftOwnershipInputSchema,
    outputSchema: VerifyNftOwnershipOutputSchema,
  },
  async (input) => {
    console.log(
      `Checking on-chain ownership for token ${input.tokenId} (${input.contractAddress}) on ${input.network || 'amoy'} for wallet ${input.walletAddress}...`
    );
    const result = await verifyOwnershipOnChain(input);
    return {
      isOwner: result.isOwner,
      reason: result.reason,
      network: input.network || 'amoy',
      standard: result.standard,
      onChainOwner: result.onChainOwner,
    };
  }
);


export const verifyNftOwnershipFlow = ai.defineFlow(
  {
    name: 'verifyNftOwnershipFlow',
    inputSchema: VerifyNftOwnershipInputSchema,
    outputSchema: VerifyNftOwnershipOutputSchema,
  },
  async (input) => {
    // The verification is a direct, deterministic on-chain read - no LLM is
    // required. Kept as a flow for consistency with the rest of the AI module.
    return await isNftOwner(input);
  }
);